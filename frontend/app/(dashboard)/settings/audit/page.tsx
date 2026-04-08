"use client";

import { TableColumnSettingsDialog } from "@/components/data-table/table-column-settings-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { useUserTablePrefs } from "@/hooks/use-user-table-prefs";
import { useQuery } from "@tanstack/react-query";
import { ListOrdered } from "lucide-react";
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

const AUDIT_COLUMN_META = [
  { id: "created_at", label: "Vaqt" },
  { id: "actor", label: "Kim" },
  { id: "object", label: "Obyekt" },
  { id: "action", label: "Harakat" },
  { id: "payload", label: "Payload" }
] as const;

export default function AuditJournalPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const role = useEffectiveRole();
  const hydrated = useAuthStoreHydrated();
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);

  const tablePrefs = useUserTablePrefs({
    tenantSlug,
    tableId: "audit.journal.v1",
    defaultColumnOrder: [...AUDIT_COLUMN_META.map((c) => c.id)],
    defaultPageSize: 40,
    allowedPageSizes: [20, 40, 80, 100]
  });

  const queryKey = useMemo(
    () => ["audit-events", tenantSlug, page, entityType, entityId, tablePrefs.pageSize],
    [tenantSlug, page, entityType, entityId, tablePrefs.pageSize]
  );

  const q = useQuery({
    queryKey,
    enabled: Boolean(tenantSlug) && hydrated && role === "admin",
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(tablePrefs.pageSize));
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
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
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
    <div className="flex w-full min-w-0 max-w-none flex-col gap-6">
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
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Satr/sahifa</span>
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={tablePrefs.pageSize}
            onChange={(e) => {
              tablePrefs.setPageSize(Number.parseInt(e.target.value, 10));
              setPage(1);
            }}
          >
            {[20, 40, 80, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1"
          onClick={() => setColumnDialogOpen(true)}
        >
          <ListOrdered className="size-3.5" />
          Ustunlar
        </Button>
      </div>

      <TableColumnSettingsDialog
        open={columnDialogOpen}
        onOpenChange={setColumnDialogOpen}
        title="Ustunlarni boshqarish"
        description="Ko‘rinadigan ustunlar va tartib. Sizning akkauntingiz uchun saqlanadi."
        columns={[...AUDIT_COLUMN_META]}
        columnOrder={tablePrefs.columnOrder}
        hiddenColumnIds={tablePrefs.hiddenColumnIds}
        saving={tablePrefs.saving}
        onSave={(next) => tablePrefs.saveColumnLayout(next)}
        onReset={() => tablePrefs.resetColumnLayout()}
      />

      {q.isError && (
        <p className="text-sm text-destructive">Yuklashda xato — tarmoq yoki ruxsatni tekshiring.</p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="app-table-thead">
            <tr>
              {tablePrefs.visibleColumnOrder.map((colId) => {
                const meta = AUDIT_COLUMN_META.find((c) => c.id === colId);
                return (
                  <th key={colId} className="px-3 py-2 font-medium">
                    {meta?.label ?? colId}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr>
                <td
                  colSpan={Math.max(1, tablePrefs.visibleColumnOrder.length)}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  Загрузка…
                </td>
              </tr>
            ) : (
              (q.data?.data ?? []).map((row) => (
                <tr key={row.id} className="border-b border-border/80 last:border-0">
                  {tablePrefs.visibleColumnOrder.map((colId) => (
                    <td key={colId} className="px-3 py-2">
                      {colId === "created_at" ? (
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(row.created_at).toLocaleString()}
                        </span>
                      ) : colId === "actor" ? (
                        <>
                          {row.actor_login ?? "—"}
                          {row.actor_user_id != null ? (
                            <span className="ml-1 text-xs text-muted-foreground">#{row.actor_user_id}</span>
                          ) : null}
                        </>
                      ) : colId === "object" ? (
                        <>
                          <span className="font-mono text-xs">{row.entity_type}</span>
                          <span className="text-muted-foreground"> / </span>
                          <span className="font-mono text-xs">{row.entity_id}</span>
                        </>
                      ) : colId === "action" ? (
                        <span className="font-mono text-xs">{row.action}</span>
                      ) : colId === "payload" ? (
                        <span className="max-w-[240px] truncate font-mono text-[11px] text-muted-foreground">
                          {JSON.stringify(row.payload)}
                        </span>
                      ) : null}
                    </td>
                  ))}
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
