"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { FilterSelect } from "@/components/ui/filter-select";
import { downloadXlsxSheet } from "@/lib/download-xlsx";
import { TableColumnSettingsDialog } from "@/components/data-table/table-column-settings-dialog";
import { TableRowActionGroup } from "@/components/data-table/table-row-actions";
import { useUserTablePrefs } from "@/hooks/use-user-table-prefs";
import { StaffActiveSessionsDialog } from "@/components/staff/staff-active-sessions-dialog";
import { messageFromStaffCreateError } from "@/lib/staff-api-errors";
import { Eye, Link2, ListOrdered, MonitorSmartphone, Pencil, RefreshCw, UserMinus } from "lucide-react";

export type ExpeditorAssignmentRules = {
  price_types?: string[];
  agent_ids?: number[];
  warehouse_ids?: number[];
  trade_directions?: string[];
  territories?: string[];
  weekdays?: number[];
};

export type ExpeditorRow = {
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
  expeditor_assignment_rules: ExpeditorAssignmentRules;
};

type TenantProfile = {
  references: {
    branches?: Array<{ id: string; name: string; active?: boolean }>;
    trade_directions?: string[];
  };
};

const COLS = [
  "Ф.И.О",
  "Авторизоваться",
  "Телефон",
  "Код",
  "Склад",
  "Версия APK",
  "ПИНФЛ",
  "Территория",
  "Название устройства",
  "Последняя синхронизация",
  "Филиал",
  "Должность",
  "Дата создания",
  "Доступ к приложение",
  "Количество активных сессий",
  "Максимальное количество сессий"
] as const;

const EXPEDITOR_TABLE_ID = "staff.expeditors.v1";
const EXPEDITOR_COLUMN_IDS = [
  "fio",
  "login",
  "phone",
  "code",
  "warehouse",
  "apk_version",
  "pinfl",
  "territory",
  "device_name",
  "last_sync",
  "branch",
  "position",
  "created_at",
  "app_access",
  "active_sessions",
  "max_sessions"
] as const;
const EXPEDITOR_COLUMNS = EXPEDITOR_COLUMN_IDS.map((id, i) => ({
  id,
  label: COLS[i] ?? id
}));

function randomPassword(len = 10) {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

type Props = { tenantSlug: string };

export function ExpeditorsWorkspace({ tenantSlug }: Props) {
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
    tableId: EXPEDITOR_TABLE_ID,
    defaultColumnOrder: [...EXPEDITOR_COLUMN_IDS],
    defaultPageSize: 10,
    allowedPageSizes: [10, 20, 25, 50, 100]
  });
  const pageSize = tablePrefs.pageSize;

  const [addOpen, setAddOpen] = useState(false);
  const [createExpeditorError, setCreateExpeditorError] = useState<string | null>(null);
  const [infoRow, setInfoRow] = useState<ExpeditorRow | null>(null);
  const [editRow, setEditRow] = useState<ExpeditorRow | null>(null);
  const [sessionExpeditor, setSessionExpeditor] = useState<ExpeditorRow | null>(null);
  const [assignRow, setAssignRow] = useState<ExpeditorRow | null>(null);
  const [deactivateExpeditor, setDeactivateExpeditor] = useState<ExpeditorRow | null>(null);
  const [draftOblast, setDraftOblast] = useState("");
  const [draftCity, setDraftCity] = useState("");
  const [appliedOblast, setAppliedOblast] = useState("");
  const [appliedCity, setAppliedCity] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const headerCbRef = useRef<HTMLInputElement>(null);

  const filterOptQ = useQuery({
    queryKey: ["expeditors-filter-options", tenantSlug],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{
        data: {
          branches: string[];
          trade_directions: string[];
          positions: string[];
          territories: string[];
          territory_tokens: string[];
        };
      }>(`/api/${tenantSlug}/expeditors/filter-options`);
      return data.data;
    }
  });

  const profileQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug, "expeditors-workspace"],
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

  const listQ = useQuery({
    queryKey: [
      "expeditors",
      tenantSlug,
      tab,
      appliedBranch,
      appliedTd,
      appliedPos,
      appliedOblast,
      appliedCity
    ],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("is_active", tab === "active" ? "true" : "false");
      if (appliedBranch.trim()) params.set("branch", appliedBranch.trim());
      if (appliedTd.trim()) params.set("trade_direction", appliedTd.trim());
      if (appliedPos.trim()) params.set("position", appliedPos.trim());
      if (appliedOblast.trim()) params.set("territory_oblast", appliedOblast.trim());
      if (appliedCity.trim()) params.set("territory_city", appliedCity.trim());
      const { data } = await api.get<{ data: ExpeditorRow[] }>(
        `/api/${tenantSlug}/expeditors?${params.toString()}`
      );
      return data.data;
    }
  });

  const warehousesQ = useQuery({
    queryKey: ["warehouses", tenantSlug, "expeditors-ws"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; name: string }[] }>(
        `/api/${tenantSlug}/warehouses`
      );
      return data.data;
    }
  });

  const priceTypesQ = useQuery({
    queryKey: ["price-types", tenantSlug, "expeditors-ws"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: string[] }>(`/api/${tenantSlug}/price-types?kind=sale`);
      return data.data;
    }
  });

  const tradeDirectionsQ = useQuery({
    queryKey: ["trade-directions", tenantSlug, "expeditors-ws"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{
        data: Array<{ id: number; name: string; code: string | null; is_active: boolean }>;
      }>(`/api/${tenantSlug}/trade-directions?is_active=true`);
      return data.data;
    }
  });

  const tradeDirectionRows = useMemo(() => tradeDirectionsQ.data ?? [], [tradeDirectionsQ.data]);

  const agentsPickerQ = useQuery({
    queryKey: ["agents", tenantSlug, "expeditors-assign"],
    enabled: Boolean(tenantSlug) && Boolean(assignRow),
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
      const { data } = await api.patch<ExpeditorRow>(`/api/${tenantSlug}/expeditors/${vars.id}`, vars.body);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["expeditors", tenantSlug] });
      void qc.invalidateQueries({ queryKey: ["expeditors-filter-options", tenantSlug] });
    }
  });

  const createMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.post<ExpeditorRow>(`/api/${tenantSlug}/expeditors`, body);
      return data;
    },
    onSuccess: () => {
      setCreateExpeditorError(null);
      void qc.invalidateQueries({ queryKey: ["expeditors", tenantSlug] });
      void qc.invalidateQueries({ queryKey: ["expeditors-filter-options", tenantSlug] });
      setAddOpen(false);
    },
    onError: (e: Error) => {
      const m = messageFromStaffCreateError(e);
      setCreateExpeditorError(m ?? e.message ?? "Xatolik");
    }
  });

  const deactivateMut = useMutation({
    mutationFn: async (id: number) => {
      await api.patch(`/api/${tenantSlug}/expeditors/${id}`, { is_active: false });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["expeditors", tenantSlug] });
      setDeactivateExpeditor(null);
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

  useEffect(() => {
    setSelectedIds(new Set());
  }, [tab]);

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selectedIds.has(r.id));
  const someOnPageSelected = pageRows.some((r) => selectedIds.has(r.id));
  useEffect(() => {
    const el = headerCbRef.current;
    if (!el) return;
    el.indeterminate = someOnPageSelected && !allOnPageSelected;
  }, [someOnPageSelected, allOnPageSelected]);

  const toggleExpeditorSelection = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAllExpeditorsOnPage = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const r of pageRows) next.add(r.id);
      } else {
        for (const r of pageRows) next.delete(r.id);
      }
      return next;
    });
  };

  const territoryFilterOptions = useMemo(() => {
    const t = filterOptQ.data?.territory_tokens ?? [];
    const full = filterOptQ.data?.territories ?? [];
    return Array.from(new Set([...full, ...t])).sort((a, b) => a.localeCompare(b, "ru"));
  }, [filterOptQ.data]);

  const assignmentTerritoryOptions = useMemo(() => {
    const fromRules = assignRow?.expeditor_assignment_rules?.territories ?? [];
    return Array.from(new Set([...territoryFilterOptions, ...fromRules])).sort((a, b) =>
      a.localeCompare(b, "ru")
    );
  }, [territoryFilterOptions, assignRow]);

  const assignmentTradeDirections = useMemo(() => {
    const fromProfile = profileQ.data?.references.trade_directions ?? [];
    const fromFilters = filterOptQ.data?.trade_directions ?? [];
    const fromRules = assignRow?.expeditor_assignment_rules?.trade_directions ?? [];
    return Array.from(new Set([...fromProfile, ...fromFilters, ...fromRules])).sort((a, b) =>
      a.localeCompare(b, "ru")
    );
  }, [profileQ.data, filterOptQ.data, assignRow]);

  const applyFilters = () => {
    setAppliedBranch(draftBranch);
    setAppliedTd(draftTd);
    setAppliedPos(draftPos);
    setAppliedOblast(draftOblast);
    setAppliedCity(draftCity);
  };

  function expeditorExportCellString(r: ExpeditorRow, colId: string): string {
    switch (colId) {
      case "fio":
        return r.fio;
      case "login":
        return r.login;
      case "phone":
        return r.phone ?? "";
      case "code":
        return r.code ?? "";
      case "warehouse":
        return r.warehouse ?? "";
      case "apk_version":
        return r.apk_version ?? "";
      case "pinfl":
        return r.pinfl ?? "";
      case "territory":
        return r.territory ?? "";
      case "device_name":
        return r.device_name ?? "";
      case "last_sync":
        return r.last_sync_at ? new Date(r.last_sync_at).toLocaleString("ru-RU") : "";
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

  function renderExpeditorDataCell(colId: string, r: ExpeditorRow) {
    switch (colId) {
      case "fio":
        return r.fio;
      case "login":
        return <span className="font-mono">{r.login}</span>;
      case "phone":
        return r.phone ?? "—";
      case "code":
        return <span className="font-mono">{r.code ?? "—"}</span>;
      case "warehouse":
        return r.warehouse ?? "—";
      case "apk_version":
        return r.apk_version ?? "—";
      case "pinfl":
        return <span className="font-mono">{r.pinfl ?? "—"}</span>;
      case "territory":
        return <span className="max-w-[14rem]">{r.territory ?? "—"}</span>;
      case "device_name":
        return r.device_name ?? "—";
      case "last_sync":
        return r.last_sync_at ? new Date(r.last_sync_at).toLocaleString("ru-RU") : "—";
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
            onClick={() => setSessionExpeditor(r)}
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
    <div className="space-y-0">
      <div className="orders-hub-section orders-hub-section--filters orders-hub-section--stack-tight">
        <Card className="rounded-none border-0 bg-transparent shadow-none hover:shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-foreground/88">
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
        <label className="flex flex-col gap-1 text-xs font-medium text-foreground/88">
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
        <label className="flex flex-col gap-1 text-xs font-medium text-foreground/88">
          <span className="sr-only">Зона</span>
          <FilterSelect
            aria-label="Зона"
            emptyLabel="Зона"
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
        <label className="flex flex-col gap-1 text-xs font-medium text-foreground/88">
          <span className="sr-only">Область</span>
          <FilterSelect
            aria-label="Область"
            emptyLabel="Область"
            value={draftOblast}
            onChange={(e) => setDraftOblast(e.target.value)}
          >
            {territoryFilterOptions.map((b) => (
              <option key={`o-${b}`} value={b}>
                {b}
              </option>
            ))}
          </FilterSelect>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-foreground/88">
          <span className="sr-only">Город</span>
          <FilterSelect
            aria-label="Город"
            emptyLabel="Город"
            value={draftCity}
            onChange={(e) => setDraftCity(e.target.value)}
          >
            {territoryFilterOptions.map((b) => (
              <option key={`c-${b}`} value={b}>
                {b}
              </option>
            ))}
          </FilterSelect>
        </label>
        </div>
        <div className="flex shrink-0 items-end">
        <Button
          type="button"
          size="sm"
          className="min-w-[7.5rem] bg-teal-700 text-white hover:bg-teal-800"
          onClick={applyFilters}
        >
          Применить
        </Button>
        </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <TableColumnSettingsDialog
        open={columnDialogOpen}
        onOpenChange={setColumnDialogOpen}
        title="Управление столбцами"
        description="Выберите видимые столбцы и порядок. Сохраняется для вашей учётной записи."
        columns={EXPEDITOR_COLUMNS}
        columnOrder={tablePrefs.columnOrder}
        hiddenColumnIds={tablePrefs.hiddenColumnIds}
        saving={tablePrefs.saving}
        onSave={(next) => tablePrefs.saveColumnLayout(next)}
        onReset={() => tablePrefs.resetColumnLayout()}
      />

      <div className="orders-hub-section orders-hub-section--table mt-4">
        <Card className="overflow-hidden rounded-none border-0 bg-transparent shadow-none hover:shadow-none">
          <CardContent className="p-0">
            <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border bg-muted/25 px-3 py-0 sm:px-4">
              <div className="flex gap-1">
                <button
                  type="button"
                  className={cn(
                    "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
                    tab === "active" ? "border-primary text-primary" : "border-transparent text-foreground/65"
                  )}
                  onClick={() => setTab("active")}
                >
                  Активный
                </button>
                <button
                  type="button"
                  className={cn(
                    "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
                    tab === "inactive" ? "border-primary text-primary" : "border-transparent text-foreground/65"
                  )}
                  onClick={() => setTab("inactive")}
                >
                  Не активный
                </button>
              </div>
              <div className="flex flex-wrap gap-2 py-1">
                <Button type="button" size="sm" className="h-9" onClick={() => setAddOpen(true)}>
                  Добавить экспедитора
                </Button>
              </div>
            </div>

            <div className="table-toolbar flex flex-wrap items-end gap-2 border-b border-border/80 bg-muted/30 px-3 py-2 sm:px-4">
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                value={pageSize}
                onChange={(e) => tablePrefs.setPageSize(Number.parseInt(e.target.value, 10))}
              >
                {[10, 20, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1 px-2 text-xs"
                title="Управление столбцами"
                onClick={() => setColumnDialogOpen(true)}
              >
                <ListOrdered className="size-3.5" />
                Столбцы
              </Button>
              <Input
                placeholder="Поиск"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 max-w-xs bg-background text-xs text-foreground"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 text-xs"
                onClick={() => {
                  const order = tablePrefs.visibleColumnOrder;
                  const headers = order.map((id) => EXPEDITOR_COLUMNS.find((c) => c.id === id)?.label ?? id);
                  const exportData = filteredRows.map((r) =>
                    order.map((colId) => expeditorExportCellString(r, colId))
                  );
                  downloadXlsxSheet(
                    `expeditors_${tab}_${new Date().toISOString().slice(0, 10)}.xlsx`,
                    "Экспедиторы",
                    headers,
                    exportData
                  );
                }}
              >
                Excel
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="h-9 w-9"
                onClick={() => void listQ.refetch()}
              >
                <RefreshCw className={cn("size-4", listQ.isFetching && "animate-spin")} />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto h-9 text-xs"
                disabled={selectedIds.size === 0}
                onClick={() =>
                  window.alert(
                    `Выбрано экспедиторов: ${selectedIds.size}. Массовые действия будут добавлены в следующем обновлении.`
                  )
                }
              >
                Групповая обработка
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1600px] text-xs">
                <thead className="app-table-thead">
                  <tr>
                    <th className="w-10 whitespace-nowrap px-2 py-2 text-left">
                      <input
                        ref={headerCbRef}
                        type="checkbox"
                        className="size-4 rounded border-input accent-primary"
                        checked={allOnPageSelected}
                        onChange={(e) => toggleAllExpeditorsOnPage(e.target.checked)}
                        aria-label="Выбрать всех на странице"
                      />
                    </th>
                    {tablePrefs.visibleColumnOrder.map((colId) => {
                      const meta = EXPEDITOR_COLUMNS.find((c) => c.id === colId);
                      return (
                        <th key={colId} className="whitespace-nowrap px-2 py-2 text-left">
                          {meta?.label ?? colId}
                        </th>
                      );
                    })}
                    <th className="whitespace-nowrap px-2 py-2 text-left">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr key={r.id} className="border-t even:bg-muted/20">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          className="size-4 rounded border-input accent-primary"
                          checked={selectedIds.has(r.id)}
                          onChange={(e) => toggleExpeditorSelection(r.id, e.target.checked)}
                          aria-label={`Выбрать ${r.fio}`}
                        />
                      </td>
                      {tablePrefs.visibleColumnOrder.map((colId) => (
                        <td key={colId} className="px-2 py-2">
                          {renderExpeditorDataCell(colId, r)}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-right">
                        <TableRowActionGroup className="justify-end" ariaLabel="Ekspeditor">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-foreground"
                            title="Активные сессии"
                            aria-label="Активные сессии"
                            onClick={() => setSessionExpeditor(r)}
                          >
                            <MonitorSmartphone className="size-3.5" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-primary hover:bg-primary/10"
                            title="Условия привязки к заявке"
                            aria-label="Условия привязки к заявке"
                            onClick={() => setAssignRow(r)}
                          >
                            <Link2 className="size-3.5" aria-hidden />
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
                              onClick={() => setDeactivateExpeditor(r)}
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
            <div className="table-content-footer border-t border-border/80 bg-muted/25 px-3 py-2 text-xs text-foreground/75 sm:px-4">
              Показано {pageRows.length} / {filteredRows.length}
              {listQ.data && listQ.data.length !== filteredRows.length
                ? ` (вкладка: ${listQ.data.length})`
                : ""}
            </div>
          </CardContent>
        </Card>
      </div>

      <AgentAddDialog
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) setCreateExpeditorError(null);
        }}
        warehouses={warehousesQ.data ?? []}
        branchOptions={branchOptions}
        tradeDirections={tradeDirectionRows}
        territorySelectOptions={territoryFilterOptions}
        loading={createMut.isPending}
        submitError={createExpeditorError}
        onSubmit={(body) => {
          setCreateExpeditorError(null);
          createMut.mutate(body);
        }}
      />

      <AgentInfoDialog row={infoRow} onClose={() => setInfoRow(null)} />

      <AgentEditDialog
        row={editRow}
        onClose={() => setEditRow(null)}
        tenantSlug={tenantSlug}
        warehouses={warehousesQ.data ?? []}
        branchOptions={branchOptions}
        tradeDirections={tradeDirectionRows}
        territorySelectOptions={territoryFilterOptions}
        onPatch={(id, body) => patchMut.mutateAsync({ id, body })}
      />

      <StaffActiveSessionsDialog
        open={sessionExpeditor != null}
        onOpenChange={(open) => {
          if (!open) setSessionExpeditor(null);
        }}
        tenantSlug={tenantSlug}
        staffKind="expeditor"
        userId={sessionExpeditor?.id ?? null}
        maxSessions={sessionExpeditor?.max_sessions ?? 2}
        onPatched={() => {
          void qc.invalidateQueries({ queryKey: ["expeditors", tenantSlug] });
        }}
      />

      <ExpeditorAssignmentDialog
        row={assignRow}
        onClose={() => setAssignRow(null)}
        warehouses={warehousesQ.data ?? []}
        priceTypes={priceTypesQ.data ?? []}
        tradeDirections={assignmentTradeDirections}
        territoryOptions={assignmentTerritoryOptions}
        agents={agentsPickerQ.data ?? []}
        onSave={(id, rules) => patchMut.mutateAsync({ id, body: { expeditor_assignment_rules: rules } })}
      />

      <Dialog open={Boolean(deactivateExpeditor)} onOpenChange={(o) => !o && setDeactivateExpeditor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Деактивировать экспедитора</DialogTitle>
          </DialogHeader>
          <p className="text-sm">Вы хотите деактивировать экспедитора?</p>
          <DialogFooter className="flex-row justify-end gap-2 border-0 bg-transparent p-0">
            <Button type="button" variant="outline" onClick={() => setDeactivateExpeditor(null)}>
              Нет
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deactivateMut.isPending}
              onClick={() => deactivateExpeditor && deactivateMut.mutate(deactivateExpeditor.id)}
            >
              Да
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AgentInfoDialog({ row, onClose }: { row: ExpeditorRow | null; onClose: () => void }) {
  if (!row) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Экспедитор</DialogTitle>
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
          <dt className="text-muted-foreground">Зона</dt>
          <dd>{row.trade_direction ?? "—"}</dd>
          <dt className="text-muted-foreground">Территория</dt>
          <dd>{row.territory ?? "—"}</dd>
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

function mergeTerritorySelectOptions(current: string, base: string[]): string[] {
  const s = new Set(base);
  const t = current.trim();
  if (t) s.add(t);
  return Array.from(s).sort((a, b) => a.localeCompare(b, "ru"));
}

function AgentAddDialog({
  open,
  onOpenChange,
  warehouses,
  branchOptions,
  tradeDirections,
  territorySelectOptions,
  loading,
  submitError,
  onSubmit
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  warehouses: { id: number; name: string }[];
  branchOptions: string[];
  tradeDirections: Array<{ id: number; name: string; code: string | null }>;
  territorySelectOptions: string[];
  loading: boolean;
  submitError: string | null;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [first_name, setFirst] = useState("");
  const [last_name, setLast] = useState("");
  const [middle_name, setMid] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [warehouse_id, setWh] = useState("");
  const [trade_direction_id, setTdId] = useState("");
  const [agent_type, setAgentType] = useState("Экспедитор");
  const [branch, setBranch] = useState("");
  const [position, setPos] = useState("");
  const [code, setCode] = useState("");
  const [pinfl, setPinfl] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [consignment, setConsignment] = useState(false);
  const [kpi_color, setKpi] = useState("#ef4444");
  const [territoryField, setTerritoryField] = useState("");
  const [showPw, setShowPw] = useState(false);

  const territoryOpts = useMemo(
    () => mergeTerritorySelectOptions(territoryField, territorySelectOptions),
    [territoryField, territorySelectOptions]
  );

  useEffect(() => {
    if (!open) return;
    setFirst("");
    setLast("");
    setMid("");
    setPhone("");
    setEmail("");
    setWh("");
    setTdId("");
    setAgentType("Экспедитор");
    setBranch("");
    setPos("");
    setCode("");
    setPinfl("");
    setTerritoryField("");
    setLogin("");
    setPassword(randomPassword());
    setConsignment(false);
    setKpi("#ef4444");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Добавить экспедитора</DialogTitle>
        </DialogHeader>
        {submitError ? (
          <p className="text-sm text-destructive" role="alert">
            {submitError}
          </p>
        ) : null}
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
            Зона (направление торговли)
            <FilterSelect
              className="mt-1 h-10 w-full min-w-0 max-w-none rounded-md border border-input bg-background p-2 text-sm"
              emptyLabel="Tanlanmagan"
              aria-label="Зона (направление торговли)"
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
            Должность (тип)
            <select
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm"
              value={agent_type}
              onChange={(e) => setAgentType(e.target.value)}
            >
              <option value="Экспедитор">Экспедитор</option>
              <option value="Водитель">Водитель</option>
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
          <label className="text-xs text-muted-foreground">
            Территория (как у клиента: область / туман / зона)
            <FilterSelect
              className="mt-1 h-10 w-full min-w-0 max-w-none rounded-md border border-input bg-background p-2 text-sm"
              emptyLabel="Не выбрано"
              aria-label="Территория"
              value={territoryField}
              onChange={(e) => setTerritoryField(e.target.value)}
            >
              {territoryOpts.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </FilterSelect>
          </label>
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
                territory: territoryField.trim() || null,
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
  territorySelectOptions,
  onPatch
}: {
  row: ExpeditorRow | null;
  onClose: () => void;
  tenantSlug: string;
  warehouses: { id: number; name: string }[];
  branchOptions: string[];
  tradeDirections: Array<{ id: number; name: string; code: string | null }>;
  territorySelectOptions: string[];
  onPatch: (id: number, body: Record<string, unknown>) => Promise<unknown>;
}) {
  const detailQ = useQuery({
    queryKey: ["expeditor-detail", tenantSlug, row?.id],
    enabled: Boolean(row),
    queryFn: async () => {
      const { data } = await api.get<{ data: ExpeditorRow }>(`/api/${tenantSlug}/expeditors/${row!.id}`);
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
  const [territory, setTerritory] = useState("");
  const [pwMode, setPwMode] = useState(false);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const territoryOpts = useMemo(
    () => mergeTerritorySelectOptions(territory, territorySelectOptions),
    [territory, territorySelectOptions]
  );

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
    setTerritory(r.territory ?? "");
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
        territory: territory.trim() || null,
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
          <DialogTitle>Редактировать экспедитора</DialogTitle>
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
            Зона (направление торговли)
            <FilterSelect
              className="mt-1 h-10 w-full min-w-0 max-w-none rounded-md border border-input bg-background p-2 text-sm"
              emptyLabel="Tanlanmagan"
              aria-label="Зона (направление торговли)"
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
          <Input placeholder="Должность / тип" value={agent_type} onChange={(e) => setAgentType(e.target.value)} />
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
          <label className="text-xs text-muted-foreground">
            Территория (как у клиента)
            <FilterSelect
              className="mt-1 h-10 w-full min-w-0 max-w-none rounded-md border border-input bg-background p-2 text-sm"
              emptyLabel="Не выбрано"
              aria-label="Территория"
              value={territory}
              onChange={(e) => setTerritory(e.target.value)}
            >
              {territoryOpts.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </FilterSelect>
          </label>
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
            Условия автопривязки заказов — кнопка «цепочка» в таблице.
          </p>
        </div>
        <DialogFooter className="flex-col gap-2 border-0 bg-transparent p-0 sm:flex-col">
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

const WEEKDAY_LABELS: Record<number, string> = {
  1: "Пн",
  2: "Вт",
  3: "Ср",
  4: "Чт",
  5: "Пт",
  6: "Сб",
  7: "Вс"
};

function MultiSelectBlock({
  title,
  options,
  selected,
  onToggle,
  search,
  onSearchChange
}: {
  title: string;
  options: string[];
  selected: Set<string>;
  onToggle: (v: string, checked: boolean) => void;
  search: string;
  onSearchChange: (s: string) => void;
}) {
  const q = search.trim().toLowerCase();
  const filtered = options.filter((p) => p.toLowerCase().includes(q));
  return (
    <div className="flex min-h-[11rem] flex-col rounded-md border">
      <div className="border-b p-2 text-sm font-medium">{title}</div>
      <Input placeholder="Поиск" className="m-2" value={search} onChange={(e) => onSearchChange(e.target.value)} />
      <div className="max-h-40 min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.map((p) => (
          <label key={p} className="flex items-center gap-2 py-1 text-sm">
            <input
              type="checkbox"
              checked={selected.has(p)}
              onChange={(e) => onToggle(p, e.target.checked)}
            />
            {p}
          </label>
        ))}
        {filtered.length === 0 && <p className="text-xs text-muted-foreground">Нет вариантов</p>}
      </div>
    </div>
  );
}

function ExpeditorAssignmentDialog({
  row,
  onClose,
  warehouses,
  priceTypes,
  tradeDirections,
  territoryOptions,
  agents,
  onSave
}: {
  row: ExpeditorRow | null;
  onClose: () => void;
  warehouses: { id: number; name: string }[];
  priceTypes: string[];
  tradeDirections: string[];
  territoryOptions: string[];
  agents: { id: number; fio: string; code: string | null }[];
  onSave: (id: number, rules: ExpeditorAssignmentRules) => Promise<unknown>;
}) {
  const [ptSel, setPtSel] = useState<Set<string>>(new Set());
  const [agSel, setAgSel] = useState<Set<number>>(new Set());
  const [whSel, setWhSel] = useState<Set<number>>(new Set());
  const [tdSel, setTdSel] = useState<Set<string>>(new Set());
  const [trSel, setTrSel] = useState<Set<string>>(new Set());
  const [wdSel, setWdSel] = useState<Set<number>>(new Set());
  const [s1, setS1] = useState("");
  const [s2, setS2] = useState("");
  const [s3, setS3] = useState("");
  const [s4, setS4] = useState("");
  const [s5, setS5] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) return;
    const r = row.expeditor_assignment_rules ?? {};
    setPtSel(new Set(r.price_types ?? []));
    setAgSel(new Set(r.agent_ids ?? []));
    setWhSel(new Set(r.warehouse_ids ?? []));
    setTdSel(new Set(r.trade_directions ?? []));
    setTrSel(new Set(r.territories ?? []));
    setWdSel(new Set(r.weekdays ?? []));
    setS1("");
    setS2("");
    setS3("");
    setS4("");
    setS5("");
  }, [row]);

  if (!row) return null;

  const save = async () => {
    setSaving(true);
    try {
      const rules: ExpeditorAssignmentRules = {
        price_types: ptSel.size ? Array.from(ptSel) : undefined,
        agent_ids: agSel.size ? Array.from(agSel) : undefined,
        warehouse_ids: whSel.size ? Array.from(whSel) : undefined,
        trade_directions: tdSel.size ? Array.from(tdSel) : undefined,
        territories: trSel.size ? Array.from(trSel) : undefined,
        weekdays: wdSel.size ? Array.from(wdSel).sort((a, b) => a - b) : undefined
      };
      await onSave(row.id, rules);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Условия привязки к заявке</DialogTitle>
          <p className="text-sm text-muted-foreground">{row.fio}</p>
          <p className="text-xs text-muted-foreground">
            Пустые блоки не учитываются. Заказ при создании сопоставляется с клиентом (тип цены = категория / канал /
            категория товара), агентом заказа, складом, направлением агента, территорией клиента и днём недели.
          </p>
        </DialogHeader>
        <div className="grid max-h-[60vh] grid-cols-1 gap-3 overflow-y-auto md:grid-cols-2">
          <MultiSelectBlock
            title="Тип цены"
            options={priceTypes}
            selected={ptSel}
            onToggle={(p, c) => {
              const n = new Set(ptSel);
              if (c) n.add(p);
              else n.delete(p);
              setPtSel(n);
            }}
            search={s1}
            onSearchChange={setS1}
          />
          <div className="flex min-h-[11rem] flex-col rounded-md border">
            <div className="border-b p-2 text-sm font-medium">Агент</div>
            <Input placeholder="Поиск" className="m-2" value={s2} onChange={(e) => setS2(e.target.value)} />
            <div className="max-h-40 overflow-y-auto p-2">
              {agents
                .filter(
                  (a) =>
                    !s2.trim() ||
                    `${a.fio} ${a.code ?? ""} ${a.id}`.toLowerCase().includes(s2.trim().toLowerCase())
                )
                .map((a) => (
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
                    <span className="font-mono text-xs text-muted-foreground">{a.id}</span>
                    {a.fio}
                    {a.code ? <span className="text-muted-foreground"> ({a.code})</span> : null}
                  </label>
                ))}
            </div>
          </div>
          <div className="flex min-h-[11rem] flex-col rounded-md border">
            <div className="border-b p-2 text-sm font-medium">Склад</div>
            <Input placeholder="Поиск" className="m-2" value={s3} onChange={(e) => setS3(e.target.value)} />
            <div className="max-h-40 overflow-y-auto p-2">
              {warehouses
                .filter((w) => !s3.trim() || w.name.toLowerCase().includes(s3.trim().toLowerCase()))
                .map((w) => (
                  <label key={w.id} className="flex items-center gap-2 py-1 text-sm">
                    <input
                      type="checkbox"
                      checked={whSel.has(w.id)}
                      onChange={(e) => {
                        const n = new Set(whSel);
                        if (e.target.checked) n.add(w.id);
                        else n.delete(w.id);
                        setWhSel(n);
                      }}
                    />
                    {w.name}
                  </label>
                ))}
            </div>
          </div>
          {tradeDirections.length > 0 ? (
            <MultiSelectBlock
              title="Направление торговли"
              options={tradeDirections}
              selected={tdSel}
              onToggle={(p, c) => {
                const n = new Set(tdSel);
                if (c) n.add(p);
                else n.delete(p);
                setTdSel(n);
              }}
              search={s4}
              onSearchChange={setS4}
            />
          ) : (
            <div className="flex min-h-[11rem] flex-col justify-center rounded-md border p-4 text-sm text-muted-foreground">
              Нет значений зоны в фильтрах. Направление берётся из поля «Зона» у агента в заказе.
            </div>
          )}
          <MultiSelectBlock
            title="Территория"
            options={territoryOptions}
            selected={trSel}
            onToggle={(p, c) => {
              const n = new Set(trSel);
              if (c) n.add(p);
              else n.delete(p);
              setTrSel(n);
            }}
            search={s5}
            onSearchChange={setS5}
          />
          <div className="flex flex-col rounded-md border">
            <div className="border-b p-2 text-sm font-medium">День недели</div>
            <div className="flex flex-wrap gap-2 p-3">
              {([1, 2, 3, 4, 5, 6, 7] as const).map((d) => (
                <label key={d} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={wdSel.has(d)}
                    onChange={(e) => {
                      const n = new Set(wdSel);
                      if (e.target.checked) n.add(d);
                      else n.delete(d);
                      setWdSel(n);
                    }}
                  />
                  {WEEKDAY_LABELS[d]}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
