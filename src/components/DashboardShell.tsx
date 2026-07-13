"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Overview", exact: true },
  { href: "/dashboard/companies", label: "Companies" },
  { href: "/dashboard/campaigns", label: "Campaigns" },
  { href: "/dashboard/leads", label: "Pipeline" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function DashboardShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-panel">
        <div className="border-b border-border px-4 py-5">
          <p className="font-mono text-xs uppercase tracking-widest text-muted">
            Alpha Sales Point
          </p>
          <p className="mt-1 text-sm font-medium text-text">Sales CRM</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV.map((item) => {
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
        <header className="border-b border-border px-8 py-5">
          <h1 className="text-lg font-semibold text-text">{title}</h1>
        </header>
        <div className="flex-1 p-8">{children}</div>
      </main>
    </div>
  );
}
