"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { TableColumnSettingsDialog } from "@/components/data-table/table-column-settings-dialog";
import { TableRowActionGroup } from "@/components/data-table/table-row-actions";
import { useUserTablePrefs } from "@/hooks/use-user-table-prefs";
import { downloadXlsxSheet } from "@/lib/download-xlsx";
import { cn } from "@/lib/utils";
import { formatGroupedInteger } from "@/lib/format-numbers";
import type { AxiosError } from "axios";
import {
  RoleLinkPickerGrid,
  cloneRoleSets,
  emptySetsForRoles,
  linksFromRoleSets,
  setsFromRoleLinks,
  type RolePickerColumn
} from "@/components/role-link-picker/role-link-picker-grid";
import { ArrowDown, ArrowUp, Pencil, RefreshCw, RotateCcw, Search, UserMinus, X } from "lucide-react";

const TABLE_ID = "warehouses.v1";

const COLUMN_IDS = [
  "name",
  "type",
  "code",
  "roles",
  "user_total",
  "payment_method",
  "location",
  "van_selling"
] as const;

const COLUMN_META = COLUMN_IDS.map((id) => ({
  id,
  label:
    {
      name: "Название",
      type: "Тип",
      code: "Код",
      roles: "Количество пользователей по ролям",
      user_total: "Количество пользователей",
      payment_method: "Способ оплаты",
      location: "Локация",
      van_selling: "Ван селлинг склад"
    }[id] ?? id
}));

const WAREHOUSE_ROLE_ORDER = [
  "agent",
  "cashier",
  "manager",
  "operator",
  "storekeeper",
  "supervisor",
  "expeditor"
] as const;

const WH_ROLE_KEYS = [...WAREHOUSE_ROLE_ORDER];

const WH_ROLE_LABELS: Record<string, string> = {
  agent: "Агент",
  cashier: "Кассир",
  manager: "Менеджер",
  operator: "Оператор",
  storekeeper: "Склад",
  supervisor: "Супервайзер",
  expeditor: "Экспедитор"
};

function roleLabel(role: string) {
  return WH_ROLE_LABELS[role] ?? role;
}

type PickerUser = { id: number; name: string; login: string };

type WarehousePickersData = {
  agents: PickerUser[];
  operators: PickerUser[];
  supervisors: PickerUser[];
  expeditors: PickerUser[];
};

const WH_ROLE_COLUMNS: RolePickerColumn[] = [
  { role: "agent", label: WH_ROLE_LABELS.agent, pool: "agents" },
  { role: "cashier", label: WH_ROLE_LABELS.cashier, pool: "operators" },
  { role: "manager", label: WH_ROLE_LABELS.manager, pool: "operators" },
  { role: "operator", label: WH_ROLE_LABELS.operator, pool: "operators" },
  { role: "storekeeper", label: WH_ROLE_LABELS.storekeeper, pool: "operators" },
  { role: "supervisor", label: WH_ROLE_LABELS.supervisor, pool: "supervisors" },
  { role: "expeditor", label: WH_ROLE_LABELS.expeditor, pool: "expeditors" }
];

function emptyWhLinkSets() {
  return emptySetsForRoles(WH_ROLE_KEYS);
}

const DEFAULT_WAREHOUSE_TYPE_LABEL = "Склад реализации";

export type WarehouseStockPurpose = "sales" | "return" | "reserve";

const STOCK_PURPOSE_OPTIONS: { value: WarehouseStockPurpose; label: string }[] = [
  { value: "sales", label: "Склад реализации (остатки продаж)" },
  { value: "return", label: "Склад для возврата" },
  { value: "reserve", label: "Склад для резерва" }
];

type WarehouseRow = {
  id: number;
  name: string;
  type: string | null;
  stock_purpose: WarehouseStockPurpose;
  code: string | null;
  address: string | null;
  payment_method: string | null;
  van_selling: boolean;
  is_active: boolean;
  breakdown: { role: string; count: number }[];
  user_total: number;
};

function RoleBreakdownCell({ breakdown }: { breakdown: { role: string; count: number }[] }) {
  const sorted = [...breakdown].sort((a, b) => b.count - a.count || a.role.localeCompare(b.role));
  const maxVisible = 2;
  const visible = sorted.slice(0, maxVisible);
  const rest = sorted.slice(maxVisible);
  if (sorted.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex max-w-[22rem] flex-wrap items-center gap-1">
      {visible.map((b) => (
        <span
          key={b.role}
          className="inline-flex items-center rounded-md border border-border/80 bg-muted/50 px-1.5 py-0.5 text-[11px] text-foreground"
        >
          {roleLabel(b.role)} — ({formatGroupedInteger(b.count)})
        </span>
      ))}
      {rest.length > 0 ? (
        <details className="group relative inline-block">
          <summary className="cursor-pointer list-none text-[11px] font-medium text-primary hover:underline [&::-webkit-details-marker]:hidden">
            ещё {rest.length}
          </summary>
          <div className="absolute left-0 z-30 mt-1 min-w-[220px] rounded-md border border-border bg-popover p-2.5 text-xs shadow-lg">
            <ul className="space-y-1.5">
              {rest.map((b) => (
                <li key={b.role} className="flex justify-between gap-4">
                  <span>{roleLabel(b.role)}</span>
                  <span className="tabular-nums text-muted-foreground">{formatGroupedInteger(b.count)}</span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      ) : null}
    </div>
  );
}

function warehouseMutationError(err: unknown): string {
  const ax = err as AxiosError<{ error?: string }>;
  const status = ax.response?.status;
  const code = ax.response?.data?.error;
  if (status === 401) return "Сессия истекла — войдите снова.";
  if (status === 403 || code === "ForbiddenRole" || code === "CrossTenantDenied") {
    return "Нет доступа.";
  }
  if (code === "WarehouseNameExists") return "Склад с таким названием уже есть.";
  if (code === "WarehouseHasStock") return "На складе есть остатки — удаление невозможно.";
  if (code === "WarehouseHasOrders") return "Есть заказы по этому складу — удаление невозможно.";
  if (status === 400) return "Проверьте данные (название обязательно).";
  if (status === 404) return "Склад не найден.";
  if (code === "UserRoleMismatch" || code === "InvalidLinkRole") {
    return "Роль пользователя не соответствует выбранному столбцу.";
  }
  if (code === "UserNotFound") return "Пользователь не найден.";
  return "Ошибка запроса.";
}

type WarehouseDetail = {
  id: number;
  name: string;
  type: string | null;
  stock_purpose: WarehouseStockPurpose;
  code: string | null;
  address: string | null;
  payment_method: string | null;
  van_selling: boolean;
  is_active: boolean;
  links: { link_role: string; user: PickerUser }[];
};

type FormState = {
  name: string;
  type: string;
  stock_purpose: WarehouseStockPurpose;
  code: string;
  address: string;
  payment_method: string;
  van_selling: boolean;
  is_active: boolean;
};

function emptyForm(): FormState {
  return {
    name: "",
    type: "",
    stock_purpose: "sales",
    code: "",
    address: "",
    payment_method: "",
    van_selling: false,
    is_active: true
  };
}

function rowToForm(r: WarehouseRow): FormState {
  const sp = r.stock_purpose;
  const purpose: WarehouseStockPurpose =
    sp === "return" || sp === "reserve" || sp === "sales" ? sp : "sales";
  return {
    name: r.name,
    type: r.type ?? "",
    stock_purpose: purpose,
    code: r.code ?? "",
    address: r.address ?? "",
    payment_method: r.payment_method ?? "",
    van_selling: r.van_selling,
    is_active: r.is_active
  };
}

function WarehouseFormDialog({
  open,
  onOpenChange,
  initial,
  canWrite,
  tenantSlug,
  onSaved
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: WarehouseRow | null;
  canWrite: boolean;
  tenantSlug: string;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [linkSets, setLinkSets] = useState(() => emptyWhLinkSets());
  const [usersSubOpen, setUsersSubOpen] = useState(false);
  const [draftLinkSets, setDraftLinkSets] = useState(() => emptyWhLinkSets());
  const [userSearch, setUserSearch] = useState("");
  const qc = useQueryClient();

  const pickersQ = useQuery({
    queryKey: ["warehouse-pickers", tenantSlug],
    enabled: Boolean(tenantSlug) && open && canWrite,
    queryFn: async () => {
      const { data } = await api.get<{ data: WarehousePickersData }>(
        `/api/${tenantSlug}/warehouses/pickers`
      );
      return data.data;
    }
  });

  const detailQ = useQuery({
    queryKey: ["warehouse-detail", tenantSlug, initial?.id],
    enabled: Boolean(tenantSlug) && open && canWrite && initial != null,
    queryFn: async () => {
      const { data } = await api.get<{ data: WarehouseDetail }>(
        `/api/${tenantSlug}/warehouses/${initial!.id}`
      );
      return data.data;
    }
  });

  useEffect(() => {
    if (!open) {
      setUsersSubOpen(false);
      return;
    }
    setForm(initial ? rowToForm(initial) : emptyForm());
    setLinkSets(emptyWhLinkSets());
  }, [open, initial]);

  useEffect(() => {
    if (!open || !initial?.id || !detailQ.data) return;
    if (detailQ.data.id !== initial.id) return;
    setLinkSets(
      setsFromRoleLinks(
        WH_ROLE_KEYS,
        detailQ.data.links.map((l) => ({ user_id: l.user.id, link_role: l.link_role }))
      )
    );
    const sp = detailQ.data.stock_purpose;
    if (sp === "sales" || sp === "return" || sp === "reserve") {
      setForm((f) => ({ ...f, stock_purpose: sp }));
    }
  }, [open, initial?.id, detailQ.data]);

  const selectedUserCount = useMemo(
    () => WH_ROLE_KEYS.reduce((n, r) => n + (linkSets[r]?.size ?? 0), 0),
    [linkSets]
  );

  const saveMut = useMutation({
    mutationFn: async () => {
      const links = linksFromRoleSets(WH_ROLE_KEYS, linkSets);
      const body = {
        name: form.name.trim(),
        type: form.type.trim() || null,
        stock_purpose: form.stock_purpose,
        code: form.code.trim() || null,
        address: form.address.trim() || null,
        payment_method: form.payment_method.trim() || null,
        van_selling: form.van_selling,
        is_active: form.is_active,
        links
      };
      if (initial) {
        await api.patch(`/api/${tenantSlug}/warehouses/${initial.id}`, body);
      } else {
        await api.post(`/api/${tenantSlug}/warehouses`, body);
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["warehouses-table", tenantSlug] });
      await qc.invalidateQueries({ queryKey: ["warehouses", tenantSlug] });
      if (initial?.id) {
        await qc.invalidateQueries({ queryKey: ["warehouse-detail", tenantSlug, initial.id] });
      }
      onOpenChange(false);
      onSaved();
    }
  });

  if (!canWrite) return null;

  const detailLoading = Boolean(initial?.id) && detailQ.isLoading;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[96vh] w-full flex-col gap-0 overflow-x-hidden overflow-y-auto p-0",
          "!max-w-xl sm:!max-w-xl"
        )}
        showCloseButton
      >
        <DialogHeader className="shrink-0 border-b border-border px-5 pb-3 pt-4 pr-14 text-left">
          <DialogTitle className="text-base font-semibold">
            {initial ? "Редактировать" : "Добавить склад"}
          </DialogTitle>
        </DialogHeader>

        <div className="shrink-0 overflow-visible px-5 py-4">
          <div className="mx-auto grid w-full max-w-xl gap-5">
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-0">
              <div className="grid min-w-0 gap-2">
                <Label className="text-sm font-medium">Название *</Label>
                <Input
                  className={cn("h-10", !form.name.trim() ? "border-destructive/50" : "")}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="grid min-w-0 gap-2">
                <Label className="text-sm font-medium">Тип</Label>
                <Input
                  className="h-10"
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  placeholder={DEFAULT_WAREHOUSE_TYPE_LABEL}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="text-sm font-medium">Назначение для остатков</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                value={form.stock_purpose}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    stock_purpose: e.target.value as WarehouseStockPurpose
                  }))
                }
              >
                {STOCK_PURPOSE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-0">
              <div className="grid min-w-0 gap-2">
                <Label className="text-sm font-medium">Код</Label>
                <Input
                  className="h-10"
                  value={form.code}
                  maxLength={40}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                />
              </div>
              <div className="grid min-w-0 gap-2">
                <Label className="text-sm font-medium">Способ оплаты</Label>
                <Input
                  className="h-10"
                  value={form.payment_method}
                  onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="text-sm font-medium">Локация (адрес)</Label>
              <textarea
                className="min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm shadow-sm"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-3 rounded-lg border border-input bg-muted/15 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8 sm:gap-y-2">
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-teal-600"
                  checked={form.van_selling}
                  onChange={(e) => setForm((f) => ({ ...f, van_selling: e.target.checked }))}
                />
                <span className="font-medium">Ван селлинг склад</span>
              </label>
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-teal-600"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                <span className="font-medium">Активный</span>
              </label>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-4">
              <p className="mb-2.5 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Пользователи</span>
                {": "}
                {detailLoading ? "загрузка…" : selectedUserCount}
              </p>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full border-2 border-teal-600/45 text-sm font-medium text-teal-800 shadow-none hover:bg-teal-50 disabled:opacity-60 dark:border-teal-500/50 dark:text-teal-300 dark:hover:bg-teal-950/40"
                disabled={detailLoading}
                onClick={() => {
                  setDraftLinkSets(cloneRoleSets(WH_ROLE_KEYS, linkSets));
                  setUserSearch("");
                  setUsersSubOpen(true);
                }}
              >
                Редактировать добавленных пользователей
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 shrink-0 flex-row justify-end gap-3 rounded-b-xl border-t border-border bg-background px-5 py-4 pb-5">
          <Button type="button" variant="outline" className="min-h-10 min-w-[7rem]" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="button"
            className="min-h-10 min-w-[7rem] bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500"
            disabled={!form.name.trim() || saveMut.isPending || detailLoading}
            onClick={() => saveMut.mutate()}
          >
            {initial ? "Сохранить" : "Добавить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      <Dialog open={usersSubOpen} onOpenChange={setUsersSubOpen}>
        <DialogContent
          className={cn(
            "flex max-h-[min(92vh,720px)] w-[min(100vw-1.5rem,1180px)] flex-col gap-0 overflow-x-hidden overflow-y-auto p-0",
            "!max-w-[min(100vw-1.5rem,1180px)] sm:!max-w-[min(100vw-1.5rem,1180px)] z-[100]"
          )}
          showCloseButton
        >
          <DialogHeader className="shrink-0 border-b border-border bg-muted/20 px-4 pb-4 pt-5 pr-14 sm:pt-4">
            <div className="flex flex-col gap-3 text-left">
              <div className="min-w-0 pr-1">
                <DialogTitle className="text-lg font-semibold tracking-tight">Пользователи по ролям</DialogTitle>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                  Каждая роль — отдельный блок. Длинные списки прокручиваются внутри блока. Один человек — только в
                  одной колонке.
                </p>
              </div>
              <div className="w-full max-w-2xl">
                <div className="rounded-xl border border-border/90 bg-background p-1 shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.07]">
                  <div className="relative flex items-center">
                    <Search
                      className="pointer-events-none absolute left-3.5 top-1/2 size-[1.125rem] -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      placeholder="Поиск по имени или логину"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className={cn(
                        "h-11 w-full border-0 bg-transparent pl-11 text-sm shadow-none",
                        "placeholder:text-muted-foreground/70",
                        "focus-visible:ring-0 focus-visible:ring-offset-0",
                        userSearch.trim() ? "pr-11" : "pr-4"
                      )}
                      aria-label="Поиск пользователей"
                    />
                    {userSearch.trim() ? (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Очистить поиск"
                        onClick={() => setUserSearch("")}
                      >
                        <X className="size-4 shrink-0" strokeWidth={2.25} />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </DialogHeader>
          <div className="flex flex-col bg-muted/10 px-3 pt-2 pb-1 sm:px-4">
            <RoleLinkPickerGrid
              roleOrder={WH_ROLE_KEYS}
              columns={WH_ROLE_COLUMNS}
              pickers={pickersQ.data}
              local={draftLinkSets}
              setLocal={setDraftLinkSets}
              search={userSearch}
            />
          </div>
          <DialogFooter className="mx-0 mb-0 shrink-0 flex-col-reverse gap-2.5 rounded-b-xl border-t border-border bg-background px-5 pt-4 pb-5 sm:flex-row sm:justify-end sm:gap-3 sm:pb-5">
            <Button
              type="button"
              variant="outline"
              className="w-full min-h-10 sm:w-auto sm:min-w-[7.5rem]"
              onClick={() => setUsersSubOpen(false)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              className="w-full min-h-10 bg-teal-600 text-white hover:bg-teal-700 sm:w-auto sm:min-w-[7.5rem] dark:bg-teal-600 dark:hover:bg-teal-500"
              onClick={() => {
                setLinkSets(cloneRoleSets(WH_ROLE_KEYS, draftLinkSets));
                setUsersSubOpen(false);
              }}
            >
              Готово
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type Props = { tenantSlug: string; canWrite: boolean };

export function WarehousesWorkspace({ tenantSlug, canWrite }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"active" | "inactive">("active");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [columnOpen, setColumnOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseRow | null>(null);
  const [sortNameDir, setSortNameDir] = useState<"asc" | "desc">("asc");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<WarehouseRow | null>(null);

  const tablePrefs = useUserTablePrefs({
    tenantSlug,
    tableId: TABLE_ID,
    defaultColumnOrder: [...COLUMN_IDS],
    defaultPageSize: 10,
    allowedPageSizes: [10, 20, 25, 50, 100]
  });
  const limit = tablePrefs.pageSize;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [tab, debouncedSearch, limit]);

  const listQ = useQuery({
    queryKey: ["warehouses-table", tenantSlug, tab, page, limit, debouncedSearch],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("is_active", tab === "active" ? "true" : "false");
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (debouncedSearch) params.set("q", debouncedSearch);
      const { data } = await api.get<{
        data: WarehouseRow[];
        total: number;
        page: number;
        limit: number;
      }>(`/api/${tenantSlug}/warehouses/table?${params.toString()}`);
      return data;
    }
  });

  const deactivateMut = useMutation({
    mutationFn: async (id: number) => {
      await api.patch(`/api/${tenantSlug}/warehouses/${id}`, { is_active: false });
    },
    onSuccess: async () => {
      setFeedback(null);
      setDeactivateTarget(null);
      await qc.invalidateQueries({ queryKey: ["warehouses-table", tenantSlug] });
      await qc.invalidateQueries({ queryKey: ["warehouses", tenantSlug] });
    },
    onError: (err) => {
      setDeactivateTarget(null);
      setFeedback(warehouseMutationError(err));
    }
  });

  const activateMut = useMutation({
    mutationFn: async (id: number) => {
      await api.patch(`/api/${tenantSlug}/warehouses/${id}`, { is_active: true });
    },
    onSuccess: async () => {
      setFeedback(null);
      await qc.invalidateQueries({ queryKey: ["warehouses-table", tenantSlug] });
      await qc.invalidateQueries({ queryKey: ["warehouses", tenantSlug] });
    },
    onError: (err) => setFeedback(warehouseMutationError(err))
  });

  const rawRows = listQ.data?.data ?? [];
  const rows = useMemo(() => {
    const out = [...rawRows];
    out.sort((a, b) => {
      const c = a.name.localeCompare(b.name, "ru", { sensitivity: "base" });
      return sortNameDir === "asc" ? c : -c;
    });
    return out;
  }, [rawRows, sortNameDir]);

  const total = listQ.data?.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const exportRows = useCallback(() => {
    const headers = COLUMN_META.filter((c) => tablePrefs.visibleColumnOrder.includes(c.id)).map((c) => c.label);
    const dataRows = rows.map((r) =>
      tablePrefs.visibleColumnOrder.map((colId) => {
        switch (colId) {
          case "name":
            return r.name;
          case "type":
            return r.type?.trim() ? r.type : DEFAULT_WAREHOUSE_TYPE_LABEL;
          case "code":
            return r.code ?? "";
          case "roles":
            return r.breakdown.map((b) => `${roleLabel(b.role)}:${b.count}`).join("; ");
          case "user_total":
            return String(r.user_total);
          case "payment_method":
            return r.payment_method ?? "";
          case "location":
            return r.address ?? "";
          case "van_selling":
            return r.van_selling ? "Да" : "Нет";
          default:
            return "";
        }
      })
    );
    downloadXlsxSheet(
      `sklad_${tab}_${new Date().toISOString().slice(0, 10)}.xlsx`,
      "Склад",
      headers,
      dataRows
    );
  }, [rows, tab, tablePrefs.visibleColumnOrder]);

  return (
    <PageShell>
      <PageHeader
        title="Склад"
        actions={
          canWrite ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setColumnOpen(true)}>
                Столбцы
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                Добавить
              </Button>
            </>
          ) : null
        }
      />

      <TableColumnSettingsDialog
        open={columnOpen}
        onOpenChange={setColumnOpen}
        title="Управление столбцами"
        description="Видимые столбцы и порядок сохраняются для вашей учётной записи."
        columns={COLUMN_META}
        columnOrder={tablePrefs.columnOrder}
        hiddenColumnIds={tablePrefs.hiddenColumnIds}
        saving={tablePrefs.saving}
        onSave={(next) => tablePrefs.saveColumnLayout(next)}
        onReset={() => tablePrefs.resetColumnLayout()}
      />

      <div className="orders-hub-section orders-hub-section--table">
        <Card className="overflow-hidden rounded-none border-0 bg-transparent shadow-none hover:shadow-none">
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/25 px-3 py-0 sm:px-4">
              <div className="flex gap-2">
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
            </div>

            <div className="table-toolbar flex flex-wrap items-end gap-2 border-b border-border/80 bg-muted/30 px-3 py-2 sm:px-4">
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                value={limit}
                onChange={(e) => tablePrefs.setPageSize(Number.parseInt(e.target.value, 10))}
              >
                {[10, 20, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <div className="relative flex-1 basis-[200px] sm:max-w-xs">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Поиск"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 pl-8 text-xs"
                />
              </div>
              <Button type="button" variant="outline" size="sm" className="h-9 text-xs" onClick={exportRows}>
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
            </div>

            {feedback ? (
              <p className="border-b border-border/60 px-3 py-2 text-sm text-destructive sm:px-4">{feedback}</p>
            ) : null}

            <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead className="app-table-thead">
              <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                {tablePrefs.visibleColumnOrder.map((colId) => (
                  <th key={colId} className="whitespace-nowrap px-3 py-2.5">
                    {colId === "name" ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
                        onClick={() => setSortNameDir((d) => (d === "asc" ? "desc" : "asc"))}
                      >
                        {COLUMN_META.find((c) => c.id === colId)?.label}
                        {sortNameDir === "asc" ? (
                          <ArrowUp className="size-3 opacity-60" />
                        ) : (
                          <ArrowDown className="size-3 opacity-60" />
                        )}
                      </button>
                    ) : (
                      COLUMN_META.find((c) => c.id === colId)?.label
                    )}
                  </th>
                ))}
                {canWrite ? <th className="w-20 px-2 py-2.5 text-right"> </th> : null}
              </tr>
            </thead>
            <tbody>
              {listQ.isLoading ? (
                <tr>
                  <td
                    colSpan={tablePrefs.visibleColumnOrder.length + (canWrite ? 1 : 0)}
                    className="px-3 py-10 text-center text-muted-foreground"
                  >
                    Загрузка…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={tablePrefs.visibleColumnOrder.length + (canWrite ? 1 : 0)}
                    className="px-3 py-10 text-center text-muted-foreground"
                  >
                    Нет данных
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => (
                  <tr
                    key={r.id}
                    className={cn(
                      "border-b border-border/80 transition-colors",
                      idx % 2 === 1 ? "bg-muted/20" : "bg-background",
                      "hover:bg-muted/35"
                    )}
                  >
                    {tablePrefs.visibleColumnOrder.map((colId) => (
                      <td key={colId} className="px-3 py-2 align-top text-xs">
                        {colId === "name" ? (
                          <span className="font-medium text-foreground">{r.name}</span>
                        ) : colId === "type" ? (
                          <span>{r.type?.trim() ? r.type : DEFAULT_WAREHOUSE_TYPE_LABEL}</span>
                        ) : colId === "code" ? (
                          r.code ?? "—"
                        ) : colId === "roles" ? (
                          <RoleBreakdownCell breakdown={r.breakdown} />
                        ) : colId === "user_total" ? (
                          <span className="tabular-nums">{formatGroupedInteger(r.user_total)}</span>
                        ) : colId === "payment_method" ? (
                          r.payment_method ?? "—"
                        ) : colId === "location" ? (
                          r.address ? (
                            <span className="line-clamp-2 max-w-[10rem]">{r.address}</span>
                          ) : (
                            "—"
                          )
                        ) : colId === "van_selling" ? (
                          r.van_selling ? "Да" : "Нет"
                        ) : null}
                      </td>
                    ))}
                    {canWrite ? (
                      <td className="px-2 py-2 text-right align-top">
                        <TableRowActionGroup className="justify-end" ariaLabel="Действия">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            className="text-amber-700 hover:bg-amber-500/10 hover:text-amber-800 dark:text-amber-400"
                            title="Редактировать"
                            onClick={() => {
                              setEditing(r);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil className="size-3.5" aria-hidden />
                          </Button>
                          {tab === "active" ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="text-muted-foreground hover:bg-muted hover:text-foreground"
                              title="Деактивировать"
                              onClick={() => setDeactivateTarget(r)}
                            >
                              <UserMinus className="size-3.5" aria-hidden />
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="text-primary hover:bg-primary/10"
                              title="Активировать"
                              disabled={activateMut.isPending}
                              onClick={() => activateMut.mutate(r.id)}
                            >
                              <RotateCcw className="size-3.5" aria-hidden />
                            </Button>
                          )}
                        </TableRowActionGroup>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
            </div>

            <div className="table-content-footer flex flex-wrap items-center justify-between gap-2 border-t border-border/80 bg-muted/25 px-3 py-3 text-xs text-muted-foreground sm:px-4">
              <span>
                Показано {from} - {to} / {total}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ←
                </Button>
                {(() => {
                  const buttons: number[] = [];
                  const windowSize = 5;
                  let start = Math.max(1, page - Math.floor(windowSize / 2));
                  const end = Math.min(totalPages, start + windowSize - 1);
                  start = Math.max(1, end - windowSize + 1);
                  for (let p = start; p <= end; p++) buttons.push(p);
                  return buttons.map((p) => (
                    <Button
                      key={p}
                      type="button"
                      variant={page === p ? "default" : "outline"}
                      size="sm"
                      className="h-7 min-w-7 px-2"
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </Button>
                  ));
                })()}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  →
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <WarehouseFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditing(null);
        }}
        initial={editing}
        canWrite={canWrite}
        tenantSlug={tenantSlug}
        onSaved={() => {}}
      />

      <Dialog open={deactivateTarget != null} onOpenChange={(o) => !o && setDeactivateTarget(null)}>
        <DialogContent className="max-w-sm" showCloseButton>
          <DialogHeader>
            <DialogTitle>Деактивировать склад?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deactivateTarget
              ? `«${deactivateTarget.name}» будет скрыт из активного списка. Повторно включить можно на вкладке «Не активный».`
              : null}
          </p>
          <DialogFooter className="flex flex-row justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDeactivateTarget(null)}>
              Отмена
            </Button>
            <Button
              type="button"
              disabled={deactivateMut.isPending}
              onClick={() => {
                if (deactivateTarget) deactivateMut.mutate(deactivateTarget.id);
              }}
            >
              Деактивировать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
