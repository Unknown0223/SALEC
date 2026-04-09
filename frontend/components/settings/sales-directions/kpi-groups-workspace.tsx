"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { STALE } from "@/lib/query-stale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatGroupedInteger } from "@/lib/format-numbers";
import { downloadXlsxSheet } from "@/lib/download-xlsx";
import { Pencil, RefreshCw } from "lucide-react";
import { SearchableMultiSelectPanel } from "@/components/ui/searchable-multi-select-panel";

type KpiListRow = {
  id: number;
  name: string;
  code: string | null;
  sort_order: number;
  comment: string | null;
  is_active: boolean;
  products: { id: number; name: string; sku: string }[];
  agents: { id: number; fio: string; code: string | null }[];
  product_total: number;
  agent_total: number;
};

type KpiDetail = {
  id: number;
  name: string;
  code: string | null;
  sort_order: number;
  comment: string | null;
  is_active: boolean;
  product_ids: number[];
  agent_user_ids: number[];
};

type ProductPick = { id: number; name: string; sku: string };

type Props = { tenantSlug: string };

function TagOverflow({
  items,
  label,
  total
}: {
  items: { key: string; text: string }[];
  label: string;
  total: number;
}) {
  const more = Math.max(0, total - items.length);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {items.map((x) => (
        <span key={x.key} className="max-w-[140px] truncate rounded bg-muted px-1.5 py-0.5 text-[10px]" title={x.text}>
          {x.text}
        </span>
      ))}
      {more > 0 ? (
        <span className="text-[10px] font-medium text-primary">
          ещё {formatGroupedInteger(more)} {label}
        </span>
      ) : null}
    </div>
  );
}

export function KpiGroupsWorkspace({ tenantSlug }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"active" | "inactive">("active");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const listQ = useQuery({
    queryKey: ["kpi-groups", tenantSlug, tab],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.list,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("is_active", tab === "active" ? "true" : "false");
      const { data } = await api.get<{ data: KpiListRow[] }>(`/api/${tenantSlug}/kpi-groups?${params.toString()}`);
      return data.data;
    }
  });

  const createMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      await api.post(`/api/${tenantSlug}/kpi-groups`, body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["kpi-groups", tenantSlug] });
      setAddOpen(false);
    }
  });

  const patchMut = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Record<string, unknown> }) => {
      await api.patch(`/api/${tenantSlug}/kpi-groups/${id}`, body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["kpi-groups", tenantSlug] });
      setEditId(null);
    }
  });

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = listQ.data ?? [];
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.code ?? "", r.comment ?? ""].join(" ").toLowerCase().includes(q)
    );
  }, [listQ.data, search]);

  const total = filteredRows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage, pageSize]);

  useEffect(() => setPage(1), [tab, search, pageSize]);

  return (
    <>
      <div className="orders-hub-section orders-hub-section--table">
        <Card className="overflow-hidden rounded-none border-0 bg-transparent shadow-none hover:shadow-none">
          <CardContent className="p-0">
            <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border bg-muted/25 px-3 py-0 sm:px-4">
              <div className="flex gap-1">
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
              <div className="flex flex-wrap gap-2 py-1">
                <Button type="button" size="sm" className="h-9" onClick={() => setAddOpen(true)}>
                  Добавить
                </Button>
              </div>
            </div>

            <div
              className="table-toolbar flex min-w-0 flex-wrap items-end gap-2 border-b border-border/80 bg-muted/30 px-3 py-2 sm:px-4"
              role="toolbar"
              aria-label="Таблица: поиск и экспорт"
            >
              <label className="grid shrink-0 gap-1 text-xs font-medium text-foreground/85">
                <span className="leading-none">На стр.</span>
                <select
                  className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number.parseInt(e.target.value, 10))}
                >
                  {[10, 25, 50].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <div className="relative min-w-[12rem] max-w-xs flex-1">
                <Input
                  placeholder="Поиск"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 w-full min-w-0 bg-background text-xs"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0 text-xs"
                onClick={() => {
                  const headers = ["Название", "Код", "Сортировка", "Продукты", "Агенты", "Комментарий"];
                  const rows = filteredRows.map((r) => [
                    r.name,
                    r.code ?? "",
                    r.sort_order,
                    r.product_total,
                    r.agent_total,
                    (r.comment ?? "").replace(/\n/g, " ")
                  ]);
                  downloadXlsxSheet(
                    `kpi_groups_${tab}_${new Date().toISOString().slice(0, 10)}.xlsx`,
                    "KPI группы",
                    headers,
                    rows
                  );
                }}
              >
                Excel
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                title="Обновить"
                onClick={() => void listQ.refetch()}
              >
                <RefreshCw className={cn("size-4", listQ.isFetching && "animate-spin")} />
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-xs">
          <thead className="app-table-thead">
            <tr>
              <th className="px-2 py-2 text-left font-medium text-muted-foreground">Название</th>
              <th className="px-2 py-2 text-left font-medium text-muted-foreground">Код</th>
              <th className="px-2 py-2 text-left font-medium text-muted-foreground">Сортировка</th>
              <th className="px-2 py-2 text-left font-medium text-muted-foreground">Продукт</th>
              <th className="px-2 py-2 text-left font-medium text-muted-foreground">Агенты</th>
              <th className="px-2 py-2 text-left font-medium text-muted-foreground">Комментарий</th>
              <th className="w-12 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id} className="border-t even:bg-muted/20">
                <td className="px-2 py-2 font-medium">{r.name}</td>
                <td className="px-2 py-2 font-mono">{r.code ?? "—"}</td>
                <td className="px-2 py-2 tabular-nums">{formatGroupedInteger(r.sort_order)}</td>
                <td className="max-w-[220px] px-2 py-2">
                  <TagOverflow
                    items={r.products.map((p) => ({
                      key: String(p.id),
                      text: `${p.sku} ${p.name}`.trim()
                    }))}
                    label="прод."
                    total={r.product_total}
                  />
                </td>
                <td className="max-w-[220px] px-2 py-2">
                  <TagOverflow
                    items={r.agents.map((a) => ({
                      key: String(a.id),
                      text: `${a.code ?? a.id} — ${a.fio}`.trim()
                    }))}
                    label="аг."
                    total={r.agent_total}
                  />
                </td>
                <td className="max-w-[120px] truncate px-2 py-2 text-muted-foreground">{r.comment ?? "—"}</td>
                <td className="px-2 py-2">
                  <Button type="button" variant="ghost" size="icon-sm" title="Редактировать" onClick={() => setEditId(r.id)}>
                    <Pencil className="size-3.5 text-amber-600" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/80 bg-muted/20 px-3 py-2 sm:px-4">
              <p className="text-xs text-muted-foreground">
                Показано{" "}
                {formatGroupedInteger(pageRows.length ? (safePage - 1) * pageSize + 1 : 0)} –{" "}
                {formatGroupedInteger((safePage - 1) * pageSize + pageRows.length)} /{" "}
                {formatGroupedInteger(total)}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ‹
                </Button>
                <span className="text-xs tabular-nums">
                  {formatGroupedInteger(safePage)} / {formatGroupedInteger(pageCount)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={safePage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  ›
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <KpiFormDialog
        mode="add"
        tenantSlug={tenantSlug}
        open={addOpen}
        onOpenChange={setAddOpen}
        saving={createMut.isPending}
        onSave={(body) => createMut.mutate(body)}
      />
      <KpiFormDialog
        mode="edit"
        tenantSlug={tenantSlug}
        id={editId}
        open={editId != null}
        onOpenChange={(o) => !o && setEditId(null)}
        saving={patchMut.isPending}
        onSave={(body) => editId != null && patchMut.mutate({ id: editId, body })}
      />
    </>
  );
}

function KpiFormDialog({
  mode,
  tenantSlug,
  id,
  open,
  onOpenChange,
  saving,
  onSave
}: {
  mode: "add" | "edit";
  tenantSlug: string;
  id?: number | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  saving: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const detailQ = useQuery({
    queryKey: ["kpi-group-detail", tenantSlug, id],
    enabled: open && mode === "edit" && id != null && id > 0,
    queryFn: async () => {
      const { data } = await api.get<{ data: KpiDetail }>(`/api/${tenantSlug}/kpi-groups/${id}`);
      return data.data;
    }
  });

  const agentsQ = useQuery({
    queryKey: ["agents-kpi-pick", tenantSlug],
    enabled: open && Boolean(tenantSlug),
    staleTime: STALE.reference,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("is_active", "true");
      const { data } = await api.get<{ data: { id: number; fio: string; code: string | null }[] }>(
        `/api/${tenantSlug}/agents?${params.toString()}`
      );
      return data.data;
    }
  });

  const [prodSearch, setProdSearch] = useState("");
  const productsQ = useQuery({
    queryKey: ["products-kpi-pick", tenantSlug, prodSearch],
    enabled: open && Boolean(tenantSlug),
    staleTime: STALE.list,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("is_active", "true");
      params.set("limit", "80");
      const s = prodSearch.trim();
      if (s) params.set("search", s);
      const { data } = await api.get<{ data: ProductPick[] }>(`/api/${tenantSlug}/products?${params.toString()}`);
      return data.data;
    }
  });

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sort_order, setSort] = useState("0");
  const [comment, setComment] = useState("");
  const [is_active, setActive] = useState(true);
  const [prodSel, setProdSel] = useState<Set<number>>(new Set());
  const [agSel, setAgSel] = useState<Set<number>>(new Set());
  const [agSearch, setAgSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setProdSearch("");
    setAgSearch("");
    if (mode === "add") {
      setName("");
      setCode("");
      setSort("0");
      setComment("");
      setActive(true);
      setProdSel(new Set());
      setAgSel(new Set());
    }
  }, [open, mode]);

  const d = detailQ.data;
  useEffect(() => {
    if (!open || mode !== "edit" || !d) return;
    setName(d.name);
    setCode(d.code ?? "");
    setSort(String(d.sort_order));
    setComment(d.comment ?? "");
    setActive(d.is_active);
    setProdSel(new Set(d.product_ids));
    setAgSel(new Set(d.agent_user_ids));
  }, [open, mode, d]);

  const agents = agentsQ.data ?? [];
  const filteredAgents = agents.filter((a) => {
    const q = agSearch.trim().toLowerCase();
    if (!q) return true;
    return `${a.fio} ${a.code ?? ""} ${a.id}`.toLowerCase().includes(q);
  });

  const products = productsQ.data ?? [];

  const submit = () => {
    const so = Number.parseInt(sort_order, 10);
    onSave({
      name: name.trim(),
      code: code.trim() || null,
      sort_order: Number.isFinite(so) ? so : 0,
      comment: comment.trim() || null,
      is_active,
      product_ids: Array.from(prodSel),
      agent_user_ids: Array.from(agSel)
    });
  };

  const loadingEdit = mode === "edit" && detailQ.isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Добавить" : "Редактировать"}</DialogTitle>
        </DialogHeader>
        {loadingEdit ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : (
          <div className="grid gap-3">
            <label className="text-xs text-muted-foreground">
              Название
              <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Название *" />
            </label>
            <SearchableMultiSelectPanel
              label="Продукт"
              searchPlaceholder="Поиск SKU / название"
              search={prodSearch}
              onSearchChange={setProdSearch}
              items={products.map((p) => ({
                id: p.id,
                subtitle: p.sku,
                title: p.name
              }))}
              selected={prodSel}
              onSelectedChange={setProdSel}
              loading={productsQ.isFetching}
              emptyMessage="Нет строк — измените поиск"
              maxListHeightClass="max-h-52"
              selectAllLabel="Выбрать все на экране"
              clearVisibleLabel="Снять на экране"
            />
            <SearchableMultiSelectPanel
              label="Агенты"
              searchPlaceholder="Поиск по коду, ФИО, ID"
              search={agSearch}
              onSearchChange={setAgSearch}
              items={filteredAgents.map((a) => ({
                id: a.id,
                subtitle: a.code != null && String(a.code).trim() !== "" ? String(a.code) : `#${a.id}`,
                title: a.fio
              }))}
              selected={agSel}
              onSelectedChange={setAgSel}
              loading={agentsQ.isFetching}
              emptyMessage="Нет агентов — измените поиск"
              maxListHeightClass="max-h-52"
              selectAllLabel="Выбрать все на экране"
              clearVisibleLabel="Снять на экране"
            />
            <label className="text-xs text-muted-foreground">
              Код
              <Input className="mt-1 font-mono" value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} />
              <span className="text-[10px]">{code.length} / 20</span>
            </label>
            <label className="text-xs text-muted-foreground">
              Сортировка
              <Input className="mt-1" type="number" value={sort_order} onChange={(e) => setSort(e.target.value)} />
            </label>
            <label className="text-xs text-muted-foreground">
              Комментарий
              <textarea
                className="mt-1 min-h-[56px] w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={is_active} onChange={(e) => setActive(e.target.checked)} />
              Активный
            </label>
          </div>
        )}
        <DialogFooter>
          <Button type="button" className="w-full" disabled={saving || !name.trim() || loadingEdit} onClick={submit}>
            {mode === "add" ? "Добавить" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
