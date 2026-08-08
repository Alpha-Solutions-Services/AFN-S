"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NotificationsBell } from "@/components/NotificationsBell";
import { createClient } from "@/lib/supabase/client";
import type { AppRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; exact?: boolean };

function navForRole(role: AppRole | null): NavItem[] {
  const isAgent = role === "agent";
  const isManagerOrLead = !role || role === "manager" || role === "team_lead";
  const items: NavItem[] = [
    { href: "/dashboard", label: "Overview", exact: true },
    { href: "/dashboard/calls", label: "Call Queue" },
    { href: "/dashboard/companies", label: "Companies" },
  ];
  if (!isAgent) items.push({ href: "/dashboard/campaigns", label: "Campaigns" });
  items.push({ href: "/dashboard/leads", label: "Pipeline" });
  items.push({ href: "/dashboard/team", label: "Team" });
  if (isManagerOrLead) items.push({ href: "/dashboard/people", label: "People" });
  if (!isAgent) items.push({ href: "/dashboard/settings", label: "Settings" });
  return items;
}

export function DashboardShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<AppRole | null>(null);
  const [blocked, setBlocked] = useState<{ ip: string | null } | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const storedId = sessionStorage.getItem("afn_session_id");
    const storedRole = sessionStorage.getItem("afn_role");
    if (storedRole) setRole(storedRole as AppRole);
    if (storedId) sessionIdRef.current = storedId;

    // Only start a session once per browser tab session (avoids spamming
    // attendance rows on every client-side navigation).
    if (!storedId) {
      (async () => {
        try {
          const res = await fetch("/api/auth/session-start", { method: "POST" });
          const data = await res.json().catch(() => ({}));
          if (cancelled) return;
          if (res.status === 403 && data?.blocked) {
            setBlocked({ ip: data.ip ?? null });
            const supabase = createClient();
            if (supabase) await supabase.auth.signOut();
            return;
          }
          if (data?.sessionId) {
            sessionIdRef.current = data.sessionId;
            sessionStorage.setItem("afn_session_id", data.sessionId);
          }
          if (data?.profile?.role) {
            setRole(data.profile.role as AppRole);
            sessionStorage.setItem("afn_role", data.profile.role);
          }
        } catch {
          // fail open — never lock out on a transient error
        }
      })();
    }

    const endSession = () => {
      const id = sessionIdRef.current;
      if (!id) return;
      const body = JSON.stringify({ sessionId: id });
      navigator.sendBeacon?.(
        "/api/auth/session-end",
        new Blob([body], { type: "application/json" })
      );
    };
    window.addEventListener("beforeunload", endSession);
    return () => {
      cancelled = true;
      window.removeEventListener("beforeunload", endSession);
    };
  }, []);

  async function signOut() {
    try {
      if (sessionIdRef.current) {
        await fetch("/api/auth/session-end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sessionIdRef.current }),
        });
      }
    } catch {
      // ignore
    }
    sessionStorage.removeItem("afn_session_id");
    sessionStorage.removeItem("afn_role");
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (blocked) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="panel max-w-md p-8 text-center">
          <p className="data-label text-danger">Login blocked</p>
          <h1 className="mt-2 text-lg font-semibold text-text">
            Not on an approved office network
          </h1>
          <p className="mt-3 text-sm text-muted">
            Your sign-in was blocked because your IP
            {blocked.ip ? ` (${blocked.ip})` : ""} isn’t on the office allowlist.
            Ask a manager to approve this network, then sign in again.
          </p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="btn-secondary mt-6"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  const nav = navForRole(role);

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-panel">
        <div className="border-b border-border px-4 py-5">
          <p className="font-mono text-xs uppercase tracking-widest text-muted">
            Alpha Sales Point
          </p>
          <p className="mt-1 text-sm font-medium text-text">Sales CRM</p>
          {role ? (
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-accent">
              {role.replace("_", " ")}
            </p>
          ) : null}
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {nav.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-bg font-medium text-accent"
                    : "text-muted hover:bg-bg hover:text-text"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={signOut}
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-bg hover:text-text"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-8 py-5">
          <h1 className="text-lg font-semibold text-text">{title}</h1>
          <NotificationsBell />
        </header>
        <div className="flex-1 p-8">{children}</div>
      </main>
    </div>
  );
}
