"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { STALE } from "@/lib/query-stale";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

type NotifRow = {
  id: number;
  title: string;
  body: string | null;
  link_href: string | null;
  read_at: string | null;
  created_at: string;
};

export function NotificationBell({ tenantSlug }: { tenantSlug: string | null }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const authHydrated = useAuthStoreHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const q = useQuery({
    queryKey: ["notifications", tenantSlug],
    enabled: Boolean(tenantSlug) && authHydrated && Boolean(accessToken?.trim()),
    staleTime: STALE.live,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await api.get<{ data: NotifRow[]; unread_count: number }>(
        `/api/${tenantSlug}/notifications?limit=30`
      );
      return data;
    }
  });

  const readOne = useMutation({
    mutationFn: async (id: number) => {
      await api.patch(`/api/${tenantSlug}/notifications/${id}/read`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["notifications", tenantSlug] });
    }
  });

  const readAll = useMutation({
    mutationFn: async () => {
      await api.post(`/api/${tenantSlug}/notifications/read-all`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["notifications", tenantSlug] });
    }
  });

  const closeOnOutside = useCallback((e: MouseEvent) => {
    if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.addEventListener("click", closeOnOutside);
    return () => document.removeEventListener("click", closeOnOutside);
  }, [open, closeOnOutside]);

  if (!tenantSlug) return null;

  const unread = q.data?.unread_count ?? 0;
  const items = q.data?.data ?? [];

  return (
    <div className="relative" ref={panelRef}>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="relative h-9 w-9 border-sidebar-border/80 bg-sidebar-accent/30 text-sidebar-foreground"
        aria-label="Уведомления"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <Bell className="size-4" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </Button>
      {open ? (
        <div
          className="absolute bottom-full left-1/2 z-50 mb-2 w-[min(100vw-2rem,20rem)] -translate-x-1/2 rounded-lg border border-border bg-popover p-2 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">Уведомления</span>
            {unread > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                disabled={readAll.isPending}
                onClick={() => void readAll.mutate()}
              >
                Прочитать все
              </Button>
            ) : null}
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto text-xs">
            {q.isLoading ? (
              <p className="px-2 py-4 text-center text-muted-foreground">Загрузка…</p>
            ) : items.length === 0 ? (
              <p className="px-2 py-4 text-center text-muted-foreground">Пока пусто</p>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "rounded-md border border-transparent px-2 py-1.5",
                    !n.read_at && "bg-muted/50"
                  )}
                >
                  {n.link_href ? (
                    <Link
                      href={n.link_href}
                      className="block font-medium text-primary hover:underline"
                      onClick={() => {
                        if (!n.read_at) void readOne.mutate(n.id);
                        setOpen(false);
                      }}
                    >
                      {n.title}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="w-full text-left font-medium"
                      onClick={() => {
                        if (!n.read_at) void readOne.mutate(n.id);
                      }}
                    >
                      {n.title}
                    </button>
                  )}
                  {n.body ? <p className="mt-0.5 text-muted-foreground">{n.body}</p> : null}
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {new Date(n.created_at).toLocaleString("ru-RU")}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
