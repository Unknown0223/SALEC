"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { downloadXlsxSheet } from "@/lib/download-xlsx";
import { TableColumnSettingsDialog } from "@/components/data-table/table-column-settings-dialog";
import { useUserTablePrefs } from "@/hooks/use-user-table-prefs";
import {
  RoleLinkPickerGrid,
  cloneRoleSets,
  emptySetsForRoles,
  linksFromRoleSets,
  setsFromRoleLinks,
  type RolePickerColumn
} from "@/components/role-link-picker/role-link-picker-grid";
import { ClipboardList, Clock, MapPin, Pencil, RefreshCw, Search, X } from "lucide-react";

const CASH_DESK_TABLE_ID = "cash_desks.v1";

const COLUMN_IDS = [
  "closing",
  "name",
  "branch_name",
  "created_at",
  "roles",
  "user_total",
  "sort_order",
  "code",
  "location",
  "comment"
] as const;

const COLUMN_META = COLUMN_IDS.map((id) => ({
  id,
  label:
    {
      closing: "Статус закрытия",
      name: "Названия",
      branch_name: "Филиал",
      created_at: "Дата создания",
      roles: "Пользователи по ролям",
      user_total: "Всего пользователей",
      sort_order: "Сортировка",
      code: "Код",
      location: "Локация",
      comment: "Комментарий"
    }[id] ?? id
}));

const ROLE_LABELS: Record<string, string> = {
  agent: "Агент",
  cashier: "Кассир",
  manager: "Менеджер",
  operator: "Оператор",
  storekeeper: "Склад",
  supervisor: "Супервайзер",
  expeditor: "Экспедитор"
};

const CASH_ROLE_ORDER = [
  "agent",
  "cashier",
  "manager",
  "operator",
  "storekeeper",
  "supervisor",
  "expeditor"
] as const;

const CASH_ROLE_KEYS = [...CASH_ROLE_ORDER];

const CASH_ROLE_COLUMNS: RolePickerColumn[] = [
  { role: "agent", label: ROLE_LABELS.agent, pool: "agents" },
  { role: "cashier", label: ROLE_LABELS.cashier, pool: "operators" },
  { role: "manager", label: ROLE_LABELS.manager, pool: "operators" },
  { role: "operator", label: ROLE_LABELS.operator, pool: "operators" },
  { role: "storekeeper", label: ROLE_LABELS.storekeeper, pool: "operators" },
  { role: "supervisor", label: ROLE_LABELS.supervisor, pool: "supervisors" },
  { role: "expeditor", label: ROLE_LABELS.expeditor, pool: "expeditors" }
];

const TIMEZONES = [
  { value: "Asia/Tashkent", label: "Asia/Tashkent (+05:00)" },
  { value: "Asia/Samarkand", label: "Asia/Samarkand (+05:00)" },
  { value: "Europe/Moscow", label: "Europe/Moscow (+03:00)" },
  { value: "UTC", label: "UTC" }
];

type PickerUser = { id: number; name: string; login: string };

type CashDeskRow = {
  id: number;
  name: string;
  branch_name?: string | null;
  timezone: string;
  sort_order: number | null;
  code: string | null;
  comment: string | null;
  latitude: string | null;
  longitude: string | null;
  is_active: boolean;
  is_closed: boolean;
  created_at: string;
  user_total: number;
  breakdown: { role: string; count: number }[];
  links: { link_role: string; user: PickerUser }[];
};

type PickersData = {
  agents: PickerUser[];
  operators: PickerUser[];
  supervisors: PickerUser[];
  expeditors: PickerUser[];
};

function emptyCashLinkSets() {
  return emptySetsForRoles(CASH_ROLE_KEYS);
}

type Props = { tenantSlug: string; canWrite: boolean };

export function CashDesksWorkspace({ tenantSlug, canWrite }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"active" | "inactive">("active");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [columnOpen, setColumnOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CashDeskRow | null>(null);
  const [shiftDesk, setShiftDesk] = useState<CashDeskRow | null>(null);
  const tablePrefs = useUserTablePrefs({
    tenantSlug,
    tableId: CASH_DESK_TABLE_ID,
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
    queryKey: ["cash-desks", tenantSlug, tab, page, limit, debouncedSearch],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("is_active", tab === "active" ? "true" : "false");
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (debouncedSearch) params.set("q", debouncedSearch);
      const { data } = await api.get<{
        data: CashDeskRow[];
        total: number;
        page: number;
        limit: number;
      }>(`/api/${tenantSlug}/cash-desks?${params.toString()}`);
      return data;
    }
  });

  const pickersQ = useQuery({
    queryKey: ["cash-desks-pickers", tenantSlug],
    enabled: Boolean(tenantSlug) && (formOpen || editing != null),
    queryFn: async () => {
      const { data } = await api.get<{ data: PickersData }>(`/api/${tenantSlug}/cash-desks/pickers`);
      return data.data;
    }
  });

  const patchMut = useMutation({
    mutationFn: async (vars: { id: number; body: Record<string, unknown> }) => {
      await api.patch(`/api/${tenantSlug}/cash-desks/${vars.id}`, vars.body);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["cash-desks", tenantSlug] });
    }
  });

  const rows = listQ.data?.data ?? [];
  const total = listQ.data?.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const exportRows = useCallback(() => {
    const headers = COLUMN_META.filter((c) => tablePrefs.visibleColumnOrder.includes(c.id)).map((c) => c.label);
    const dataRows = rows.map((r) =>
      tablePrefs.visibleColumnOrder.map((colId) => {
        switch (colId) {
          case "closing":
            return r.is_closed ? "Закрыта" : "Открыта";
          case "name":
            return r.name;
          case "branch_name":
            return r.branch_name ?? "";
          case "created_at":
            return new Date(r.created_at).toLocaleString("ru-RU");
          case "roles":
            return r.breakdown.map((b) => `${ROLE_LABELS[b.role] ?? b.role}:${b.count}`).join("; ");
          case "user_total":
            return String(r.user_total);
          case "sort_order":
            return r.sort_order != null ? String(r.sort_order) : "";
          case "code":
            return r.code ?? "";
          case "location":
            return r.latitude && r.longitude ? `${r.latitude},${r.longitude}` : "";
          case "comment":
            return r.comment ?? "";
          default:
            return "";
        }
      })
    );
    downloadXlsxSheet(
      `kassy_${tab}_${new Date().toISOString().slice(0, 10)}.xlsx`,
      "Кассы",
      headers,
      dataRows
    );
  }, [rows, tab, tablePrefs.visibleColumnOrder]);

  return (
    <div className="space-y-4">
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
          {canWrite ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setColumnOpen(true)}>
                Столбцы
              </Button>
              <Button type="button" size="sm" onClick={() => setFormOpen(true)}>
                Добавить
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={limit}
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
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={exportRows}>
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
        </div>

        <TableColumnSettingsDialog
          open={columnOpen}
          onOpenChange={setColumnOpen}
          title="Управление столбцами"
          description="Выберите видимые столбцы и порядок. Сохраняется для вашей учётной записи."
          columns={COLUMN_META}
          columnOrder={tablePrefs.columnOrder}
          hiddenColumnIds={tablePrefs.hiddenColumnIds}
          saving={tablePrefs.saving}
          onSave={(next) => tablePrefs.saveColumnLayout(next)}
          onReset={() => tablePrefs.resetColumnLayout()}
        />

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[1100px] text-xs">
            <thead className="bg-muted/50">
              <tr>
                {tablePrefs.visibleColumnOrder.map((colId) => {
                  const meta = COLUMN_META.find((c) => c.id === colId);
                  return (
                    <th key={colId} className="whitespace-nowrap px-2 py-2 text-left font-medium text-muted-foreground">
                      {meta?.label ?? colId}
                    </th>
                  );
                })}
                <th className="px-2 py-2 text-right font-medium text-muted-foreground"> </th>
              </tr>
            </thead>
            <tbody>
              {listQ.isLoading ? (
                <tr>
                  <td
                    colSpan={tablePrefs.visibleColumnOrder.length + 1}
                    className="px-3 py-8 text-center text-muted-foreground"
                  >
                    Загрузка…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={tablePrefs.visibleColumnOrder.length + 1}
                    className="px-3 py-8 text-center text-muted-foreground"
                  >
                    Нет данных
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t even:bg-muted/15">
                    {tablePrefs.visibleColumnOrder.map((colId) => (
                      <td key={colId} className="px-2 py-2 align-top">
                        {colId === "closing" ? (
                          <button
                            type="button"
                            className="text-left disabled:opacity-50"
                            disabled={!canWrite}
                            title={r.is_closed ? "Открыть" : "Закрыть"}
                            onClick={() =>
                              patchMut.mutate({ id: r.id, body: { is_closed: !r.is_closed } })
                            }
                          >
                            <ClipboardList
                              className={cn("size-5", r.is_closed ? "text-rose-500" : "text-emerald-600")}
                            />
                          </button>
                        ) : colId === "name" ? (
                          <span className="font-medium">{r.name}</span>
                        ) : colId === "branch_name" ? (
                          <span className="text-muted-foreground">{r.branch_name ?? "—"}</span>
                        ) : colId === "created_at" ? (
                          new Date(r.created_at).toLocaleString("ru-RU")
                        ) : colId === "roles" ? (
                          <div className="flex max-w-[14rem] flex-wrap gap-1">
                            {r.breakdown.slice(0, 3).map((b) => (
                              <span
                                key={b.role}
                                className="inline-block rounded-md bg-muted px-1.5 py-0.5 text-[10px]"
                              >
                                {ROLE_LABELS[b.role] ?? b.role} — ({b.count})
                              </span>
                            ))}
                            {r.breakdown.length > 3 ? (
                              <span className="text-[10px] text-primary">ещё {r.breakdown.length - 3}</span>
                            ) : null}
                          </div>
                        ) : colId === "user_total" ? (
                          r.user_total
                        ) : colId === "sort_order" ? (
                          r.sort_order ?? "—"
                        ) : colId === "code" ? (
                          r.code ?? "—"
                        ) : colId === "location" ? (
                          r.latitude && r.longitude ? (
                            <a
                              href={`https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}&zoom=16`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex text-primary"
                              title="Карта"
                            >
                              <MapPin className="size-4" />
                            </a>
                          ) : (
                            "—"
                          )
                        ) : colId === "comment" ? (
                          <span className="line-clamp-2 max-w-[12rem]">{r.comment ?? "—"}</span>
                        ) : null}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          title="Смены кассы"
                          onClick={() => setShiftDesk(r)}
                        >
                          <Clock className="size-4" />
                        </Button>
                        {canWrite ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            title="Редактировать"
                            onClick={() => setEditing(r)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
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
            <span className="tabular-nums">{page}</span>
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

      <CashDeskFormDialog
        tenantSlug={tenantSlug}
        open={formOpen || editing != null}
        initial={editing}
        pickers={pickersQ.data}
        canWrite={canWrite}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />
      <CashDeskShiftsDialog
        tenantSlug={tenantSlug}
        desk={shiftDesk}
        canWrite={canWrite}
        onClose={() => setShiftDesk(null)}
      />
    </div>
  );
}

type ShiftApiRow = {
  id: number;
  opened_at: string;
  closed_at: string | null;
  opening_float: string | null;
  closing_float: string | null;
  notes: string | null;
  opened_by: { id: number; name: string; login: string } | null;
  closed_by: { id: number; name: string; login: string } | null;
};

function CashDeskShiftsDialog({
  tenantSlug,
  desk,
  canWrite,
  onClose
}: {
  tenantSlug: string;
  desk: CashDeskRow | null;
  canWrite: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const open = Boolean(desk);
  const deskId = desk?.id;

  const listQ = useQuery({
    queryKey: ["cash-desk-shifts", tenantSlug, deskId],
    enabled: open && deskId != null,
    queryFn: async () => {
      const { data } = await api.get<{ data: ShiftApiRow[] }>(
        `/api/${tenantSlug}/cash-desks/${deskId}/shifts?limit=40`
      );
      return data.data;
    }
  });

  const openShiftQ = useQuery({
    queryKey: ["cash-desk-shift-open", tenantSlug, deskId],
    enabled: open && deskId != null,
    queryFn: async () => {
      const { data } = await api.get<{ data: ShiftApiRow | null }>(
        `/api/${tenantSlug}/cash-desks/${deskId}/shifts/open`
      );
      return data.data;
    }
  });

  const [openingFloat, setOpeningFloat] = useState("");
  const [closingFloat, setClosingFloat] = useState("");

  const openMut = useMutation({
    mutationFn: async () => {
      const n = openingFloat.trim() === "" ? null : Number.parseFloat(openingFloat.replace(",", "."));
      await api.post(`/api/${tenantSlug}/cash-desks/${deskId}/shifts/open`, {
        opening_float: n != null && Number.isFinite(n) ? n : null,
        notes: null
      });
    },
    onSuccess: async () => {
      setOpeningFloat("");
      await qc.invalidateQueries({ queryKey: ["cash-desk-shifts", tenantSlug, deskId] });
      await qc.invalidateQueries({ queryKey: ["cash-desk-shift-open", tenantSlug, deskId] });
      await qc.invalidateQueries({ queryKey: ["cash-desks", tenantSlug] });
    }
  });

  const closeMut = useMutation({
    mutationFn: async (shiftId: number) => {
      const n = closingFloat.trim() === "" ? null : Number.parseFloat(closingFloat.replace(",", "."));
      await api.post(`/api/${tenantSlug}/cash-desks/${deskId}/shifts/${shiftId}/close`, {
        closing_float: n != null && Number.isFinite(n) ? n : null,
        notes: null
      });
    },
    onSuccess: async () => {
      setClosingFloat("");
      await qc.invalidateQueries({ queryKey: ["cash-desk-shifts", tenantSlug, deskId] });
      await qc.invalidateQueries({ queryKey: ["cash-desk-shift-open", tenantSlug, deskId] });
      await qc.invalidateQueries({ queryKey: ["cash-desks", tenantSlug] });
    }
  });

  const active = openShiftQ.data;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Смены — {desk?.name ?? ""}</DialogTitle>
        </DialogHeader>
        {active ? (
          <div className="space-y-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm">
            <p className="font-medium text-emerald-700 dark:text-emerald-400">Смена открыта</p>
            <p className="text-xs text-muted-foreground">
              С {new Date(active.opened_at).toLocaleString("ru-RU")}
              {active.opened_by ? ` · ${active.opened_by.name}` : ""}
            </p>
            {canWrite ? (
              <div className="flex flex-wrap items-end gap-2 pt-2">
                <div className="space-y-1">
                  <Label className="text-xs">Остаток при закрытии</Label>
                  <Input
                    className="h-8 w-32 text-xs"
                    value={closingFloat}
                    onChange={(e) => setClosingFloat(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={closeMut.isPending}
                  onClick={() => void closeMut.mutate(active.id)}
                >
                  Закрыть смену
                </Button>
              </div>
            ) : null}
          </div>
        ) : canWrite ? (
          <div className="space-y-2 rounded-md border p-3 text-sm">
            <p className="text-muted-foreground">Нет активной смены.</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Наличные на открытии</Label>
                <Input
                  className="h-8 w-32 text-xs"
                  value={openingFloat}
                  onChange={(e) => setOpeningFloat(e.target.value)}
                  placeholder="0"
                />
              </div>
              <Button type="button" size="sm" disabled={openMut.isPending} onClick={() => void openMut.mutate()}>
                Открыть смену
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Нет активной смены.</p>
        )}
        <div className="border-t pt-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Последние смены</p>
          <ul className="max-h-48 space-y-2 overflow-y-auto text-xs">
            {(listQ.data ?? []).map((s) => (
              <li key={s.id} className="rounded border px-2 py-1.5">
                <span className="font-mono tabular-nums">{new Date(s.opened_at).toLocaleString("ru-RU")}</span>
                {s.closed_at ? (
                  <span className="text-muted-foreground">
                    {" "}
                    → {new Date(s.closed_at).toLocaleString("ru-RU")}
                  </span>
                ) : (
                  <span className="text-emerald-600"> · открыта</span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CashDeskFormDialog({
  tenantSlug,
  open,
  initial,
  pickers,
  canWrite,
  onClose
}: {
  tenantSlug: string;
  open: boolean;
  initial: CashDeskRow | null;
  pickers: PickersData | undefined;
  canWrite: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("Asia/Tashkent");
  const [sortOrder, setSortOrder] = useState("");
  const [code, setCode] = useState("");
  const [comment, setComment] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [active, setActive] = useState(true);
  const [mapOpen, setMapOpen] = useState(false);
  const [linkSets, setLinkSets] = useState(() => emptyCashLinkSets());
  const [usersSubOpen, setUsersSubOpen] = useState(false);
  const [draftLinkSets, setDraftLinkSets] = useState(() => emptyCashLinkSets());
  const [userPickerSearch, setUserPickerSearch] = useState("");

  useEffect(() => {
    if (!open) {
      setUsersSubOpen(false);
      return;
    }
    if (initial) {
      setName(initial.name);
      setTimezone(initial.timezone);
      setSortOrder(initial.sort_order != null ? String(initial.sort_order) : "");
      setCode(initial.code ?? "");
      setComment(initial.comment ?? "");
      setLat(initial.latitude ?? "");
      setLng(initial.longitude ?? "");
      setActive(initial.is_active);
      setMapOpen(Boolean(initial.latitude && initial.longitude));
      setLinkSets(
        setsFromRoleLinks(
          CASH_ROLE_KEYS,
          initial.links.map((l) => ({ link_role: l.link_role, user_id: l.user.id }))
        )
      );
    } else {
      setName("");
      setTimezone("Asia/Tashkent");
      setSortOrder("");
      setCode("");
      setComment("");
      setLat("");
      setLng("");
      setActive(true);
      setMapOpen(false);
      setLinkSets(emptyCashLinkSets());
    }
  }, [open, initial]);

  const selectedUserCount = useMemo(
    () => CASH_ROLE_KEYS.reduce((n, r) => n + (linkSets[r]?.size ?? 0), 0),
    [linkSets]
  );

  const saveMut = useMutation({
    mutationFn: async () => {
      const links = linksFromRoleSets(CASH_ROLE_KEYS, linkSets);
      const sortNum = sortOrder.trim() === "" ? null : Number.parseInt(sortOrder, 10);
      const latN = lat.trim() === "" ? null : Number.parseFloat(lat.replace(",", "."));
      const lngN = lng.trim() === "" ? null : Number.parseFloat(lng.replace(",", "."));
      const body = {
        name: name.trim(),
        timezone,
        sort_order: Number.isFinite(sortNum as number) ? sortNum : null,
        code: code.trim() || null,
        comment: comment.trim() || null,
        latitude: latN != null && Number.isFinite(latN) ? latN : null,
        longitude: lngN != null && Number.isFinite(lngN) ? lngN : null,
        is_active: active,
        links
      };
      if (initial) {
        await api.patch(`/api/${tenantSlug}/cash-desks/${initial.id}`, body);
      } else {
        await api.post(`/api/${tenantSlug}/cash-desks`, body);
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["cash-desks", tenantSlug] });
      onClose();
    }
  });

  if (!canWrite) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent
          className={cn(
            "flex max-h-[96vh] w-full flex-col gap-0 overflow-x-hidden overflow-y-auto p-0",
            "!max-w-xl sm:!max-w-xl"
          )}
          showCloseButton
        >
          <DialogHeader className="shrink-0 border-b border-border px-5 pb-3 pt-4 pr-14 text-left">
            <DialogTitle className="text-base font-semibold">
              {initial ? "Редактировать" : "Добавить"}
            </DialogTitle>
          </DialogHeader>

          <div className="shrink-0 overflow-visible px-5 py-4">
            <div className="mx-auto grid w-full max-w-xl gap-5">
              <div className="grid gap-4 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-0">
                <div className="grid min-w-0 gap-2">
                  <Label className="text-sm font-medium">Название *</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={cn("h-10", !name.trim() ? "border-destructive/60" : "")}
                  />
                </div>
                <div className="grid min-w-0 gap-2">
                  <Label className="text-sm font-medium">Часовой пояс</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

            <div className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-4">
              <p className="mb-2.5 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Пользователи</span>
                {": "}
                {selectedUserCount}
              </p>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full border-2 border-teal-600/45 text-sm font-medium text-teal-800 shadow-none hover:bg-teal-50 dark:border-teal-500/50 dark:text-teal-300 dark:hover:bg-teal-950/40"
                onClick={() => {
                  setDraftLinkSets(cloneRoleSets(CASH_ROLE_KEYS, linkSets));
                  setUserPickerSearch("");
                  setUsersSubOpen(true);
                }}
              >
                Редактировать добавленных пользователей
              </Button>
            </div>
            <div className="grid gap-2">
              <Label className="text-sm font-medium">Сортировка</Label>
              <Input
                className="h-10"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value.replace(/[^\d-]/g, ""))}
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-sm font-medium">Код</Label>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{code.length} / 20</span>
              </div>
              <Input
                className="h-10"
                value={code}
                maxLength={20}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-sm font-medium">Комментарий</Label>
              <textarea
                className="min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm shadow-sm"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
            <div>
              <button
                type="button"
                className="text-left text-sm font-medium text-primary underline-offset-4 hover:underline"
                onClick={() => setMapOpen((v) => !v)}
              >
                {mapOpen ? "Скрыть местоположение" : initial ? "Изменить местоположение" : "Добавить местоположение"}
              </button>
            </div>
            {mapOpen ? (
              <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:p-4">
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="grid min-w-0 gap-1.5">
                    <Label className="text-xs font-medium">Широта</Label>
                    <Input className="h-10" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="41.31" />
                  </div>
                  <div className="grid min-w-0 gap-1.5">
                    <Label className="text-xs font-medium">Долгота</Label>
                    <Input className="h-10" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="69.24" />
                  </div>
                </div>
                {(() => {
                  const latNum = Number.parseFloat(String(lat).replace(",", "."));
                  const lngNum = Number.parseFloat(String(lng).replace(",", "."));
                  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;
                  return (
                    <iframe
                      title="map"
                      className="h-48 w-full rounded border"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${lngNum - 0.02}%2C${latNum - 0.02}%2C${lngNum + 0.02}%2C${latNum + 0.02}&layer=mapnik&marker=${latNum}%2C${lngNum}`}
                    />
                  );
                })()}
              </div>
            ) : null}
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-lg border border-input bg-background px-4 py-2.5 text-sm shadow-sm">
              <span className="font-medium">Активный</span>
              <input
                type="checkbox"
                className="size-4 accent-teal-600"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
            </label>
            </div>
          </div>
          <DialogFooter className="mx-0 mb-0 shrink-0 flex-row justify-end gap-3 rounded-b-xl border-t border-border bg-background px-5 py-4 pb-5">
            <Button type="button" variant="outline" className="min-h-10 min-w-[7rem]" onClick={onClose}>
              Отмена
            </Button>
            <Button
              type="button"
              className="min-h-10 min-w-[7rem] bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500"
              disabled={!name.trim() || saveMut.isPending}
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
                  Блоки по ролям; длинный список внутри блока с прокруткой. Один сотрудник — в одной колонке.
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
                      value={userPickerSearch}
                      onChange={(e) => setUserPickerSearch(e.target.value)}
                      className={cn(
                        "h-11 w-full border-0 bg-transparent pl-11 text-sm shadow-none",
                        "placeholder:text-muted-foreground/70",
                        "focus-visible:ring-0 focus-visible:ring-offset-0",
                        userPickerSearch.trim() ? "pr-11" : "pr-4"
                      )}
                      aria-label="Поиск пользователей"
                    />
                    {userPickerSearch.trim() ? (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Очистить поиск"
                        onClick={() => setUserPickerSearch("")}
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
              roleOrder={CASH_ROLE_KEYS}
              columns={CASH_ROLE_COLUMNS}
              pickers={pickers}
              local={draftLinkSets}
              setLocal={setDraftLinkSets}
              search={userPickerSearch}
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
                setLinkSets(cloneRoleSets(CASH_ROLE_KEYS, draftLinkSets));
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
