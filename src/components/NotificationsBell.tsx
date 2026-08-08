"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
};

const POLL_MS = 30_000;

export function NotificationsBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const lastSeenId = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        notifications: Notification[];
        unread: number;
      };
      setItems(data.notifications);
      setUnread(data.unread);

      // Toast the newest unseen open-alert
      const newest = data.notifications[0];
      if (
        newest &&
        newest.id !== lastSeenId.current &&
        !newest.read_at &&
        lastSeenId.current !== null
      ) {
        showToast(newest.title);
      }
      if (newest) lastSeenId.current = newest.id;
    } catch {
      // ignore transient poll errors
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  async function markAll() {
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => undefined);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open && unread > 0) markAll();
        }}
        className="relative rounded-lg border border-border bg-panel px-3 py-2 text-sm text-muted transition-colors hover:text-text"
        aria-label="Notifications"
      >
        Alerts
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-black">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-panel shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className="text-xs font-medium uppercase tracking-widest text-muted">
              Alerts
            </span>
            <button
              type="button"
              onClick={markAll}
              className="text-xs text-muted hover:text-text"
            >
              Mark all read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">
                No alerts yet. Opens and replies show up here.
              </p>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  className={`border-b border-border px-4 py-3 ${
                    n.read_at ? "opacity-60" : ""
                  }`}
                >
                  <p className="text-sm font-medium text-text">{n.title}</p>
                  {n.body && <p className="mt-0.5 text-xs text-muted">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-muted">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function showToast(text: string) {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.textContent = `📬 ${text}`;
  el.style.cssText =
    "position:fixed;bottom:24px;right:24px;z-index:9999;background:#111;color:#fff;border:1px solid #333;padding:12px 16px;border-radius:10px;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.4);max-width:320px";
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .4s";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 400);
  }, 6000);
}
