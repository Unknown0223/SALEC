"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { FilterSelect, filterSelectClassName } from "@/components/ui/filter-select";
import { downloadXlsxSheet } from "@/lib/download-xlsx";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { KeyRound, ListOrdered, MonitorSmartphone, Pencil, RefreshCw, UserRoundCheck, UserRoundX } from "lucide-react";
import Link from "next/link";
import { TableColumnSettingsDialog } from "@/components/data-table/table-column-settings-dialog";
import { TableRowActionGroup } from "@/components/data-table/table-row-actions";
import { StaffActiveSessionsDialog } from "@/components/staff/staff-active-sessions-dialog";
import { useUserTablePrefs } from "@/hooks/use-user-table-prefs";

const POSITION_PRESETS_SETTINGS_HREF = "/settings/web-staff-position-presets";

/** Kelajakda JWT `role` kengayganda shu xarita va backend `WEB_PANEL_STAFF_ROLES` ni yangilang. */
const WEB_ACCESS_ROLE_LABELS: Record<string, string> = {
  operator: "Operator"
};

type StaffKind = "agent" | "expeditor" | "supervisor" | "operator";

type WebStaffRow = {
  id: number;
  kind: StaffKind;
  fio: string;
  first_name?: string | null;
  last_name?: string | null;
  middle_name?: string | null;
  login: string;
  phone: string | null;
  email: string | null;
  code: string | null;
  pinfl: string | null;
  branch: string | null;
  position: string | null;
  is_active: boolean;
  can_authorize: boolean;
  app_access: boolean;
  active_session_count: number;
  max_sessions: number;
};

type FilterOptions = { branches: string[]; positions: string[]; position_presets: string[] };

const OPERATOR_TABLE_ID = "staff.operators.v1";

const OPERATOR_COLUMN_IDS = [
  "fio",
  "login",
  "code",
  "pinfl",
  "email",
  "position",
  "kind",
  "phone",
  "branch",
  "active_sessions",
  "max_sessions",
  "app_access",
  "can_authorize"
] as const;

const OPERATOR_COLUMNS = OPERATOR_COLUMN_IDS.map((id) => ({
  id,
  label:
    {
      fio: "F.I.Sh",
      login: "Login",
      code: "Kod",
      pinfl: "PINFL",
      email: "Email",
      position: "Lavozim",
      kind: "Tizim roli",
      phone: "Telefon",
      branch: "Filial",
      active_sessions: "Faol sessiyalar",
      max_sessions: "Maks. sessiya",
      app_access: "Mobil ilova",
      can_authorize: "Kirish"
    }[id] ?? id
}));

function operatorExportCellString(r: WebStaffRow, colId: string): string {
  switch (colId) {
    case "fio":
      return r.fio;
    case "login":
      return r.login;
    case "code":
      return r.code ?? "";
    case "pinfl":
      return r.pinfl ?? "";
    case "email":
      return r.email ?? "";
    case "position":
      return r.position ?? "";
    case "kind":
      return WEB_ACCESS_ROLE_LABELS[r.kind] ?? r.kind;
    case "phone":
      return r.phone ?? "";
    case "branch":
      return r.branch ?? "";
    case "active_sessions":
      return String(r.active_session_count);
    case "max_sessions":
      return String(r.max_sessions);
    case "app_access":
      return r.app_access ? "Ha" : "Yo‘q";
    case "can_authorize":
      return r.can_authorize ? "Ha" : "Yo‘q";
    default:
      return "";
  }
}

function renderOperatorDataCell(colId: string, r: WebStaffRow) {
  switch (colId) {
    case "fio":
      return r.fio;
    case "login":
      return <span className="font-mono text-xs">{r.login}</span>;
    case "code":
      return <span className="text-xs">{r.code ?? "—"}</span>;
    case "pinfl":
      return <span className="text-xs">{r.pinfl ?? "—"}</span>;
    case "email":
      return <span className="text-xs">{r.email ?? "—"}</span>;
    case "position":
      return <span className="text-xs">{r.position?.trim() || "—"}</span>;
    case "kind":
      return (
        <span className="text-xs text-muted-foreground">{WEB_ACCESS_ROLE_LABELS[r.kind] ?? r.kind}</span>
      );
    case "phone":
      return <span className="text-xs">{r.phone ?? "—"}</span>;
    case "branch":
      return <span className="text-xs">{r.branch ?? "—"}</span>;
    case "max_sessions":
      return <span className="text-xs tabular-nums">{r.max_sessions}</span>;
    case "app_access":
      return <span className="text-xs">{r.app_access ? "Ha" : "Yo‘q"}</span>;
    case "can_authorize":
      return <span className="text-xs">{r.can_authorize ? "Ha" : "Yo‘q"}</span>;
    default:
      return "—";
  }
}

type Props = { tenantSlug: string };

export function OperatorsWorkspace({ tenantSlug }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"active" | "inactive">("active");
  const [search, setSearch] = useState("");
  const [filterBranch, setFilterBranch] = useState("");
  const [filterPosition, setFilterPosition] = useState("");
  const [appliedBranch, setAppliedBranch] = useState("");
  const [appliedPosition, setAppliedPosition] = useState("");

  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [editRow, setEditRow] = useState<WebStaffRow | null>(null);
  const [passwordRow, setPasswordRow] = useState<WebStaffRow | null>(null);
  const [bulkRevokeOpen, setBulkRevokeOpen] = useState(false);
  const [bulkLimitsOpen, setBulkLimitsOpen] = useState(false);
  /** Modallarda qulflash: ochilgan paytdagi qatorlar (tanlov yoki joriy ro‘yxat) */
  const [bulkRevokeRows, setBulkRevokeRows] = useState<WebStaffRow[] | null>(null);
  const [bulkLimitsRows, setBulkLimitsRows] = useState<WebStaffRow[] | null>(null);
  const [limitsDraft, setLimitsDraft] = useState<Record<number, number>>({});
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [sessionRow, setSessionRow] = useState<WebStaffRow | null>(null);

  const tablePrefs = useUserTablePrefs({
    tenantSlug,
    tableId: OPERATOR_TABLE_ID,
    defaultColumnOrder: [...OPERATOR_COLUMN_IDS],
    defaultPageSize: 10,
    allowedPageSizes: [10, 20, 25, 50, 100, 500, 1000]
  });
  const pageSize = tablePrefs.pageSize;

  const filterOptsQ = useQuery({
    queryKey: ["operators", tenantSlug, "filter-options"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: FilterOptions }>(
        `/api/${tenantSlug}/operators/meta/filter-options`
      );
      return data.data;
    }
  });

  const listQ = useQuery({
    queryKey: ["operators", tenantSlug, tab, appliedBranch, appliedPosition],
    enabled: Boolean(tenantSlug),
    refetchInterval: 45_000,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("is_active", tab === "active" ? "true" : "false");
      if (appliedBranch.trim()) params.set("branch", appliedBranch.trim());
      if (appliedPosition.trim()) params.set("position", appliedPosition.trim());
      const { data } = await api.get<{ data: WebStaffRow[] }>(
        `/api/${tenantSlug}/operators?${params.toString()}`
      );
      return data.data;
    }
  });

  const bulkRevokeMut = useMutation({
    mutationFn: async (userIds: number[]) => {
      await api.post(`/api/${tenantSlug}/operators/bulk/sessions/revoke`, { user_ids: userIds });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["operators", tenantSlug] });
      setBulkRevokeOpen(false);
      setBulkRevokeRows(null);
      setSelected(new Set());
    }
  });

  const bulkLimitsMut = useMutation({
    mutationFn: async (updates: { user_id: number; max_sessions: number }[]) => {
      await api.post(`/api/${tenantSlug}/operators/bulk/max-sessions`, { updates });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["operators", tenantSlug] });
      setBulkLimitsOpen(false);
      setBulkLimitsRows(null);
      setSelected(new Set());
    }
  });

  const deactivateMut = useMutation({
    mutationFn: async (row: WebStaffRow) => {
      await api.patch(`/api/${tenantSlug}/operators/${row.id}`, {
        is_active: !row.is_active
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["operators", tenantSlug] });
    }
  });

  const rows = useMemo(() => {
    const src = listQ.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return src;
    return src.filter(
      (r) =>
        r.fio.toLowerCase().includes(q) ||
        r.login.toLowerCase().includes(q) ||
        (r.phone ?? "").toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q) ||
        (r.code ?? "").toLowerCase().includes(q) ||
        (r.pinfl ?? "").toLowerCase().includes(q)
    );
  }, [listQ.data, search]);

  const pageRows = useMemo(() => rows.slice(0, pageSize), [rows, pageSize]);

  useEffect(() => {
    setSelected(new Set());
  }, [tab, appliedBranch, appliedPosition]);

  /** Guruh amali: tanlov bo‘lsa faqat tanlanganlar, aks holda joriy jadvaldagi hammasi */
  function computeBulkTargets(): WebStaffRow[] {
    if (selected.size > 0) return rows.filter((r) => selected.has(r.id));
    return rows;
  }

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));

  function toggleAllOnPage() {
    if (allOnPageSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const r of pageRows) next.delete(r.id);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const r of pageRows) next.add(r.id);
        return next;
      });
    }
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openBulkLimits() {
    const targets = computeBulkTargets();
    if (!targets.length) return;
    const draft: Record<number, number> = {};
    for (const r of targets) {
      draft[r.id] = r.max_sessions;
    }
    setLimitsDraft(draft);
    setBulkLimitsRows(targets);
    setBulkLimitsOpen(true);
  }

  function openBulkRevoke() {
    const targets = computeBulkTargets();
    if (!targets.length) return;
    setBulkRevokeRows(targets);
    setBulkRevokeOpen(true);
  }

  function adjustLimit(id: number, delta: number) {
    setLimitsDraft((d) => {
      const cur = d[id] ?? 1;
      const next = Math.min(99, Math.max(1, cur + delta));
      return { ...d, [id]: next };
    });
  }

  function setAllLimitsTo(n: number) {
    if (!Number.isFinite(n) || n < 1 || n > 99) return;
    setLimitsDraft((d) => {
      const next = { ...d };
      for (const id of Object.keys(next).map(Number)) {
        next[id] = n;
      }
      return next;
    });
  }

  function bumpAllLimits(delta: number) {
    setLimitsDraft((d) => {
      const next = { ...d };
      for (const id of Object.keys(next).map(Number)) {
        next[id] = Math.min(99, Math.max(1, (next[id] ?? 1) + delta));
      }
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {rows.length > 0 ? (
        <div className="rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-foreground/90">
          <span className="font-medium text-foreground">Guruh amallari qamrovi: </span>
          {selected.size > 0 ? (
            <>
              <strong>{selected.size}</strong> ta xodim tanlangan — sessiya yopish / limitlar{" "}
              <strong>faqat shu tanlanganlarga</strong> qo‘llanadi.
            </>
          ) : (
            <>
              Hech qanday qator belgilanmagan — sessiya yopish yoki limit o‘zgartirish{" "}
              <strong>joriy jadvaldagi barcha {rows.length} ta</strong> xodimga qo‘llanadi (yuqoridagi filtr
              «Qo‘llash» va qidiruv natijasidagi qatorlar).
            </>
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex gap-1 border-b border-border pb-1">
            <button
              type="button"
              className={cn(
                "rounded px-2 py-1 text-xs",
                tab === "active" ? "border-b-2 border-primary font-medium" : "text-muted-foreground"
              )}
              onClick={() => setTab("active")}
            >
              Faol
            </button>
            <button
              type="button"
              className={cn(
                "rounded px-2 py-1 text-xs",
                tab === "inactive" ? "border-b-2 border-primary font-medium" : "text-muted-foreground"
              )}
              onClick={() => setTab("inactive")}
            >
              Nofaol
            </button>
          </div>
          <label className="grid gap-0.5 text-xs">
            <span className="sr-only">Filial</span>
            <FilterSelect
              aria-label="Filial"
              emptyLabel="Filial"
              value={filterBranch}
              onChange={(e) => setFilterBranch(e.target.value)}
            >
              {(filterOptsQ.data?.branches ?? []).map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </FilterSelect>
          </label>
          <label className="grid gap-0.5 text-xs">
            <span className="sr-only">Lavozim</span>
            <FilterSelect
              aria-label="Lavozim"
              emptyLabel="Lavozim"
              value={filterPosition}
              onChange={(e) => setFilterPosition(e.target.value)}
            >
              {(filterOptsQ.data?.positions ?? []).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </FilterSelect>
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="shrink-0"
            onClick={() => {
              setAppliedBranch(filterBranch);
              setAppliedPosition(filterPosition);
            }}
          >
            Qo‘llash
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1 px-2 text-xs"
            title="Ustunlar va tartib"
            onClick={() => setColumnDialogOpen(true)}
          >
            <ListOrdered className="size-3.5" />
            Ustunlar
          </Button>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
            value={pageSize}
            onChange={(e) => tablePrefs.setPageSize(Number.parseInt(e.target.value, 10))}
          >
            {[10, 20, 25, 50, 100, 500, 1000].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <Input
            className="max-w-[200px]"
            placeholder="Qidiruv"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const order = tablePrefs.visibleColumnOrder;
              const headers = order.map((id) => OPERATOR_COLUMNS.find((c) => c.id === id)?.label ?? id);
              const dataRows = rows.map((r) => order.map((colId) => operatorExportCellString(r, colId)));
              downloadXlsxSheet(
                `veb_xodimlar_${tab}_${new Date().toISOString().slice(0, 10)}.xlsx`,
                "Veb xodimlar",
                headers,
                dataRows
              );
            }}
          >
            Excel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            title="Ro‘yxat va faol sessiyalar sonini yangilash"
            disabled={listQ.isFetching}
            onClick={() => void listQ.refetch()}
          >
            <RefreshCw className={cn("size-3.5", listQ.isFetching && "animate-spin")} />
          </Button>
          <label className="text-xs text-muted-foreground">
            <span className="sr-only">Guruh</span>
            <select
              className={filterSelectClassName}
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (v === "revoke" && rows.length > 0) openBulkRevoke();
                if (v === "limits" && rows.length > 0) openBulkLimits();
                e.target.value = "";
              }}
            >
              <option value="">Guruh ishlovi…</option>
              <option value="revoke" disabled={rows.length === 0}>
                Sessiyalarni yopish
              </option>
              <option value="limits" disabled={rows.length === 0}>
                Sessiya limitlari
              </option>
            </select>
          </label>
          <Link
            href="/settings/spravochnik/operators/new"
            className={cn(buttonVariants({ size: "sm" }), "shrink-0")}
          >
            + Qoʻshish
          </Link>
        </div>
      </div>

      <TableColumnSettingsDialog
        open={columnDialogOpen}
        onOpenChange={setColumnDialogOpen}
        title="Ustunlar boshqaruvi"
        description="Ko‘rinadigan ustunlar va tartib akkauntingizga saqlanadi."
        columns={OPERATOR_COLUMNS}
        columnOrder={tablePrefs.columnOrder}
        hiddenColumnIds={tablePrefs.hiddenColumnIds}
        saving={tablePrefs.saving}
        onSave={(next) => tablePrefs.saveColumnLayout(next)}
        onReset={() => tablePrefs.resetColumnLayout()}
      />

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-muted/40 text-left text-xs">
            <tr>
              <th className="w-10 px-2 py-2">
                <input
                  type="checkbox"
                  className="size-4 rounded border-input"
                  checked={allOnPageSelected}
                  onChange={toggleAllOnPage}
                  aria-label="Barchasini tanlash"
                />
              </th>
              {tablePrefs.visibleColumnOrder.map((colId) => {
                const meta = OPERATOR_COLUMNS.find((c) => c.id === colId);
                return (
                  <th key={colId} className="px-2 py-2">
                    {meta?.label ?? colId}
                  </th>
                );
              })}
              <th className="px-2 py-2 text-right">Amallar</th>
            </tr>
          </thead>
          <tbody>
            {listQ.isLoading ? (
              <tr>
                <td
                  colSpan={2 + tablePrefs.visibleColumnOrder.length}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  Yuklanmoqda…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={2 + tablePrefs.visibleColumnOrder.length}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Bo‘sh
                </td>
              </tr>
            ) : (
              pageRows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-input"
                      checked={selected.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                      aria-label={`Tanlash ${r.login}`}
                    />
                  </td>
                  {tablePrefs.visibleColumnOrder.map((colId) => (
                    <td key={colId} className="px-2 py-1.5">
                      {colId === "active_sessions" ? (
                        <button
                          type="button"
                          className="text-xs font-medium text-primary tabular-nums underline-offset-2 hover:underline"
                          onClick={() => setSessionRow(r)}
                        >
                          {r.active_session_count}
                        </button>
                      ) : (
                        renderOperatorDataCell(colId, r)
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right">
                    <TableRowActionGroup className="justify-end" ariaLabel="Operator">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        className="text-muted-foreground hover:text-foreground"
                        title="Faol sessiyalar"
                        aria-label="Faol sessiyalar"
                        onClick={() => setSessionRow(r)}
                      >
                        <MonitorSmartphone className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        className="text-muted-foreground hover:text-foreground"
                        title="Parolni o‘zgartirish"
                        aria-label="Parolni o‘zgartirish"
                        onClick={() => setPasswordRow(r)}
                      >
                        <KeyRound className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        className="text-muted-foreground hover:text-foreground"
                        title="Maʼlumotlarni tahrirlash"
                        aria-label="Tahrirlash"
                        onClick={() => setEditRow(r)}
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </Button>
                      {tab === "active" ? (
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          title="Nofaol qilish"
                          aria-label="Nofaol qilish"
                          disabled={deactivateMut.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `${r.fio} foydalanuvchini nofaol qilasizmi?`
                              )
                            ) {
                              deactivateMut.mutate(r);
                            }
                          }}
                        >
                          <UserRoundX className="size-3.5" aria-hidden />
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          className="text-primary hover:bg-primary/10"
                          title="Faollashtirish"
                          aria-label="Faollashtirish"
                          disabled={deactivateMut.isPending}
                          onClick={() => deactivateMut.mutate(r)}
                        >
                          <UserRoundCheck className="size-3.5" aria-hidden />
                        </Button>
                      )}
                    </TableRowActionGroup>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {rows.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Ko‘rsatilmoqda {pageRows.length} / {rows.length}
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        <strong className="text-foreground">Tizim roli</strong> hozircha faqat{" "}
        <code className="text-foreground">operator</code> (JWT).         <strong className="text-foreground">Lavozim</strong> maydoni — tashkiliy nomlar (masalan, kassir, menejer).
        Shablonlar ro‘yxati:{" "}
        <Link href="/settings/web-staff-position-presets" className="text-primary underline">
          Sozlamalar → Veb xodim lavozimlari
        </Link>
        . Kelajakda yangi veb-rol qo‘shish uchun backend{" "}
        <code className="text-foreground">WEB_PANEL_STAFF_ROLES</code> bilan moslang. Faol sessiyalar soni jadvalda{" "}
        <code className="text-foreground">~45 s</code> da avtomatik yangilanadi yoki yangilash tugmasi bilan.
      </p>

      <WebStaffEditDialog
        row={editRow}
        tenantSlug={tenantSlug}
        filterOptions={filterOptsQ.data}
        onClose={() => setEditRow(null)}
        onDone={async () => {
          await qc.invalidateQueries({ queryKey: ["operators", tenantSlug] });
          setEditRow(null);
        }}
      />

      <WebStaffPasswordDialog
        row={passwordRow}
        tenantSlug={tenantSlug}
        onClose={() => setPasswordRow(null)}
        onDone={async () => {
          await qc.invalidateQueries({ queryKey: ["operators", tenantSlug] });
          setPasswordRow(null);
        }}
      />

      <StaffActiveSessionsDialog
        open={sessionRow != null}
        onOpenChange={(open) => {
          if (!open) setSessionRow(null);
        }}
        tenantSlug={tenantSlug}
        staffKind="operator"
        userId={sessionRow?.id ?? null}
        maxSessions={sessionRow?.max_sessions ?? 4}
        onPatched={() => {
          void qc.invalidateQueries({ queryKey: ["operators", tenantSlug] });
        }}
      />

      <Dialog
        open={bulkRevokeOpen}
        onOpenChange={(o) => {
          if (!o) {
            setBulkRevokeOpen(false);
            setBulkRevokeRows(null);
          }
        }}
      >
        <DialogContent className="max-w-lg" showCloseButton>
          <DialogHeader>
            <DialogTitle>Veb-sessiyalarni yopish</DialogTitle>
            <p className="text-xs font-normal text-muted-foreground">
              {bulkRevokeRows && bulkRevokeRows.length > 0 ? (
                <>
                  <strong className="text-foreground">{bulkRevokeRows.length}</strong> ta xodimning barcha faol
                  refresh-sessiyalari yopiladi.
                  {selected.size === 0 ? (
                    <span> (Tanlov qilinmagan — joriy ro‘yxatdagi hammasi.)</span>
                  ) : null}
                </>
              ) : null}
            </p>
          </DialogHeader>
          <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
            {(bulkRevokeRows ?? []).map((r) => (
              <li key={r.id} className="flex justify-between gap-2 rounded border px-2 py-1.5">
                <span>{r.fio}</span>
                <span className="tabular-nums text-muted-foreground">
                  faol sessiyalar: {r.active_session_count}
                </span>
              </li>
            ))}
          </ul>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setBulkRevokeOpen(false);
                setBulkRevokeRows(null);
              }}
            >
              Bekor
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                bulkRevokeMut.isPending || !bulkRevokeRows || bulkRevokeRows.length === 0
              }
              onClick={() => {
                if (!bulkRevokeRows?.length) return;
                bulkRevokeMut.mutate(bulkRevokeRows.map((r) => r.id));
              }}
            >
              {bulkRevokeMut.isPending ? "…" : "Sessiyalarni yopish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bulkLimitsOpen}
        onOpenChange={(o) => {
          if (!o) {
            setBulkLimitsOpen(false);
            setBulkLimitsRows(null);
          }
        }}
      >
        <DialogContent className="max-w-lg" showCloseButton>
          <DialogHeader>
            <DialogTitle>Sessiya limitlarini o‘zgartirish</DialogTitle>
            <p className="text-xs font-normal text-muted-foreground">
              {bulkLimitsRows && bulkLimitsRows.length > 0 ? (
                <>
                  <strong className="text-foreground">{bulkLimitsRows.length}</strong> ta xodim uchun maksimal
                  parallel sessiya yangilanadi.
                  {selected.size === 0 ? (
                    <span> (Tanlov qilinmagan — joriy ro‘yxatdagi hammasi.)</span>
                  ) : null}
                </>
              ) : null}
            </p>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Button type="button" size="sm" variant="secondary" onClick={() => bumpAllLimits(-1)}>
              Hammasiga −1
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => bumpAllLimits(1)}>
              Hammasiga +1
            </Button>
            <span className="text-muted-foreground">yoki</span>
            <Input
              className="w-20"
              inputMode="numeric"
              placeholder="1–99"
              id="uniform-limit"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const el = document.getElementById("uniform-limit") as HTMLInputElement | null;
                if (el) setAllLimitsTo(Number.parseInt(el.value, 10));
              }}
            >
              Qiymatni qo‘llash
            </Button>
          </div>
          <ul className="max-h-56 space-y-2 overflow-y-auto text-sm">
            {(bulkLimitsRows ?? []).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded border px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate">{r.fio}</span>
                <div className="flex items-center gap-1">
                  <Button type="button" size="sm" variant="outline" onClick={() => adjustLimit(r.id, -1)}>
                    −
                  </Button>
                  <span className="w-8 text-center tabular-nums">{limitsDraft[r.id] ?? r.max_sessions}</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => adjustLimit(r.id, 1)}>
                    +
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setBulkLimitsOpen(false);
                setBulkLimitsRows(null);
              }}
            >
              Bekor
            </Button>
            <Button
              type="button"
              disabled={
                bulkLimitsMut.isPending || !bulkLimitsRows || bulkLimitsRows.length === 0
              }
              onClick={() => {
                if (!bulkLimitsRows?.length) return;
                const updates = bulkLimitsRows.map((r) => ({
                  user_id: r.id,
                  max_sessions: limitsDraft[r.id] ?? r.max_sessions
                }));
                bulkLimitsMut.mutate(updates);
              }}
            >
              {bulkLimitsMut.isPending ? "…" : "Saqlash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WebStaffPasswordDialog({
  row,
  onClose,
  tenantSlug,
  onDone
}: {
  row: WebStaffRow | null;
  onClose: () => void;
  tenantSlug: string;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");

  useEffect(() => {
    setPassword("");
  }, [row?.id]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!row) return;
      await api.patch(`/api/${tenantSlug}/operators/${row.id}`, { password });
    },
    onSuccess: () => void onDone()
  });

  if (!row) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" showCloseButton>
        <DialogHeader>
          <DialogTitle>Parolni o‘zgartirish — {row.login}</DialogTitle>
        </DialogHeader>
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-muted-foreground">Yangi parol (min 6)</span>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Bekor
          </Button>
          <Button
            type="button"
            disabled={mut.isPending || password.trim().length < 6}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? "…" : "Saqlash"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WebStaffEditDialog({
  row,
  onClose,
  tenantSlug,
  filterOptions,
  onDone
}: {
  row: WebStaffRow | null;
  onClose: () => void;
  tenantSlug: string;
  filterOptions: FilterOptions | undefined;
  onDone: () => void;
}) {
  const [first_name, setFirst] = useState("");
  const [last_name, setLast] = useState("");
  const [middle_name, setMid] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pinfl, setPinfl] = useState("");
  const [branch, setBranch] = useState("");
  const [position, setPosition] = useState("");
  const [max_sessions, setMaxS] = useState("4");
  const [app_access, setAppAccess] = useState(false);
  const [can_authorize, setCanAuth] = useState(true);

  useEffect(() => {
    if (!row) return;
    setFirst((row.first_name ?? "").trim() || row.fio);
    setLast((row.last_name ?? "").trim());
    setMid((row.middle_name ?? "").trim());
    setPhone(row.phone ?? "");
    setEmail(row.email ?? "");
    setCode(row.code ?? "");
    setPinfl(row.pinfl ?? "");
    setBranch(row.branch ?? "");
    setPosition(row.position ?? "");
    setMaxS(String(row.max_sessions));
    setAppAccess(row.app_access);
    setCanAuth(row.can_authorize);
  }, [row]);

  const patchMut = useMutation({
    mutationFn: async () => {
      if (!row) return;
      const ms = Number.parseInt(max_sessions, 10);
      await api.patch(`/api/${tenantSlug}/operators/${row.id}`, {
        first_name: first_name.trim(),
        last_name: last_name.trim() || null,
        middle_name: middle_name.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        code: code.trim() || null,
        pinfl: pinfl.trim() || null,
        branch: branch.trim() || null,
        position: position.trim() || null,
        max_sessions: Number.isFinite(ms) ? ms : row.max_sessions,
        app_access,
        can_authorize
      });
    },
    onSuccess: () => void onDone()
  });

  if (!row) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto" showCloseButton>
        <DialogHeader>
          <DialogTitle>Tahrirlash — {row.login}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 text-sm">
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Ism *</span>
            <Input value={first_name} onChange={(e) => setFirst(e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Familiya</span>
            <Input value={last_name} onChange={(e) => setLast(e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Otasining ismi</span>
            <Input value={middle_name} onChange={(e) => setMid(e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Telefon</span>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Email</span>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Kod</span>
            <Input value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">PINFL</span>
            <Input value={pinfl} onChange={(e) => setPinfl(e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Filial</span>
            <Input
              list="webstaff-branches-edit"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            />
            <datalist id="webstaff-branches-edit">
              {(filterOptions?.branches ?? []).map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Lavozim</span>
            <Input
              list="webstaff-positions-edit"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
            <datalist id="webstaff-positions-edit">
              {(filterOptions?.positions ?? []).map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            <span className="text-[11px] leading-snug text-muted-foreground">
              Shablonlar ro‘yxatini{" "}
              <Link
                href={POSITION_PRESETS_SETTINGS_HREF}
                className="text-primary underline underline-offset-2 hover:text-primary/90"
              >
                bu yerda
              </Link>{" "}
              boshqarasiz.
            </span>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Maks. veb-sessiyalar</span>
            <Input
              inputMode="numeric"
              value={max_sessions}
              onChange={(e) => setMaxS(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={app_access} onChange={(e) => setAppAccess(e.target.checked)} />
            Mobil ilova
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={can_authorize} onChange={(e) => setCanAuth(e.target.checked)} />
            Kirish ruxsati
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Bekor
          </Button>
          <Button type="button" disabled={patchMut.isPending} onClick={() => patchMut.mutate()}>
            {patchMut.isPending ? "…" : "Saqlash"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
