"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
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
import { cn } from "@/lib/utils";
import { downloadXlsxSheet } from "@/lib/download-xlsx";
import { FilterSelect } from "@/components/ui/filter-select";
import { TableColumnSettingsDialog } from "@/components/data-table/table-column-settings-dialog";
import { TableRowActionGroup } from "@/components/data-table/table-row-actions";
import { useUserTablePrefs } from "@/hooks/use-user-table-prefs";
import { StaffActiveSessionsDialog } from "@/components/staff/staff-active-sessions-dialog";
import { ListOrdered, Pencil, RefreshCw, Settings2, UserMinus } from "lucide-react";

export type SuperviseeRow = { id: number; fio: string; code: string | null };

export type SupervisorRow = {
  id: number;
  fio: string;
  code: string | null;
  pinfl: string | null;
  branch: string | null;
  position: string | null;
  apk_version: string | null;
  app_access: boolean;
  active_session_count: number;
  max_sessions: number;
  login: string;
  is_active: boolean;
  supervisees: SuperviseeRow[];
  phone: string | null;
  email: string | null;
  kpi_color: string | null;
  consignment: boolean;
};

type TenantProfile = {
  references: {
    branches?: Array<{ id: string; name: string; active?: boolean }>;
  };
};

const COLS = [
  "Ф.И.О",
  "Агент",
  "Код",
  "Логин",
  "ПИНФЛ",
  "Филиал",
  "Должность",
  "Версия APK",
  "Доступ к приложение",
  "Количество активных сессий",
  "Максимальное количество сессий"
] as const;

const SUPERVISOR_TABLE_ID = "staff.supervisors.v1";
const SUPERVISOR_COLUMN_IDS = [
  "fio",
  "supervisees",
  "code",
  "login",
  "pinfl",
  "branch",
  "position",
  "apk_version",
  "app_access",
  "active_sessions",
  "max_sessions"
] as const;
const SUPERVISOR_COLUMNS = SUPERVISOR_COLUMN_IDS.map((id, i) => ({
  id,
  label: COLS[i] ?? id
}));

const VISIBLE_AGENTS = 3;

type Props = { tenantSlug: string };

function SuperviseeCell({ list }: { list: SuperviseeRow[] }) {
  if (!list.length) return <span className="text-muted-foreground">—</span>;
  const shown = list.slice(0, VISIBLE_AGENTS);
  const rest = list.length - shown.length;
  return (
    <div className="flex max-w-[22rem] flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        {shown.map((a) => (
          <span
            key={a.id}
            className="inline-block max-w-[14rem] truncate rounded-md bg-muted px-1.5 py-0.5 text-[10px]"
            title={a.fio}
          >
            {a.code ? `${a.code} — ` : ""}
            {a.fio}
          </span>
        ))}
      </div>
      {rest > 0 && <span className="text-[10px] text-primary">+ ещё {rest}</span>}
    </div>
  );
}

export function SupervisorsWorkspace({ tenantSlug }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"active" | "inactive">("active");
  const [draftPos, setDraftPos] = useState("");
  const [appliedPos, setAppliedPos] = useState("");
  const [search, setSearch] = useState("");
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const tablePrefs = useUserTablePrefs({
    tenantSlug,
    tableId: SUPERVISOR_TABLE_ID,
    defaultColumnOrder: [...SUPERVISOR_COLUMN_IDS],
    defaultPageSize: 10,
    allowedPageSizes: [10, 20, 25, 50, 100]
  });
  const pageSize = tablePrefs.pageSize;

  const [editRow, setEditRow] = useState<SupervisorRow | null>(null);
  const [sessionSup, setSessionSup] = useState<SupervisorRow | null>(null);
  const [deactivateRow, setDeactivateRow] = useState<SupervisorRow | null>(null);

  const filterOptQ = useQuery({
    queryKey: ["supervisors-filter-options", tenantSlug],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: { positions: string[] } }>(
        `/api/${tenantSlug}/supervisors/filter-options`
      );
      return data.data;
    }
  });

  const profileQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug, "supervisors-ws"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<TenantProfile>(`/api/${tenantSlug}/settings/profile`);
      return data;
    }
  });

  const branchOptions = useMemo(() => {
    return (profileQ.data?.references.branches ?? [])
      .filter((b) => b.active !== false)
      .map((b) => b.name.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "ru"));
  }, [profileQ.data]);

  const listQ = useQuery({
    queryKey: ["supervisors", tenantSlug, tab, appliedPos],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("is_active", tab === "active" ? "true" : "false");
      if (appliedPos.trim()) params.set("position", appliedPos.trim());
      const { data } = await api.get<{ data: SupervisorRow[] }>(
        `/api/${tenantSlug}/supervisors?${params.toString()}`
      );
      return data.data;
    }
  });

  const agentsQ = useQuery({
    queryKey: ["agents", tenantSlug, "supervisors-ws-pick"],
    enabled: Boolean(tenantSlug) && Boolean(editRow),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("is_active", "true");
      const { data } = await api.get<{ data: { id: number; fio: string; code: string | null }[] }>(
        `/api/${tenantSlug}/agents?${params.toString()}`
      );
      return data.data;
    }
  });

  const patchMut = useMutation({
    mutationFn: async (vars: { id: number; body: Record<string, unknown> }) => {
      const { data } = await api.patch<SupervisorRow>(`/api/${tenantSlug}/supervisors/${vars.id}`, vars.body);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["supervisors", tenantSlug] });
      void qc.invalidateQueries({ queryKey: ["supervisors-filter-options", tenantSlug] });
      void qc.invalidateQueries({ queryKey: ["supervisors", tenantSlug, "staff-agent-dropdown"] });
    }
  });

  const deactivateMut = useMutation({
    mutationFn: async (id: number) => {
      await api.patch(`/api/${tenantSlug}/supervisors/${id}`, { is_active: false });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["supervisors", tenantSlug] });
      setDeactivateRow(null);
    }
  });

  const filteredRows = useMemo(() => {
    const src = listQ.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return src;
    return src.filter((r) =>
      [
        r.fio,
        r.login,
        r.phone ?? "",
        r.code ?? "",
        r.branch ?? "",
        r.position ?? "",
        ...r.supervisees.map((s) => `${s.fio} ${s.code ?? ""}`)
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [listQ.data, search]);

  const total = filteredRows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [tab, appliedPos, search, pageSize]);

  useEffect(() => {
    setSelected(new Set());
  }, [tab, appliedPos, safePage, pageSize]);

  const applyFilters = () => {
    setAppliedPos(draftPos);
  };

  const allPageSelected =
    pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));

  function supervisorExportCellString(r: SupervisorRow, colId: string): string {
    switch (colId) {
      case "fio":
        return r.fio;
      case "supervisees":
        return r.supervisees.map((s) => `${s.code ?? ""} ${s.fio}`.trim()).join("; ");
      case "code":
        return r.code ?? "";
      case "login":
        return r.login;
      case "pinfl":
        return r.pinfl ?? "";
      case "branch":
        return r.branch ?? "";
      case "position":
        return r.position ?? "";
      case "apk_version":
        return r.apk_version ?? "";
      case "app_access":
        return r.app_access ? "Да" : "Нет";
      case "active_sessions":
        return String(r.active_session_count);
      case "max_sessions":
        return String(r.max_sessions);
      default:
        return "";
    }
  }

  function renderSupervisorDataCell(colId: string, r: SupervisorRow) {
    switch (colId) {
      case "fio":
        return r.fio;
      case "supervisees":
        return <SuperviseeCell list={r.supervisees} />;
      case "code":
        return <span className="font-mono">{r.code ?? "—"}</span>;
      case "login":
        return <span className="font-mono">{r.login}</span>;
      case "pinfl":
        return <span className="font-mono">{r.pinfl ?? "—"}</span>;
      case "branch":
        return r.branch ?? "—";
      case "position":
        return r.position ?? "—";
      case "apk_version":
        return r.apk_version ?? "—";
      case "app_access":
        return (
          <label className="inline-flex cursor-pointer items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Вкл / выкл</span>
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={r.app_access}
              onChange={(e) => {
                patchMut.mutate({ id: r.id, body: { app_access: e.target.checked } });
              }}
            />
          </label>
        );
      case "active_sessions":
        return (
          <button
            type="button"
            className="font-medium text-primary underline-offset-2 hover:underline"
            onClick={() => setSessionSup(r)}
          >
            {r.active_session_count}
          </button>
        );
      case "max_sessions":
        return r.max_sessions;
      default:
        return "—";
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="sr-only">Должность</span>
          <FilterSelect
            aria-label="Должность"
            emptyLabel="Должность"
            value={draftPos}
            onChange={(e) => setDraftPos(e.target.value)}
          >
            {(filterOptQ.data?.positions ?? []).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </FilterSelect>
        </label>
        <Button type="button" size="sm" onClick={applyFilters}>
          Применить
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2 border-b border-border">
          <button
            type="button"
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab === "active" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            )}
            onClick={() => setTab("active")}
          >
            Активный
          </button>
          <button
            type="button"
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab === "inactive" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            )}
            onClick={() => setTab("inactive")}
          >
            Не активный
          </button>
        </div>
        <Link
          href="/settings/spravochnik/supervisors/new"
          className={cn(buttonVariants({ variant: "default", size: "sm" }))}
        >
          Добавить Супервайзера
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={allPageSelected}
            onChange={(e) => {
              if (e.target.checked) {
                setSelected(new Set(pageRows.map((r) => r.id)));
              } else {
                setSelected(new Set());
              }
            }}
          />
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 px-2 text-xs"
          title="Управление столбцами"
          onClick={() => setColumnDialogOpen(true)}
        >
          <ListOrdered className="size-3.5" />
          Столбцы
        </Button>
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          value={pageSize}
          onChange={(e) => tablePrefs.setPageSize(Number.parseInt(e.target.value, 10))}
        >
          {[10, 20, 25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <Input
          placeholder="Поиск"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 max-w-xs text-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => {
            const order = tablePrefs.visibleColumnOrder;
            const headers = order.map((id) => SUPERVISOR_COLUMNS.find((c) => c.id === id)?.label ?? id);
            const rows = filteredRows.map((r) => order.map((colId) => supervisorExportCellString(r, colId)));
            downloadXlsxSheet(
              `supervisors_${tab}_${new Date().toISOString().slice(0, 10)}.xlsx`,
              "Супервайзеры",
              headers,
              rows
            );
          }}
        >
          Excel
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="h-8 w-8"
          onClick={() => void listQ.refetch()}
        >
          <RefreshCw className={cn("size-4", listQ.isFetching && "animate-spin")} />
        </Button>
        <Button type="button" variant="outline" size="sm" className="ml-auto h-8 text-xs" disabled>
          Групповая обработка
        </Button>
      </div>

      <TableColumnSettingsDialog
        open={columnDialogOpen}
        onOpenChange={setColumnDialogOpen}
        title="Управление столбцами"
        description="Выберите видимые столбцы и порядок. Сохраняется для вашей учётной записи."
        columns={SUPERVISOR_COLUMNS}
        columnOrder={tablePrefs.columnOrder}
        hiddenColumnIds={tablePrefs.hiddenColumnIds}
        saving={tablePrefs.saving}
        onSave={(next) => tablePrefs.saveColumnLayout(next)}
        onReset={() => tablePrefs.resetColumnLayout()}
      />

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[1400px] text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="w-8 px-2 py-2" />
              {tablePrefs.visibleColumnOrder.map((colId) => {
                const meta = SUPERVISOR_COLUMNS.find((c) => c.id === colId);
                return (
                  <th
                    key={colId}
                    className="whitespace-nowrap px-2 py-2 text-left font-medium text-muted-foreground"
                  >
                    {meta?.label ?? colId}
                  </th>
                );
              })}
              <th className="whitespace-nowrap px-2 py-2 text-left font-medium text-muted-foreground">
                Действия
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id} className="border-t even:bg-muted/20">
                <td className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={(e) => {
                      const n = new Set(selected);
                      if (e.target.checked) n.add(r.id);
                      else n.delete(r.id);
                      setSelected(n);
                    }}
                  />
                </td>
                {tablePrefs.visibleColumnOrder.map((colId) => (
                  <td key={colId} className="px-2 py-2">
                    {renderSupervisorDataCell(colId, r)}
                  </td>
                ))}
                <td className="px-2 py-2 text-right">
                  <TableRowActionGroup className="justify-end" ariaLabel="Supervisor">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-foreground"
                      title="Сессии и лимит"
                      aria-label="Сессии и лимит"
                      onClick={() => setSessionSup(r)}
                    >
                      <Settings2 className="size-3.5" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-foreground"
                      title="Редактировать"
                      aria-label="Редактировать"
                      onClick={() => setEditRow(r)}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                    </Button>
                    {tab === "active" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        title="Деактивировать"
                        aria-label="Деактивировать"
                        onClick={() => setDeactivateRow(r)}
                      >
                        <UserMinus className="size-3.5" aria-hidden />
                      </Button>
                    )}
                  </TableRowActionGroup>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Показано {total === 0 ? 0 : (safePage - 1) * pageSize + 1} —{" "}
          {Math.min(safePage * pageSize, total)} из {total}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ‹
          </Button>
          <span className="tabular-nums">
            {safePage} / {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2"
            disabled={safePage >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            ›
          </Button>
        </div>
      </div>

      <SupervisorEditDialog
        row={editRow}
        onClose={() => setEditRow(null)}
        tenantSlug={tenantSlug}
        branchOptions={branchOptions}
        positionSuggestions={filterOptQ.data?.positions ?? []}
        agents={agentsQ.data ?? []}
        onPatch={(id, body) => patchMut.mutateAsync({ id, body })}
      />

      <StaffActiveSessionsDialog
        open={sessionSup != null}
        onOpenChange={(o) => !o && setSessionSup(null)}
        tenantSlug={tenantSlug}
        staffKind="supervisor"
        userId={sessionSup?.id ?? null}
        maxSessions={sessionSup?.max_sessions ?? 2}
        onPatched={() => {
          void qc.invalidateQueries({ queryKey: ["supervisors", tenantSlug] });
        }}
      />

      <Dialog open={Boolean(deactivateRow)} onOpenChange={(o) => !o && setDeactivateRow(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Деактивировать супервайзера</DialogTitle>
          </DialogHeader>
          <p className="text-sm">Вы хотите деактивировать супервайзера?</p>
          <DialogFooter className="flex-row justify-end gap-2 border-0 bg-transparent p-0">
            <Button type="button" variant="outline" onClick={() => setDeactivateRow(null)}>
              Нет
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deactivateMut.isPending}
              onClick={() => deactivateRow && deactivateMut.mutate(deactivateRow.id)}
            >
              Да
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SupervisorEditDialog({
  row,
  onClose,
  tenantSlug,
  branchOptions,
  positionSuggestions,
  agents,
  onPatch
}: {
  row: SupervisorRow | null;
  onClose: () => void;
  tenantSlug: string;
  branchOptions: string[];
  positionSuggestions: string[];
  agents: { id: number; fio: string; code: string | null }[];
  onPatch: (id: number, body: Record<string, unknown>) => Promise<unknown>;
}) {
  const detailQ = useQuery({
    queryKey: ["supervisor-detail", tenantSlug, row?.id],
    enabled: Boolean(row),
    queryFn: async () => {
      const { data } = await api.get<{ data: SupervisorRow }>(`/api/${tenantSlug}/supervisors/${row!.id}`);
      return data.data;
    }
  });

  const r = detailQ.data ?? row;
  const [first_name, setFirst] = useState("");
  const [last_name, setLast] = useState("");
  const [middle_name, setMid] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [pinfl, setPinfl] = useState("");
  const [branch, setBranch] = useState("");
  const [position, setPosition] = useState("");
  const [agSel, setAgSel] = useState<Set<number>>(new Set());
  const [login, setLogin] = useState("");
  const [pwMode, setPwMode] = useState(false);
  const [password, setPassword] = useState("");
  const [kpi_color, setKpi] = useState("#0d9488");
  const [consignment, setConsignment] = useState(false);
  const [agSearch, setAgSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!r) return;
    const parts = r.fio.split(/\s+/);
    setFirst(parts[1] ?? parts[0] ?? "");
    setLast(parts[0] ?? "");
    setMid(parts[2] ?? "");
    setPhone(r.phone ?? "");
    setCode(r.code ?? "");
    setPinfl(r.pinfl ?? "");
    setBranch(r.branch ?? "");
    setPosition(r.position ?? "");
    setLogin(r.login);
    setKpi(r.kpi_color || "#0d9488");
    setConsignment(r.consignment);
    setPwMode(false);
    setPassword("");
    setAgSearch("");
    setAgSel(new Set(r.supervisees.map((s) => s.id)));
  }, [r]);

  if (!row || !r) return null;

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        first_name: first_name.trim(),
        last_name: last_name.trim() || null,
        middle_name: middle_name.trim() || null,
        phone: phone.trim() || null,
        code: code.trim() || null,
        pinfl: pinfl.trim() || null,
        branch: branch.trim() || null,
        position: position.trim() || null,
        supervisee_agent_ids: Array.from(agSel),
        consignment,
        kpi_color: kpi_color || null
      };
      if (pwMode && password.length >= 6) body.password = password;
      await onPatch(r.id, body);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const filteredAgents = agents.filter((a) => {
    const q = agSearch.trim().toLowerCase();
    if (!q) return true;
    return `${a.fio} ${a.code ?? ""} ${a.id}`.toLowerCase().includes(q);
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Редактировать</DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[calc(92vh-8rem)] gap-3 overflow-y-auto pr-1">
          <Input placeholder="Имя *" value={first_name} onChange={(e) => setFirst(e.target.value)} />
          <Input placeholder="Фамилия" value={last_name} onChange={(e) => setLast(e.target.value)} />
          <Input placeholder="Отчество" value={middle_name} onChange={(e) => setMid(e.target.value)} />
          <Input placeholder="Телефон" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input placeholder="Код" value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} />
          <Input placeholder="ПИНФЛ" value={pinfl} onChange={(e) => setPinfl(e.target.value)} />
          <label className="text-xs text-muted-foreground">
            Филиал
            <FilterSelect
              className="mt-1 h-10 w-full min-w-0 max-w-none rounded-md border border-input bg-background p-2 text-sm"
              emptyLabel="Филиал"
              aria-label="Филиал"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            >
              {branchOptions.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </FilterSelect>
          </label>
          <label className="text-xs text-muted-foreground">
            Должность
            <Input
              className="mt-1"
              list="supervisor-pos-suggestions"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="Должность"
            />
            <datalist id="supervisor-pos-suggestions">
              {positionSuggestions.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <div className="rounded-md border">
            <div className="border-b p-2 text-sm font-medium">Агент</div>
            <Input
              placeholder="Поиск агента"
              className="m-2"
              value={agSearch}
              onChange={(e) => setAgSearch(e.target.value)}
            />
            <div className="max-h-48 overflow-y-auto p-2">
              {filteredAgents.map((a) => (
                <label key={a.id} className="flex items-center gap-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={agSel.has(a.id)}
                    onChange={(e) => {
                      const n = new Set(agSel);
                      if (e.target.checked) n.add(a.id);
                      else n.delete(a.id);
                      setAgSel(n);
                    }}
                  />
                  <span className="font-mono text-[10px] text-muted-foreground">{a.id}</span>
                  {a.code ? <span className="font-mono text-xs">{a.code}</span> : null}
                  <span className="truncate">{a.fio}</span>
                </label>
              ))}
            </div>
          </div>
          <Input placeholder="Логин для входа" value={login} onChange={(e) => setLogin(e.target.value)} disabled />
          {!pwMode ? (
            <Button type="button" variant="outline" className="w-full" onClick={() => setPwMode(true)}>
              Изменить пароль
            </Button>
          ) : (
            <Input
              placeholder="Новый пароль (мин. 6)"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={consignment} onChange={(e) => setConsignment(e.target.checked)} />
            Консигнация
          </label>
          <label className="flex items-center gap-2 text-sm">
            Выбрать цвет для KPI
            <input type="color" value={kpi_color} onChange={(e) => setKpi(e.target.value)} className="h-8 w-12" />
          </label>
        </div>
        <DialogFooter>
          <Button type="button" className="w-full" disabled={saving || !first_name.trim()} onClick={() => void save()}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

