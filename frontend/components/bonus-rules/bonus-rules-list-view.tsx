"use client";

import type { BonusRuleRow } from "@/components/bonus-rules/bonus-rule-types";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/ui/filter-select";
import { cn } from "@/lib/utils";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { TableColumnSettingsDialog } from "@/components/data-table/table-column-settings-dialog";
import { TableRowActionGroup } from "@/components/data-table/table-row-actions";
import { useUserTablePrefs } from "@/hooks/use-user-table-prefs";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListOrdered, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type ListResponse = {
  data: BonusRuleRow[];
  total: number;
  page: number;
  limit: number;
};

export function ruleSummary(r: BonusRuleRow): string {
  if (r.type === "qty" && r.conditions?.length) {
    return r.conditions
      .map((c) => {
        const range =
          c.min_qty != null || c.max_qty != null
            ? `${c.min_qty ?? "—"}…${c.max_qty ?? "—"}: `
            : "";
        return `${range}har ${c.step_qty}→+${c.bonus_qty}${c.max_bonus_qty != null ? ` (≤${c.max_bonus_qty})` : ""}`;
      })
      .join("; ");
  }
  if (r.type === "qty") {
    return `${r.buy_qty ?? "—"} + ${r.free_qty ?? "—"} bonus`;
  }
  if (r.type === "sum") {
    return `min ${r.min_sum ?? "—"}`;
  }
  if (r.type === "discount") {
    return `${r.discount_pct ?? "—"}%`;
  }
  return r.type;
}

type Props = {
  /** true = faqat faol, false = faqat nofaol */
  activeOnly: boolean;
};

const BONUS_RULE_DATA_COLUMNS = [
  { id: "name", label: "Nomi" },
  { id: "type", label: "Tur" },
  { id: "summary", label: "Shart" },
  { id: "priority", label: "Ustunlik" },
  { id: "active", label: "Faol" }
] as const;

export function BonusRulesListView({ activeOnly }: Props) {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const authHydrated = useAuthStoreHydrated();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);

  const bonusTableId = activeOnly ? "bonus_rules.list.active.v1" : "bonus_rules.list.inactive.v1";
  const tablePrefs = useUserTablePrefs({
    tenantSlug,
    tableId: bonusTableId,
    defaultColumnOrder: BONUS_RULE_DATA_COLUMNS.map((c) => c.id),
    defaultPageSize: 50,
    allowedPageSizes: [25, 50, 100]
  });
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [previewRuleId, setPreviewRuleId] = useState<number | null>(null);
  const [previewQty, setPreviewQty] = useState("12");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewOut, setPreviewOut] = useState<{
    bonus_qty: number;
    matched: boolean;
    in_blocks: boolean;
  } | null>(null);

  const filterKey = activeOnly ? "active" : "inactive";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["bonus-rules", tenantSlug, filterKey, page],
    enabled: Boolean(tenantSlug),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: "50",
        is_active: activeOnly ? "true" : "false"
      });
      const { data: body } = await api.get<ListResponse>(`/api/${tenantSlug}/bonus-rules?${params.toString()}`);
      return body;
    }
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/${tenantSlug}/bonus-rules/${id}`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bonus-rules", tenantSlug] });
    }
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      setTogglingId(id);
      await api.patch(`/api/${tenantSlug}/bonus-rules/${id}/active`, { is_active });
    },
    onSettled: async () => {
      setTogglingId(null);
      await qc.invalidateQueries({ queryKey: ["bonus-rules", tenantSlug] });
    }
  });

  const rows = data?.data ?? [];
  const qtyRules = activeOnly ? rows.filter((r) => r.type === "qty") : [];

  const title = activeOnly ? "Faol bonus qoidalari" : "Nofaol bonus qoidalari";
  const description = activeOnly
    ? tenantSlug
      ? `Tenant: ${tenantSlug} — hozir ishlatiladigan qoidalar`
      : "Hozir ishlatiladigan qoidalar"
    : tenantSlug
      ? `Tenant: ${tenantSlug} — faolsizlantirilgan qoidalar (is_active=false)`
      : "Faolsizlantirilgan yoki arxivdagi qoidalar";

  return (
    <PageShell>
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/dashboard">
              Boshqaruv
            </Link>
            <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/products">
              Mahsulotlar
            </Link>
          </>
        }
      />

      <TableColumnSettingsDialog
        open={columnDialogOpen}
        onOpenChange={setColumnDialogOpen}
        title="Ustunlarni boshqarish"
        description="Ko‘rinadigan ustunlar va tartib. Sizning akkauntingiz uchun saqlanadi."
        columns={[...BONUS_RULE_DATA_COLUMNS]}
        columnOrder={tablePrefs.columnOrder}
        hiddenColumnIds={tablePrefs.hiddenColumnIds}
        saving={tablePrefs.saving}
        onSave={(next) => tablePrefs.saveColumnLayout(next)}
        onReset={() => tablePrefs.resetColumnLayout()}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Link className={cn(buttonVariants({ size: "sm" }))} href="/bonus-rules/new">
          Yangi qoida
        </Link>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 px-2 text-xs"
          title="Ustunlar"
          onClick={() => setColumnDialogOpen(true)}
        >
          <ListOrdered className="size-3.5" />
          Ustunlar
        </Button>
        {data ? (
          <span className="self-center text-sm text-muted-foreground">
            Jami: <span className="font-medium text-foreground">{data.total}</span>
          </span>
        ) : null}
      </div>

      {tenantSlug && activeOnly && qtyRules.length > 0 ? (
        <Card className="shadow-panel">
          <CardContent className="space-y-3 p-4 text-sm">
            <p className="font-medium">Miqdor bo‘yicha sinov (API: preview-qty)</p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">Qoida</span>
                <FilterSelect
                  className="h-10 min-w-[12rem] max-w-[20rem] rounded-lg border border-input bg-background px-2"
                  emptyLabel="Qoida"
                  aria-label="Qoida"
                  value={previewRuleId != null ? String(previewRuleId) : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPreviewRuleId(v ? Number(v) : null);
                    setPreviewOut(null);
                  }}
                >
                  {qtyRules.map((r) => (
                    <option key={r.id} value={String(r.id)}>
                      {r.name}
                    </option>
                  ))}
                </FilterSelect>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">Sotib olingan miqdor</span>
                <Input
                  className="w-28"
                  type="number"
                  min={0}
                  value={previewQty}
                  onChange={(e) => setPreviewQty(e.target.value)}
                />
              </label>
              <Button
                type="button"
                size="sm"
                disabled={previewRuleId == null || previewLoading}
                onClick={async () => {
                  if (previewRuleId == null || !tenantSlug) return;
                  const n = Number.parseInt(previewQty, 10);
                  if (Number.isNaN(n) || n < 0) return;
                  setPreviewLoading(true);
                  setPreviewOut(null);
                  try {
                    const { data: body } = await api.post<{
                      bonus_qty: number;
                      matched: boolean;
                      in_blocks: boolean;
                    }>(`/api/${tenantSlug}/bonus-rules/${previewRuleId}/preview-qty`, {
                      purchased_qty: n
                    });
                    setPreviewOut({
                      bonus_qty: body.bonus_qty,
                      matched: body.matched,
                      in_blocks: body.in_blocks
                    });
                  } catch {
                    setPreviewOut(null);
                  } finally {
                    setPreviewLoading(false);
                  }
                }}
              >
                Hisoblash
              </Button>
              {previewOut ? (
                <p className="text-muted-foreground">
                  Bonus miqdori:{" "}
                  <span className="font-semibold text-foreground">{previewOut.bonus_qty}</span>
                  {previewOut.matched ? null : (
                    <span className="ml-1">(hech qanday shart qatori mos emas)</span>
                  )}
                  <span className="ml-2 text-xs">in_blocks={previewOut.in_blocks ? "ha" : "yo‘q"}</span>
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!authHydrated ? (
        <p className="text-sm text-muted-foreground">Sessiya yuklanmoqda…</p>
      ) : !tenantSlug ? (
        <p className="text-sm text-destructive">
          Tenant topilmadi.{" "}
          <Link className="underline underline-offset-4" href="/login">
            Qayta kiring
          </Link>
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">
          Xato: {error instanceof Error ? error.message : "API ga ulanib bo‘lmadi"}
        </p>
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b bg-muted/60">
                  <tr>
                    {tablePrefs.visibleColumnOrder.map((colId) => {
                      const meta = BONUS_RULE_DATA_COLUMNS.find((c) => c.id === colId);
                      return (
                        <th key={colId} className="px-3 py-2 font-medium">
                          {meta?.label ?? colId}
                        </th>
                      );
                    })}
                    <th className="px-3 py-2 text-right font-medium">Amallar</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={tablePrefs.visibleColumnOrder.length + 1}
                        className="px-3 py-8 text-center text-muted-foreground"
                      >
                        {activeOnly ? "Faol qoida yo‘q" : "Nofaol qoida yo‘q"}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id} className="border-b last:border-0">
                        {tablePrefs.visibleColumnOrder.map((colId) => (
                          <td key={colId} className="px-3 py-2">
                            {colId === "name" ? (
                              <span className="font-medium">{row.name}</span>
                            ) : colId === "type" ? (
                              <span className="text-muted-foreground">{row.type}</span>
                            ) : colId === "summary" ? (
                              <span className="font-mono text-xs">{ruleSummary(row)}</span>
                            ) : colId === "priority" ? (
                              row.priority
                            ) : colId === "active" ? (
                              <input
                                type="checkbox"
                                checked={row.is_active}
                                disabled={toggleMut.isPending && togglingId === row.id}
                                onChange={(e) => {
                                  toggleMut.mutate({ id: row.id, is_active: e.target.checked });
                                }}
                                aria-label={`${row.name} faolligi`}
                              />
                            ) : null}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right">
                          <TableRowActionGroup className="justify-end" ariaLabel="Qoida">
                            <Link
                              href={`/bonus-rules/${row.id}/edit`}
                              className={cn(
                                buttonVariants({ variant: "outline", size: "icon-sm" }),
                                "text-muted-foreground hover:text-foreground"
                              )}
                              title="Tahrirlash"
                              aria-label="Tahrirlash"
                            >
                              <Pencil className="size-3.5" aria-hidden />
                            </Link>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              disabled={deleteMut.isPending}
                              title="O‘chirish (nofaol)"
                              aria-label="O‘chirish (nofaol)"
                              onClick={() => {
                                if (!window.confirm(`“${row.name}” ni o‘chirish (nofaol)?`)) return;
                                deleteMut.mutate(row.id);
                              }}
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </Button>
                          </TableRowActionGroup>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {data && data.total > data.limit ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Oldingi
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {Math.ceil(data.total / data.limit) || 1}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page * data.limit >= data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Keyingi
          </Button>
        </div>
      ) : null}
    </PageShell>
  );
}
