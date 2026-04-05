"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  ListOrdered,
  MonitorSmartphone,
  Pencil,
  RefreshCw,
  Settings2,
  UserMinus
} from "lucide-react";
import { TableColumnSettingsDialog } from "@/components/data-table/table-column-settings-dialog";
import { TableRowActionGroup } from "@/components/data-table/table-row-actions";
import { useUserTablePrefs } from "@/hooks/use-user-table-prefs";
import { StaffActiveSessionsDialog } from "@/components/staff/staff-active-sessions-dialog";
import { downloadXlsxSheet } from "@/lib/download-xlsx";
import { FilterSelect } from "@/components/ui/filter-select";

export type AgentRow = {
  id: number;
  fio: string;
  product: string | null;
  agent_type: string | null;
  code: string | null;
  pinfl: string | null;
  consignment: boolean;
  apk_version: string | null;
  device_name: string | null;
  last_sync_at: string | null;
  phone: string | null;
  email: string | null;
  can_authorize: boolean;
  price_type: string | null;
  price_types: string[];
  warehouse: string | null;
  trade_direction_id: number | null;
  trade_direction: string | null;
  branch: string | null;
  position: string | null;
  created_at: string;
  app_access: boolean;
  territory: string | null;
  login: string;
  is_active: boolean;
  max_sessions: number;
  active_session_count: number;
  kpi_color: string | null;
  agent_entitlements: {
    price_types?: string[];
    product_rules?: Array<{ category_id: number; all: boolean; product_ids?: number[] }>;
  };
};

type ProductCategoryRow = {
  id: number;
  name: string;
  parent_id: number | null;
  is_active: boolean;
};

type ProductListItem = {
  id: number;
  name: string;
  sku: string;
  category_id: number | null;
};

type TenantProfile = {
  references: {
    branches?: Array<{ id: string; name: string; active?: boolean }>;
    trade_directions?: string[];
  };
};

const COLS = [
  "Ф.И.О",
  "Продукт",
  "Тип агента",
  "Код",
  "ПИНФЛ",
  "Консигнация",
  "Версия APK",
  "Название устройства",
  "Последняя синхронизация",
  "Телефон",
  "Авторизоваться",
  "Тип цены",
  "Склад",
  "Направление торговли",
  "Филиал",
  "Должность",
  "Дата создания",
  "Доступ к приложение",
  "Количество активных сессий",
  "Максимальное количество сессий"
] as const;

const AGENT_TABLE_ID = "staff.agents.v1";

const AGENT_COLUMN_IDS = [
  "fio",
  "product",
  "agent_type",
  "code",
  "pinfl",
  "consignment",
  "apk_version",
  "device_name",
  "last_sync",
  "phone",
  "login",
  "price_types",
  "warehouse",
  "trade_direction",
  "branch",
  "position",
  "created_at",
  "app_access",
  "active_sessions",
  "max_sessions"
] as const;

const AGENT_COLUMNS = AGENT_COLUMN_IDS.map((id, i) => ({
  id,
  label: COLS[i] ?? id
}));

function agentExportCellString(r: AgentRow, colId: string): string {
  switch (colId) {
    case "fio":
      return r.fio;
    case "product":
      return r.product ?? "";
    case "agent_type":
      return r.agent_type ?? "";
    case "code":
      return r.code ?? "";
    case "pinfl":
      return r.pinfl ?? "";
    case "consignment":
      return r.consignment ? "Да" : "Нет";
    case "apk_version":
      return r.apk_version ?? "";
    case "device_name":
      return r.device_name ?? "";
    case "last_sync":
      return r.last_sync_at ? new Date(r.last_sync_at).toLocaleString("ru-RU") : "";
    case "phone":
      return r.phone ?? "";
    case "login":
      return r.login;
    case "price_types":
      return (r.price_types?.length ? r.price_types : r.price_type ? [r.price_type] : []).join(", ");
    case "warehouse":
      return r.warehouse ?? "";
    case "trade_direction":
      return r.trade_direction ?? "";
    case "branch":
      return r.branch ?? "";
    case "position":
      return r.position ?? "";
    case "created_at":
      return new Date(r.created_at).toLocaleDateString("ru-RU");
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

function randomPassword(len = 10) {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

type Props = { tenantSlug: string };

export function AgentsWorkspace({ tenantSlug }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"active" | "inactive">("active");
  const [draftBranch, setDraftBranch] = useState("");
  const [draftTd, setDraftTd] = useState("");
  const [draftPos, setDraftPos] = useState("");
  const [appliedBranch, setAppliedBranch] = useState("");
  const [appliedTd, setAppliedTd] = useState("");
  const [appliedPos, setAppliedPos] = useState("");
  const [search, setSearch] = useState("");
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);

  const tablePrefs = useUserTablePrefs({
    tenantSlug,
    tableId: AGENT_TABLE_ID,
    defaultColumnOrder: [...AGENT_COLUMN_IDS],
    defaultPageSize: 10,
    allowedPageSizes: [10, 20, 25, 50, 100, 500, 1000]
  });
  const pageSize = tablePrefs.pageSize;

  const [addOpen, setAddOpen] = useState(false);
  const [infoRow, setInfoRow] = useState<AgentRow | null>(null);
  const [editRow, setEditRow] = useState<AgentRow | null>(null);
  const [sessionAgent, setSessionAgent] = useState<AgentRow | null>(null);
  const [restrictAgent, setRestrictAgent] = useState<AgentRow | null>(null);
  const [deactivateAgent, setDeactivateAgent] = useState<AgentRow | null>(null);

  const filterOptQ = useQuery({
    queryKey: ["agents-filter-options", tenantSlug],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{
        data: { branches: string[]; trade_directions: string[]; positions: string[] };
      }>(`/api/${tenantSlug}/agents/filter-options`);
      return data.data;
    }
  });

  const profileQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug, "agents-workspace"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<TenantProfile>(`/api/${tenantSlug}/settings/profile`);
      return data;
    }
  });

  const branchOptions = useMemo(() => {
    const fromAgents = filterOptQ.data?.branches ?? [];
    const fromProfile = (profileQ.data?.references.branches ?? [])
      .filter((b) => b.active !== false)
      .map((b) => b.name.trim())
      .filter(Boolean);
    return Array.from(new Set([...fromProfile, ...fromAgents])).sort((a, b) => a.localeCompare(b, "ru"));
  }, [filterOptQ.data, profileQ.data]);

  const tradeDirectionOptions = useMemo(() => {
    const fromProfile = profileQ.data?.references.trade_directions ?? [];
    const fromFilters = filterOptQ.data?.trade_directions ?? [];
    return Array.from(new Set([...fromProfile, ...fromFilters])).sort((a, b) => a.localeCompare(b, "ru"));
  }, [profileQ.data, filterOptQ.data]);

  const listQ = useQuery({
    queryKey: ["agent", tenantSlug, tab, appliedBranch, appliedTd, appliedPos],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("is_active", tab === "active" ? "true" : "false");
      if (appliedBranch.trim()) params.set("branch", appliedBranch.trim());
      if (appliedTd.trim()) params.set("trade_direction", appliedTd.trim());
      if (appliedPos.trim()) params.set("position", appliedPos.trim());
      const { data } = await api.get<{ data: AgentRow[] }>(
        `/api/${tenantSlug}/agents?${params.toString()}`
      );
      return data.data;
    }
  });

  const warehousesQ = useQuery({
    queryKey: ["warehouses", tenantSlug, "agents-ws"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; name: string }[] }>(
        `/api/${tenantSlug}/warehouses`
      );
      return data.data;
    }
  });

  const priceTypesQ = useQuery({
    queryKey: ["price-types", tenantSlug, "agents-ws"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: string[] }>(`/api/${tenantSlug}/price-types?kind=sale`);
      return data.data;
    }
  });

  const tradeDirectionsQ = useQuery({
    queryKey: ["trade-directions", tenantSlug, "agents-ws"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{
        data: Array<{ id: number; name: string; code: string | null; is_active: boolean }>;
      }>(`/api/${tenantSlug}/trade-directions?is_active=true`);
      return data.data;
    }
  });

  const tradeDirectionRows = useMemo(() => tradeDirectionsQ.data ?? [], [tradeDirectionsQ.data]);

  const categoriesQ = useQuery({
    queryKey: ["product-categories", tenantSlug, "agents-ws"],
    enabled: Boolean(tenantSlug) && Boolean(restrictAgent),
    queryFn: async () => {
      const { data } = await api.get<{ data: ProductCategoryRow[] }>(
        `/api/${tenantSlug}/product-categories`
      );
      return data.data.filter((c) => c.is_active);
    }
  });

  const patchMut = useMutation({
    mutationFn: async (vars: { id: number; body: Record<string, unknown> }) => {
      const { data } = await api.patch<AgentRow>(`/api/${tenantSlug}/agents/${vars.id}`, vars.body);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["agent", tenantSlug] });
      void qc.invalidateQueries({ queryKey: ["agents-filter-options", tenantSlug] });
    }
  });

  const createMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.post<AgentRow>(`/api/${tenantSlug}/agents`, body);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["agent", tenantSlug] });
      void qc.invalidateQueries({ queryKey: ["agents-filter-options", tenantSlug] });
      setAddOpen(false);
    }
  });

  const deactivateMut = useMutation({
    mutationFn: async (id: number) => {
      await api.patch(`/api/${tenantSlug}/agents/${id}`, { is_active: false });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["agent", tenantSlug] });
      setDeactivateAgent(null);
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
        r.warehouse ?? "",
        ...(r.price_types ?? [])
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [listQ.data, search]);

  const pageRows = useMemo(() => {
    return filteredRows.slice(0, pageSize);
  }, [filteredRows, pageSize]);

  const applyFilters = () => {
    setAppliedBranch(draftBranch);
    setAppliedTd(draftTd);
    setAppliedPos(draftPos);
  };

  function renderAgentDataCell(colId: string, r: AgentRow) {
    switch (colId) {
      case "fio":
        return r.fio;
      case "product":
        return r.product ?? "—";
      case "agent_type":
        return r.agent_type ?? "—";
      case "code":
        return <span className="font-mono">{r.code ?? "—"}</span>;
      case "pinfl":
        return <span className="font-mono">{r.pinfl ?? "—"}</span>;
      case "consignment":
        return r.consignment ? "Да" : "Нет";
      case "apk_version":
        return r.apk_version ?? "—";
      case "device_name":
        return r.device_name ?? "—";
      case "last_sync":
        return r.last_sync_at ? new Date(r.last_sync_at).toLocaleString("ru-RU") : "—";
      case "phone":
        return r.phone ?? "—";
      case "login":
        return <span className="font-mono">{r.login}</span>;
      case "price_types":
        return (
          <div className="flex flex-wrap gap-1">
            {(r.price_types?.length ? r.price_types : r.price_type ? [r.price_type] : []).map((p) => (
              <span key={p} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                {p}
              </span>
            ))}
            {!r.price_types?.length && !r.price_type && "—"}
          </div>
        );
      case "warehouse":
        return r.warehouse ?? "—";
      case "trade_direction":
        return r.trade_direction ?? "—";
      case "branch":
        return r.branch ?? "—";
      case "position":
        return r.position ?? "—";
      case "created_at":
        return new Date(r.created_at).toLocaleDateString("ru-RU");
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
            onClick={() => setSessionAgent(r)}
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
          <span className="sr-only">Филиал</span>
          <FilterSelect
            aria-label="Филиал"
            emptyLabel="Филиал"
            value={draftBranch}
            onChange={(e) => setDraftBranch(e.target.value)}
          >
            {branchOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </FilterSelect>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="sr-only">Направление торговли</span>
          <FilterSelect
            aria-label="Направление торговли"
            emptyLabel="Направление торговли"
            value={draftTd}
            onChange={(e) => setDraftTd(e.target.value)}
          >
            {(filterOptQ.data?.trade_directions ?? []).map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </FilterSelect>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="sr-only">Должность</span>
          <FilterSelect
            aria-label="Должность"
            emptyLabel="Должность"
            value={draftPos}
            onChange={(e) => setDraftPos(e.target.value)}
          >
            {(filterOptQ.data?.positions ?? []).map((b) => (
              <option key={b} value={b}>
                {b}
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
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
            Добавить агента
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
          {[10, 20, 25, 50, 100, 500, 1000].map((n) => (
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
            const headers = order.map((id) => AGENT_COLUMNS.find((c) => c.id === id)?.label ?? id);
            const rows = filteredRows.map((r) => order.map((colId) => agentExportCellString(r, colId)));
            downloadXlsxSheet(`agents_${tab}_${new Date().toISOString().slice(0, 10)}.xlsx`, "Агенты", headers, rows);
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
        columns={AGENT_COLUMNS}
        columnOrder={tablePrefs.columnOrder}
        hiddenColumnIds={tablePrefs.hiddenColumnIds}
        saving={tablePrefs.saving}
        onSave={(next) => tablePrefs.saveColumnLayout(next)}
        onReset={() => tablePrefs.resetColumnLayout()}
      />

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[2200px] text-xs">
          <thead className="bg-muted/50">
            <tr>
              {tablePrefs.visibleColumnOrder.map((colId) => {
                const meta = AGENT_COLUMNS.find((c) => c.id === colId);
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
                {tablePrefs.visibleColumnOrder.map((colId) => (
                  <td key={colId} className={colId === "price_types" ? "max-w-[10rem] px-2 py-2" : "px-2 py-2"}>
                    {renderAgentDataCell(colId, r)}
                  </td>
                ))}
                <td className="px-2 py-2 text-right">
                  <TableRowActionGroup className="justify-end" ariaLabel="Agent">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-foreground"
                      title="Активные сессии"
                      aria-label="Активные сессии"
                      onClick={() => setSessionAgent(r)}
                    >
                      <MonitorSmartphone className="size-3.5" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-foreground"
                      title="Изменить ограничения"
                      aria-label="Изменить ограничения"
                      onClick={() => setRestrictAgent(r)}
                    >
                      <Settings2 className="size-3.5" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-foreground"
                      title="Инфо"
                      aria-label="Инфо"
                      onClick={() => setInfoRow(r)}
                    >
                      <Eye className="size-3.5" aria-hidden />
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
                        onClick={() => setDeactivateAgent(r)}
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

      <p className="text-xs text-muted-foreground">
        Показано {pageRows.length} / {filteredRows.length}
        {listQ.data && listQ.data.length !== filteredRows.length ? ` (вкладка: ${listQ.data.length})` : ""}
      </p>

      <AgentAddDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        warehouses={warehousesQ.data ?? []}
        branchOptions={branchOptions}
        tradeDirections={tradeDirectionRows}
        loading={createMut.isPending}
        onSubmit={(body) => createMut.mutate(body)}
      />

      <AgentInfoDialog row={infoRow} onClose={() => setInfoRow(null)} />

      <AgentEditDialog
        row={editRow}
        onClose={() => setEditRow(null)}
        tenantSlug={tenantSlug}
        warehouses={warehousesQ.data ?? []}
        branchOptions={branchOptions}
        tradeDirections={tradeDirectionRows}
        onPatch={(id, body) => patchMut.mutateAsync({ id, body })}
        onOpenRestrictions={(r) => {
          setEditRow(null);
          setRestrictAgent(r);
        }}
      />

      <StaffActiveSessionsDialog
        open={sessionAgent != null}
        onOpenChange={(open) => {
          if (!open) setSessionAgent(null);
        }}
        tenantSlug={tenantSlug}
        staffKind="agent"
        userId={sessionAgent?.id ?? null}
        maxSessions={sessionAgent?.max_sessions ?? 2}
        onPatched={() => {
          void qc.invalidateQueries({ queryKey: ["agent", tenantSlug] });
        }}
      />

      <RestrictionsDialog
        agent={restrictAgent}
        onClose={() => setRestrictAgent(null)}
        tenantSlug={tenantSlug}
        categories={categoriesQ.data ?? []}
        priceTypes={priceTypesQ.data ?? []}
        onSave={(id, ent) => patchMut.mutateAsync({ id, body: { agent_entitlements: ent } })}
      />

      <Dialog open={Boolean(deactivateAgent)} onOpenChange={(o) => !o && setDeactivateAgent(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Деактивировать агента</DialogTitle>
          </DialogHeader>
          <p className="text-sm">Вы хотите деактивировать агента?</p>
          <DialogFooter className="flex-row justify-end gap-2 border-0 bg-transparent p-0">
            <Button type="button" variant="outline" onClick={() => setDeactivateAgent(null)}>
              Нет
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deactivateMut.isPending}
              onClick={() => deactivateAgent && deactivateMut.mutate(deactivateAgent.id)}
            >
              Да
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AgentInfoDialog({ row, onClose }: { row: AgentRow | null; onClose: () => void }) {
  if (!row) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Агент</DialogTitle>
        </DialogHeader>
        <dl className="grid grid-cols-[8rem_1fr] gap-x-2 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Ф.И.О</dt>
          <dd>{row.fio}</dd>
          <dt className="text-muted-foreground">Логин</dt>
          <dd className="font-mono">{row.login}</dd>
          <dt className="text-muted-foreground">Телефон</dt>
          <dd>{row.phone ?? "—"}</dd>
          <dt className="text-muted-foreground">E-mail</dt>
          <dd>{row.email ?? "—"}</dd>
          <dt className="text-muted-foreground">Код</dt>
          <dd>{row.code ?? "—"}</dd>
          <dt className="text-muted-foreground">ПИНФЛ</dt>
          <dd>{row.pinfl ?? "—"}</dd>
          <dt className="text-muted-foreground">Склад</dt>
          <dd>{row.warehouse ?? "—"}</dd>
          <dt className="text-muted-foreground">Филиал</dt>
          <dd>{row.branch ?? "—"}</dd>
          <dt className="text-muted-foreground">Направление</dt>
          <dd>{row.trade_direction ?? "—"}</dd>
          <dt className="text-muted-foreground">Тип цены</dt>
          <dd>{(row.price_types ?? []).join(", ") || row.price_type || "—"}</dd>
          <dt className="text-muted-foreground">Сессии</dt>
          <dd>
            {row.active_session_count} / {row.max_sessions}
          </dd>
          <dt className="text-muted-foreground">APK</dt>
          <dd>{row.apk_version ?? "—"}</dd>
          <dt className="text-muted-foreground">Устройство</dt>
          <dd>{row.device_name ?? "—"}</dd>
        </dl>
      </DialogContent>
    </Dialog>
  );
}

function AgentAddDialog({
  open,
  onOpenChange,
  warehouses,
  branchOptions,
  tradeDirections,
  loading,
  onSubmit
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  warehouses: { id: number; name: string }[];
  branchOptions: string[];
  tradeDirections: Array<{ id: number; name: string; code: string | null }>;
  loading: boolean;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [first_name, setFirst] = useState("");
  const [last_name, setLast] = useState("");
  const [middle_name, setMid] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [warehouse_id, setWh] = useState("");
  const [trade_direction_id, setTdId] = useState("");
  const [agent_type, setAgentType] = useState("Торговый представитель");
  const [branch, setBranch] = useState("");
  const [position, setPos] = useState("");
  const [code, setCode] = useState("");
  const [pinfl, setPinfl] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [consignment, setConsignment] = useState(false);
  const [kpi_color, setKpi] = useState("#ef4444");
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFirst("");
    setLast("");
    setMid("");
    setPhone("");
    setEmail("");
    setWh("");
    setTdId("");
    setAgentType("Торговый представитель");
    setBranch("");
    setPos("");
    setCode("");
    setPinfl("");
    setLogin("");
    setPassword(randomPassword());
    setConsignment(false);
    setKpi("#ef4444");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Добавить агента</DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[70vh] gap-3 overflow-y-auto pr-1">
          <Input placeholder="Имя *" value={first_name} onChange={(e) => setFirst(e.target.value)} />
          <Input placeholder="Фамилия" value={last_name} onChange={(e) => setLast(e.target.value)} />
          <Input placeholder="Отчество" value={middle_name} onChange={(e) => setMid(e.target.value)} />
          <Input placeholder="Телефон" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label className="text-xs text-muted-foreground">
            Склад
            <FilterSelect
              className="mt-1 h-10 w-full min-w-0 max-w-none rounded-md border border-input bg-background p-2 text-sm"
              emptyLabel="Склад"
              aria-label="Склад"
              value={warehouse_id}
              onChange={(e) => setWh(e.target.value)}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </FilterSelect>
          </label>
          <label className="text-xs text-muted-foreground">
            Направление торговли (spravochnik)
            <FilterSelect
              className="mt-1 h-10 w-full min-w-0 max-w-none rounded-md border border-input bg-background p-2 text-sm"
              emptyLabel="Tanlanmagan"
              aria-label="Направление торговли"
              value={trade_direction_id}
              onChange={(e) => setTdId(e.target.value)}
            >
              {tradeDirections.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.name}
                  {t.code ? ` (${t.code})` : ""}
                </option>
              ))}
            </FilterSelect>
          </label>
          <label className="text-xs text-muted-foreground">
            Тип агента
            <select
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm"
              value={agent_type}
              onChange={(e) => setAgentType(e.target.value)}
            >
              <option value="Торговый представитель">Торговый представитель</option>
              <option value="Мерчендайзер">Мерчендайзер</option>
            </select>
          </label>
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
          <Input placeholder="Должность" value={position} onChange={(e) => setPos(e.target.value)} />
          <Input placeholder="Код" value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} />
          <Input placeholder="ПИНФЛ" value={pinfl} onChange={(e) => setPinfl(e.target.value)} />
          <Input placeholder="Логин *" value={login} onChange={(e) => setLogin(e.target.value)} />
          <div className="flex gap-2">
            <Input
              placeholder="Пароль *"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => setPassword(randomPassword())}>
              ↻
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowPw((s) => !s)}>
              👁
            </Button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={consignment} onChange={(e) => setConsignment(e.target.checked)} />
            Консигнация
          </label>
          <label className="flex items-center gap-2 text-sm">
            KPI цвет
            <input type="color" value={kpi_color} onChange={(e) => setKpi(e.target.value)} className="h-8 w-12" />
          </label>
        </div>
        <DialogFooter className="flex-col gap-2 border-0 bg-transparent p-0 sm:flex-col">
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => {
              /* ограничения в отдельном модале после создания — упрощение */
            }}
            disabled
          >
            Ограничения (после сохранения)
          </Button>
          <Button
            type="button"
            className="w-full"
            disabled={loading || !first_name.trim() || !login.trim() || password.length < 6}
            onClick={() =>
              onSubmit({
                first_name: first_name.trim(),
                last_name: last_name.trim() || null,
                middle_name: middle_name.trim() || null,
                phone: phone.trim() || null,
                email: email.trim() || null,
                warehouse_id: warehouse_id ? Number.parseInt(warehouse_id, 10) : null,
                trade_direction_id: trade_direction_id.trim()
                  ? Number.parseInt(trade_direction_id.trim(), 10)
                  : null,
                agent_type: agent_type.trim() || null,
                branch: branch.trim() || null,
                position: position.trim() || null,
                code: code.trim() || null,
                pinfl: pinfl.trim() || null,
                login: login.trim().toLowerCase(),
                password,
                consignment,
                kpi_color: kpi_color || null,
                max_sessions: 2,
                app_access: true,
                can_authorize: true
              })
            }
          >
            Добавить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AgentEditDialog({
  row,
  onClose,
  tenantSlug,
  warehouses,
  branchOptions,
  tradeDirections,
  onPatch,
  onOpenRestrictions
}: {
  row: AgentRow | null;
  onClose: () => void;
  tenantSlug: string;
  warehouses: { id: number; name: string }[];
  branchOptions: string[];
  tradeDirections: Array<{ id: number; name: string; code: string | null }>;
  onPatch: (id: number, body: Record<string, unknown>) => Promise<unknown>;
  onOpenRestrictions: (r: AgentRow) => void;
}) {
  const detailQ = useQuery({
    queryKey: ["agent-detail", tenantSlug, row?.id],
    enabled: Boolean(row),
    queryFn: async () => {
      const { data } = await api.get<{ data: AgentRow }>(`/api/${tenantSlug}/agents/${row!.id}`);
      return data.data;
    }
  });

  const r = detailQ.data ?? row;
  const [first_name, setFirst] = useState("");
  const [last_name, setLast] = useState("");
  const [middle_name, setMid] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [warehouse_id, setWh] = useState("");
  const [trade_direction_id, setTdId] = useState("");
  const [agent_type, setAgentType] = useState("");
  const [branch, setBranch] = useState("");
  const [position, setPos] = useState("");
  const [code, setCode] = useState("");
  const [pinfl, setPinfl] = useState("");
  const [login, setLogin] = useState("");
  const [consignment, setConsignment] = useState(false);
  const [kpi_color, setKpi] = useState("#ef4444");
  const [pwMode, setPwMode] = useState(false);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!r) return;
    const parts = r.fio.split(/\s+/);
    setFirst(parts[1] ?? parts[0] ?? "");
    setLast(parts[0] ?? "");
    setMid(parts[2] ?? "");
    setPhone(r.phone ?? "");
    setEmail(r.email ?? "");
    const wh = warehouses.find((w) => w.name === r.warehouse);
    setWh(wh ? String(wh.id) : "");
    if (r.trade_direction_id != null && r.trade_direction_id > 0) {
      setTdId(String(r.trade_direction_id));
    } else {
      const legacy = (r.trade_direction ?? "").trim();
      const match = tradeDirections.find(
        (d) =>
          (d.code && d.code.trim() === legacy) ||
          d.name.trim() === legacy ||
          legacy === `${d.name} (${d.code})`.trim()
      );
      setTdId(match ? String(match.id) : "");
    }
    setAgentType(r.agent_type ?? "");
    setBranch(r.branch ?? "");
    setPos(r.position ?? "");
    setCode(r.code ?? "");
    setPinfl(r.pinfl ?? "");
    setLogin(r.login);
    setConsignment(r.consignment);
    setKpi(r.kpi_color || "#ef4444");
    setPwMode(false);
    setPassword("");
  }, [r, warehouses, tradeDirections]);

  if (!row || !r) return null;

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        first_name: first_name.trim(),
        last_name: last_name.trim() || null,
        middle_name: middle_name.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        warehouse_id: warehouse_id ? Number.parseInt(warehouse_id, 10) : null,
        trade_direction_id: trade_direction_id.trim()
          ? Number.parseInt(trade_direction_id.trim(), 10)
          : null,
        agent_type: agent_type.trim() || null,
        branch: branch.trim() || null,
        position: position.trim() || null,
        code: code.trim() || null,
        pinfl: pinfl.trim() || null,
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

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-md overflow-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Редактировать</DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[calc(92vh-8rem)] gap-3 overflow-y-auto pr-1">
          <Input placeholder="Имя *" value={first_name} onChange={(e) => setFirst(e.target.value)} />
          <Input placeholder="Фамилия" value={last_name} onChange={(e) => setLast(e.target.value)} />
          <Input placeholder="Отчество" value={middle_name} onChange={(e) => setMid(e.target.value)} />
          <Input placeholder="Телефон" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label className="text-xs text-muted-foreground">
            Склад
            <FilterSelect
              className="mt-1 h-10 w-full min-w-0 max-w-none rounded-md border border-input bg-background p-2 text-sm"
              emptyLabel="Склад"
              aria-label="Склад"
              value={warehouse_id}
              onChange={(e) => setWh(e.target.value)}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </FilterSelect>
          </label>
          <label className="text-xs text-muted-foreground">
            Направление торговли (spravochnik)
            <FilterSelect
              className="mt-1 h-10 w-full min-w-0 max-w-none rounded-md border border-input bg-background p-2 text-sm"
              emptyLabel="Tanlanmagan"
              aria-label="Направление торговли"
              value={trade_direction_id}
              onChange={(e) => setTdId(e.target.value)}
            >
              {tradeDirections.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.name}
                  {t.code ? ` (${t.code})` : ""}
                </option>
              ))}
            </FilterSelect>
          </label>
          <Input placeholder="Тип агента" value={agent_type} onChange={(e) => setAgentType(e.target.value)} />
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
          <Input placeholder="Должность" value={position} onChange={(e) => setPos(e.target.value)} />
          <Input placeholder="Логин" value={login} onChange={(e) => setLogin(e.target.value)} disabled />
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
            KPI цвет
            <input type="color" value={kpi_color} onChange={(e) => setKpi(e.target.value)} className="h-8 w-12" />
          </label>
          <p className="text-xs text-muted-foreground">
            Тип цены: {(r.price_types ?? []).length || "—"} шт. · Продукты: ограничения в модале
          </p>
        </div>
        <DialogFooter className="flex-col gap-2 border-0 bg-transparent p-0 sm:flex-col">
          <Button type="button" variant="secondary" className="w-full" onClick={() => onOpenRestrictions(r)}>
            Ограничения
          </Button>
          <Button
            type="button"
            className="w-full"
            disabled={saving || !first_name.trim()}
            onClick={() => void save()}
          >
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useCategoryProducts(tenantSlug: string, categoryId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ["products-by-cat", tenantSlug, categoryId],
    enabled: Boolean(tenantSlug) && enabled && categoryId != null,
    queryFn: async () => {
      const { data } = await api.get<{ data: ProductListItem[] }>(
        `/api/${tenantSlug}/products?category_id=${categoryId}&limit=100&is_active=true`
      );
      return data.data;
    }
  });
}

function RestrictionsDialog({
  agent,
  onClose,
  tenantSlug,
  categories,
  priceTypes,
  onSave
}: {
  agent: AgentRow | null;
  onClose: () => void;
  tenantSlug: string;
  categories: ProductCategoryRow[];
  priceTypes: string[];
  onSave: (id: number, ent: Record<string, unknown>) => Promise<unknown>;
}) {
  const [ptSel, setPtSel] = useState<Set<string>>(new Set());
  const [ptSearch, setPtSearch] = useState("");
  const [prSearch, setPrSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [catChecked, setCatChecked] = useState<Record<number, boolean>>({});
  const [prodChecked, setProdChecked] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!agent) return;
    const pts = new Set(agent.price_types?.length ? agent.price_types : agent.price_type ? [agent.price_type] : []);
    const entPts = agent.agent_entitlements?.price_types ?? [];
    entPts.forEach((p) => pts.add(p));
    setPtSel(pts);
    const rules = agent.agent_entitlements?.product_rules ?? [];
    const cc: Record<number, boolean> = {};
    const pc: Record<string, boolean> = {};
    const exp = new Set<number>();
    for (const rule of rules) {
      cc[rule.category_id] = true;
      if (rule.all) {
        /* whole category */
      } else if (rule.product_ids?.length) {
        exp.add(rule.category_id);
        for (const pid of rule.product_ids) {
          pc[`${rule.category_id}:${pid}`] = true;
        }
      }
    }
    setCatChecked(cc);
    setProdChecked(pc);
    setExpanded(exp);
    setPtSearch("");
    setPrSearch("");
  }, [agent]);

  if (!agent) return null;

  const filteredPt = priceTypes.filter((p) => p.toLowerCase().includes(ptSearch.trim().toLowerCase()));
  const filteredCat = categories.filter((c) => c.name.toLowerCase().includes(prSearch.trim().toLowerCase()));

  const buildRules = (): Array<{ category_id: number; all: boolean; product_ids?: number[] }> => {
    const out: Array<{ category_id: number; all: boolean; product_ids?: number[] }> = [];
    for (const c of categories) {
      if (!catChecked[c.id]) continue;
      if (!expanded.has(c.id)) {
        out.push({ category_id: c.id, all: true });
        continue;
      }
      const ids = Object.keys(prodChecked)
        .filter((k) => k.startsWith(`${c.id}:`) && prodChecked[k])
        .map((k) => Number.parseInt(k.split(":")[1]!, 10));
      if (ids.length === 0) {
        out.push({ category_id: c.id, all: true });
      } else {
        out.push({ category_id: c.id, all: false, product_ids: ids });
      }
    }
    return out;
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(agent.id, {
        price_types: Array.from(ptSel),
        product_rules: buildRules()
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Ограничения</DialogTitle>
          <p className="text-sm text-muted-foreground">Агент: {agent.fio}</p>
        </DialogHeader>
        <div className="grid max-h-[65vh] grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex min-h-0 flex-col rounded-md border">
            <div className="border-b p-2 text-sm font-medium">Тип цены</div>
            <Input
              placeholder="Поиск"
              className="m-2"
              value={ptSearch}
              onChange={(e) => setPtSearch(e.target.value)}
            />
            <label className="flex items-center gap-2 border-b px-2 py-1 text-xs">
              <input
                type="checkbox"
                checked={filteredPt.length > 0 && filteredPt.every((p) => ptSel.has(p))}
                onChange={(e) => {
                  const n = new Set(ptSel);
                  if (e.target.checked) filteredPt.forEach((p) => n.add(p));
                  else filteredPt.forEach((p) => n.delete(p));
                  setPtSel(n);
                }}
              />
              Выбрать все
            </label>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {filteredPt.map((p) => (
                <label key={p} className="flex items-center gap-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={ptSel.has(p)}
                    onChange={(e) => {
                      const n = new Set(ptSel);
                      if (e.target.checked) n.add(p);
                      else n.delete(p);
                      setPtSel(n);
                    }}
                  />
                  {p}
                </label>
              ))}
            </div>
          </div>
          <div className="flex min-h-0 flex-col rounded-md border">
            <div className="border-b p-2 text-sm font-medium">Продукт</div>
            <Input
              placeholder="Поиск"
              className="m-2"
              value={prSearch}
              onChange={(e) => setPrSearch(e.target.value)}
            />
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {filteredCat.map((c) => (
                <CategoryRestrictRow
                  key={c.id}
                  tenantSlug={tenantSlug}
                  cat={c}
                  expanded={expanded.has(c.id)}
                  onToggleExpand={() => {
                    const n = new Set(expanded);
                    if (n.has(c.id)) n.delete(c.id);
                    else n.add(c.id);
                    setExpanded(n);
                  }}
                  checked={Boolean(catChecked[c.id])}
                  onToggleCat={(v) => setCatChecked((p) => ({ ...p, [c.id]: v }))}
                  prodChecked={prodChecked}
                  setProdChecked={setProdChecked}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryRestrictRow({
  tenantSlug,
  cat,
  expanded,
  onToggleExpand,
  checked,
  onToggleCat,
  prodChecked,
  setProdChecked
}: {
  tenantSlug: string;
  cat: ProductCategoryRow;
  expanded: boolean;
  onToggleExpand: () => void;
  checked: boolean;
  onToggleCat: (v: boolean) => void;
  prodChecked: Record<string, boolean>;
  setProdChecked: import("react").Dispatch<import("react").SetStateAction<Record<string, boolean>>>;
}) {
  const q = useCategoryProducts(tenantSlug, cat.id, expanded);
  const products = q.data ?? [];

  return (
    <div className="border-b border-border/60 py-1">
      <div className="flex items-center gap-1">
        <button type="button" className="p-0.5" onClick={onToggleExpand}>
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <label className="flex flex-1 items-center gap-2 text-sm">
          <input type="checkbox" checked={checked} onChange={(e) => onToggleCat(e.target.checked)} />
          {cat.name}
        </label>
      </div>
      {expanded && checked && (
        <div className="ml-6 mt-1 space-y-1 border-l pl-2">
          {q.isLoading && <p className="text-xs text-muted-foreground">Yuklanmoqda…</p>}
          {products.map((p) => {
            const key = `${cat.id}:${p.id}`;
            return (
              <label key={p.id} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={Boolean(prodChecked[key])}
                  onChange={(e) =>
                    setProdChecked((prev) => ({ ...prev, [key]: e.target.checked }))
                  }
                />
                {p.name}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
