"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { IconBell } from "@/lib/icons";
import { cn } from "@/lib/utils";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

type NotificationsResponse = {
  data: {
    items: NotificationItem[];
    unreadCount: number;
  };
};

function formatNotificationWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/notifications?limit=20");
      if (!response.ok) {
        throw new Error("Could not load notifications.");
      }

      const payload = (await response.json()) as NotificationsResponse;
      setItems(payload.data.items);
      setUnreadCount(payload.data.unreadCount);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Could not load notifications.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (open) {
      void loadNotifications();
    }
  }, [open, loadNotifications]);

  async function markRead(notificationId: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === notificationId && !item.readAt
          ? { ...item, readAt: new Date().toISOString() }
          : item,
      ),
    );
    setUnreadCount((count) => Math.max(0, count - 1));

    try {
      await fetch(`/api/notifications/${notificationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });
    } catch {
      void loadNotifications();
    }
  }

  async function markAllRead() {
    setItems((current) =>
      current.map((item) => ({
        ...item,
        readAt: item.readAt ?? new Date().toISOString(),
      })),
    );
    setUnreadCount(0);

    try {
      await fetch("/api/notifications", { method: "PATCH" });
    } catch {
      void loadNotifications();
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-[var(--color-muted)] focus-ring text-[var(--color-ink-soft)]"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <IconBell size={17} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-2 w-1.5 h-1.5 bg-[var(--color-brand-600)] rounded-full" />
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            className="absolute right-0 top-[44px] z-50 w-[340px] rounded-lg border border-[var(--color-line)] bg-white shadow-[var(--shadow-lg)]"
          >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--color-line)] px-3 py-2.5">
              <p className="text-[13px] font-semibold text-[var(--color-ink)]">Notifications</p>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className="text-[12px] text-[var(--color-brand-700)] hover:underline focus-ring rounded"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-[360px] overflow-y-auto p-1.5">
              {loading && items.length === 0 ? (
                <p className="px-2.5 py-6 text-center text-[13px] text-[var(--color-ink-muted)]">
                  Loading…
                </p>
              ) : error ? (
                <p className="px-2.5 py-6 text-center text-[13px] text-[var(--color-danger-fg)]">
                  {error}
                </p>
              ) : items.length === 0 ? (
                <p className="px-2.5 py-6 text-center text-[13px] text-[var(--color-ink-muted)]">
                  No notifications yet
                </p>
              ) : (
                items.map((item) => {
                  const content = (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={cn(
                            "text-[13px] leading-snug text-[var(--color-ink)]",
                            !item.readAt && "font-semibold",
                          )}
                        >
                          {item.title}
                        </p>
                        {!item.readAt && (
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand-600)]" />
                        )}
                      </div>
                      {item.body && (
                        <p className="mt-0.5 line-clamp-2 text-[12px] text-[var(--color-ink-muted)]">
                          {item.body}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-[var(--color-ink-muted)]">
                        {formatNotificationWhen(item.createdAt)}
                      </p>
                    </>
                  );

                  const className = cn(
                    "block w-full rounded-md px-2.5 py-2 text-left hover:bg-[var(--color-muted)] focus-ring",
                    !item.readAt && "bg-[var(--color-muted)]/40",
                  );

                  if (item.href) {
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        role="menuitem"
                        className={className}
                        onClick={() => {
                          void markRead(item.id);
                          setOpen(false);
                        }}
                      >
                        {content}
                      </Link>
                    );
                  }

                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      className={className}
                      onClick={() => void markRead(item.id)}
                    >
                      {content}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
