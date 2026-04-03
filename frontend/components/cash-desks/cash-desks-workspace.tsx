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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { downloadXlsxSheet } from "@/lib/download-xlsx";
import { TableColumnSettingsDialog } from "@/components/data-table/table-column-settings-dialog";
import { useUserTablePrefs } from "@/hooks/use-user-table-prefs";
import {
  ClipboardList,
  Filter,
  ListOrdered,
  MapPin,
  Pencil,
  RefreshCw,
  Search
} from "lucide-react";

const CASH_DESK_TABLE_ID = "cash_desks.v1";

const COLUMN_IDS = [
  "closing",
  "name",
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
  cashier: "Кассир",
  manager: "Менеджер",
  operator: "Оператор",
  supervisor: "Супервайзер",
  expeditor: "Экспедитор"
};

const LINK_ROLES = ["cashier", "manager", "operator", "supervisor", "expeditor"] as const;
type LinkRole = (typeof LINK_ROLES)[number];

const SUP_EXP_PICKER_COLS: { role: LinkRole; label: string; pool: "supervisors" | "expeditors" }[] = [
  { role: "supervisor", label: "Супервайзер", pool: "supervisors" },
  { role: "expeditor", label: "Экспедитор", pool: "expeditors" }
];

const OPERATOR_DESK_LINK_ROLES = ["cashier", "manager", "operator"] as const;
type OperatorDeskLinkRole = (typeof OPERATOR_DESK_LINK_ROLES)[number];

function getOperatorDeskLinkRole(
  sets: Record<LinkRole, Set<number>>,
  userId: number
): "" | OperatorDeskLinkRole {
  for (const r of OPERATOR_DESK_LINK_ROLES) {
    if (sets[r].has(userId)) return r;
  }
  return "";
}

function setOperatorDeskLink(
  sets: Record<LinkRole, Set<number>>,
  userId: number,
  role: "" | OperatorDeskLinkRole
): Record<LinkRole, Set<number>> {
  const next: Record<LinkRole, Set<number>> = {
    cashier: new Set(sets.cashier),
    manager: new Set(sets.manager),
    operator: new Set(sets.operator),
    supervisor: new Set(sets.supervisor),
    expeditor: new Set(sets.expeditor)
  };
  for (const r of OPERATOR_DESK_LINK_ROLES) {
    next[r].delete(userId);
  }
  if (role) next[role].add(userId);
  return next;
}

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
  operators: PickerUser[];
  supervisors: PickerUser[];
  expeditors: PickerUser[];
};

function poolUsers(p: PickersData, pool: "operators" | "supervisors" | "expeditors"): PickerUser[] {
  if (pool === "operators") return p.operators;
  if (pool === "supervisors") return p.supervisors;
  return p.expeditors;
}

function setsFromLinks(links: { link_role: string; user_id: number }[]) {
  const m: Record<LinkRole, Set<number>> = {
    cashier: new Set(),
    manager: new Set(),
    operator: new Set(),
    supervisor: new Set(),
    expeditor: new Set()
  };
  for (const l of links) {
    const r = l.link_role as LinkRole;
    if (m[r]) m[r].add(l.user_id);
  }
  return m;
}

function linksFromSets(sets: Record<LinkRole, Set<number>>): { user_id: number; link_role: LinkRole }[] {
  const out: { user_id: number; link_role: LinkRole }[] = [];
  for (const role of LINK_ROLES) {
    sets[role].forEach((uid) => {
      out.push({ user_id: uid, link_role: role });
    });
  }
  return out;
}

function toggleUserInRole(
  sets: Record<LinkRole, Set<number>>,
  role: LinkRole,
  userId: number,
  on: boolean
): Record<LinkRole, Set<number>> {
  const next: Record<LinkRole, Set<number>> = {
    cashier: new Set(sets.cashier),
    manager: new Set(sets.manager),
    operator: new Set(sets.operator),
    supervisor: new Set(sets.supervisor),
    expeditor: new Set(sets.expeditor)
  };
  if (on) {
    for (const r of LINK_ROLES) {
      if (r !== role) next[r].delete(userId);
    }
    next[role].add(userId);
  } else {
    next[role].delete(userId);
  }
  return next;
}

function UserPickerDialog({
  open,
  onOpenChange,
  pickers,
  selection,
  onApply,
  search,
  onSearchChange
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pickers: PickersData | undefined;
  selection: Record<LinkRole, Set<number>>;
  onApply: (next: Record<LinkRole, Set<number>>) => void;
  search: string;
  onSearchChange: (s: string) => void;
}) {
  const [local, setLocal] = useState(selection);
  useEffect(() => {
    if (open) setLocal(selection);
  }, [open, selection]);

  const q = search.trim().toLowerCase();
  const match = (u: PickerUser) =>
    !q || u.name.toLowerCase().includes(q) || u.login.toLowerCase().includes(q);

  if (!pickers) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="z-[100] max-w-md gap-0 p-0 sm:max-w-md"
          showCloseButton
        >
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle>Пользователи кассы</DialogTitle>
            <DialogDescription className="text-left text-xs text-muted-foreground">
              Один сотрудник может быть привязан к кассе только с одной ролью привязки.
            </DialogDescription>
          </DialogHeader>
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Загрузка…</p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "z-[100] flex max-h-[min(92vh,720px)] w-[min(100vw-1rem,1120px)] max-w-none flex-col gap-0 overflow-hidden p-0",
          "rounded-xl border border-border bg-card shadow-lg sm:max-w-none"
        )}
        showCloseButton
      >
        <DialogHeader className="shrink-0 space-y-1.5 border-b border-border px-4 pb-3 pt-4">
          <DialogTitle className="text-base font-semibold tracking-tight">Пользователи кассы</DialogTitle>
          <DialogDescription className="text-left text-xs leading-relaxed text-muted-foreground">
            Для сотрудников с ролью «оператор» в системе выберите одну роль на кассе: кассир, менеджер или оператор
            кассы — либо оставьте «не назначено». Супервайзер и экспедитор назначаются отдельно; у одного человека на
            этой кассе может быть только одна роль привязки.
          </DialogDescription>
          <div className="relative pt-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              placeholder="Поиск"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-10 w-full pl-9 pr-3"
              aria-label="Поиск пользователей"
            />
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden border-b border-border bg-muted/20">
          <div className="flex h-[min(58vh,520px)] min-w-[720px] divide-x divide-border">
            <div className="flex min-w-0 flex-[2] flex-col bg-background">
              <div className="shrink-0 border-b border-border bg-muted/40 px-3 py-2.5">
                <span className="text-sm font-semibold text-foreground">Операторы (роль на кассе)</span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
                {(() => {
                  const opUsers = poolUsers(pickers, "operators").filter(match);
                  if (opUsers.length === 0) {
                    return (
                      <p className="px-1 py-4 text-center text-xs text-muted-foreground">Нет совпадений</p>
                    );
                  }
                  return (
                    <ul className="space-y-1">
                      {opUsers.map((u) => (
                        <li
                          key={u.id}
                          className="flex flex-wrap items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-xs hover:bg-muted/60 sm:flex-nowrap"
                        >
                          <div className="min-w-0 flex-1 leading-snug">
                            <span className="block font-medium text-foreground">{u.name}</span>
                            <span className="block text-[11px] text-muted-foreground">{u.login}</span>
                          </div>
                          <select
                            className="h-9 w-full shrink-0 rounded-md border border-input bg-background px-2 text-xs sm:w-[200px]"
                            aria-label={`Роль на кассе для ${u.name}`}
                            value={getOperatorDeskLinkRole(local, u.id)}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLocal((prev) =>
                                setOperatorDeskLink(
                                  prev,
                                  u.id,
                                  v === "" ? "" : (v as OperatorDeskLinkRole)
                                )
                              );
                            }}
                          >
                            <option value="">Не назначено</option>
                            <option value="cashier">{ROLE_LABELS.cashier}</option>
                            <option value="manager">{ROLE_LABELS.manager}</option>
                            <option value="operator">{ROLE_LABELS.operator} кассы</option>
                          </select>
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </div>
            </div>
            {SUP_EXP_PICKER_COLS.map((col) => {
              const users = poolUsers(pickers, col.pool).filter(match);
              const allIds = users.map((u) => u.id);
              const allOn = allIds.length > 0 && allIds.every((id) => local[col.role].has(id));
              return (
                <div key={col.role} className="flex w-[220px] shrink-0 flex-col bg-background">
                  <div className="shrink-0 border-b border-border bg-muted/40 px-3 py-2.5 text-center">
                    <span className="text-sm font-semibold text-foreground">{col.label}</span>
                  </div>
                  <label
                    className={cn(
                      "flex shrink-0 cursor-pointer items-center gap-2 border-b border-border px-3 py-2 text-xs",
                      allIds.length === 0 && "cursor-not-allowed opacity-50"
                    )}
                  >
                    <input
                      type="checkbox"
                      className="size-4 rounded border-input accent-primary"
                      checked={allOn}
                      disabled={allIds.length === 0}
                      onChange={(e) => {
                        setLocal((prev) => {
                          let next: Record<LinkRole, Set<number>> = {
                            cashier: new Set(prev.cashier),
                            manager: new Set(prev.manager),
                            operator: new Set(prev.operator),
                            supervisor: new Set(prev.supervisor),
                            expeditor: new Set(prev.expeditor)
                          };
                          if (e.target.checked) {
                            for (const id of allIds) {
                              next = toggleUserInRole(next, col.role, id, true);
                            }
                          } else {
                            next[col.role] = new Set();
                          }
                          return next;
                        });
                      }}
                    />
                    <span className="font-medium text-foreground">Выбрать все</span>
                  </label>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
                    {users.length === 0 ? (
                      <p className="px-1 py-4 text-center text-xs text-muted-foreground">Нет совпадений</p>
                    ) : (
                      <ul className="space-y-0.5">
                        {users.map((u) => (
                          <li key={u.id}>
                            <label
                              className={cn(
                                "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                                "hover:bg-muted/80 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                              )}
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
                                checked={local[col.role].has(u.id)}
                                onChange={(ev) => {
                                  setLocal((prev) => toggleUserInRole(prev, col.role, u.id, ev.target.checked));
                                }}
                              />
                              <span className="min-w-0 leading-snug">
                                <span className="block font-medium text-foreground">{u.name}</span>
                                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                  {u.login}
                                  <span className="text-muted-foreground/80"> · {col.label}</span>
                                </span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="shrink-0 flex-row justify-end gap-2 border-t border-border/80 bg-background px-4 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="button"
            onClick={() => {
              onApply(local);
              onOpenChange(false);
            }}
          >
            Готово
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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
            <Button type="button" size="sm" onClick={() => setFormOpen(true)}>
              Добавить
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            title="Столбцы"
            onClick={() => setColumnOpen(true)}
          >
            <ListOrdered className="size-3.5" />
          </Button>
          <Button type="button" variant="outline" size="icon-sm" className="h-8 w-8" disabled title="Фильтр">
            <Filter className="size-3.5" />
          </Button>
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
    </div>
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
  const [linkSets, setLinkSets] = useState(() =>
    setsFromLinks([] as { link_role: string; user_id: number }[])
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  useEffect(() => {
    if (!open) return;
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
        setsFromLinks(initial.links.map((l) => ({ link_role: l.link_role, user_id: l.user.id })))
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
      setLinkSets(setsFromLinks([]));
    }
  }, [open, initial]);

  const selectedUserCount = useMemo(
    () => LINK_ROLES.reduce((n, r) => n + linkSets[r].size, 0),
    [linkSets]
  );

  const saveMut = useMutation({
    mutationFn: async () => {
      const links = linksFromSets(linkSets);
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
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" showCloseButton>
          <DialogHeader>
            <DialogTitle>{initial ? "Редактировать" : "Добавить"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Названия *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className={!name.trim() ? "border-destructive/60" : ""} />
            </div>
            <div className="grid gap-1.5">
              <Label>Часовой пояс</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
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
            <Button type="button" variant="outline" className="w-full justify-center" onClick={() => setPickerOpen(true)}>
              {initial ? "Пользователи кассы" : "Добавить пользователей"}
            </Button>
            {selectedUserCount > 0 ? (
              <p className="text-center text-xs text-muted-foreground">
                Выбрано пользователей:{" "}
                <span className="font-medium text-foreground">{selectedUserCount}</span>
              </p>
            ) : null}
            <div className="grid gap-1.5">
              <Label>Сортировка</Label>
              <Input value={sortOrder} onChange={(e) => setSortOrder(e.target.value.replace(/[^\d-]/g, ""))} />
            </div>
            <div className="grid gap-1.5">
              <div className="flex justify-between">
                <Label>Код</Label>
                <span className="text-xs text-muted-foreground">{code.length} / 20</span>
              </div>
              <Input
                value={code}
                maxLength={20}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Комментарий</Label>
              <textarea
                className="min-h-[72px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="text-left text-sm text-primary underline-offset-2 hover:underline"
              onClick={() => setMapOpen((v) => !v)}
            >
              {mapOpen ? "Скрыть местоположение" : initial ? "Изменить местоположение" : "Добавить местоположение"}
            </button>
            {mapOpen ? (
              <div className="grid gap-2 rounded-md border p-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Широта</Label>
                    <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="41.31" />
                  </div>
                  <div>
                    <Label className="text-xs">Долгота</Label>
                    <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="69.24" />
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
            <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>Активный</span>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button
              type="button"
              disabled={!name.trim() || saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              {initial ? "Сохранить" : "Добавить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UserPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        pickers={pickers}
        selection={linkSets}
        search={pickerSearch}
        onSearchChange={setPickerSearch}
        onApply={(next) => setLinkSets(next)}
      />
    </>
  );
}
