"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

type AuditRow = {
  id: number;
  entity_type: string;
  entity_id: string;
  action: string;
  payload: unknown;
  actor_user_id: number | null;
  actor_login: string | null;
  created_at: string;
};

export default function AuditJournalPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const role = useEffectiveRole();
  const hydrated = useAuthStoreHydrated();
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");

  const queryKey = useMemo(
    () => ["audit-events", tenantSlug, page, entityType, entityId],
    [tenantSlug, page, entityType, entityId]
  );

  const q = useQuery({
    queryKey,
    enabled: Boolean(tenantSlug) && hydrated && role === "admin",
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "40");
      if (entityType.trim()) params.set("entity_type", entityType.trim());
      if (entityId.trim()) params.set("entity_id", entityId.trim());
      const { data } = await api.get<{
        data: AuditRow[];
        total: number;
        page: number;
        limit: number;
      }>(`/api/${tenantSlug}/audit-events?${params.toString()}`);
      return data;
    }
  });

  if (!hydrated) {
    return <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>;
  }

  if (role !== "admin") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Bu sahifa faqat administrator uchun.</p>
        <Link href="/settings/company" className="text-sm text-primary underline">
          Sozlamalar
        </Link>
      </div>
    );
  }

  const totalPages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.limit)) : 1;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <Link href="/settings/company" className="text-sm text-primary underline">
          ← Kompaniya
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Audit jurnal</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kim, qachon, qaysi obyekt bo‘yicha qanday harakat — yagona jurnal.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">entity_type</label>
          <Input
            placeholder="masalan: client, user"
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setPage(1);
            }}
            className="w-44"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">entity_id</label>
          <Input
            placeholder="ID"
            value={entityId}
            onChange={(e) => {
              setEntityId(e.target.value);
              setPage(1);
            }}
            className="w-32"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setEntityType("");
            setEntityId("");
            setPage(1);
          }}
        >
          Tozalash
        </Button>
      </div>

      {q.isError && (
        <p className="text-sm text-destructive">Yuklashda xato — tarmoq yoki ruxsatni tekshiring.</p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th className="px-3 py-2 font-medium">Vaqt</th>
              <th className="px-3 py-2 font-medium">Kim</th>
              <th className="px-3 py-2 font-medium">Obyekt</th>
              <th className="px-3 py-2 font-medium">Harakat</th>
              <th className="px-3 py-2 font-medium">Payload</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Yuklanmoqda…
                </td>
              </tr>
            ) : (
              (q.data?.data ?? []).map((row) => (
                <tr key={row.id} className="border-b border-border/80 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    {row.actor_login ?? "—"}
                    {row.actor_user_id != null ? (
                      <span className="ml-1 text-xs text-muted-foreground">#{row.actor_user_id}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs">{row.entity_type}</span>
                    <span className="text-muted-foreground"> / </span>
                    <span className="font-mono text-xs">{row.entity_id}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{row.action}</td>
                  <td className="max-w-[240px] truncate px-3 py-2 font-mono text-[11px] text-muted-foreground">
                    {JSON.stringify(row.payload)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Jami: {q.data?.total ?? "—"} · Sahifa {page} / {totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Oldingi
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Keyingi
          </Button>
        </div>
      </div>
    </div>
  );
}
