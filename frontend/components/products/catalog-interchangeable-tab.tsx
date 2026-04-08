"use client";

import { TableRowActionGroup } from "@/components/data-table/table-row-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InterchangeableGroupRow } from "@/lib/product-types";
import type { ProductRow } from "@/lib/product-types";
import { api } from "@/lib/api";
import { formatGroupedInteger } from "@/lib/format-numbers";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  tenantSlug: string | null;
  isAdmin: boolean;
  statusTab: "active" | "inactive";
  search: string;
  pageSize: number;
};

export function CatalogInterchangeableTab({
  tenantSlug,
  isAdmin,
  statusTab,
  search,
  pageSize
}: Props) {
  const qc = useQueryClient();
  const apiPath = "catalog/interchangeable-groups";
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [comment, setComment] = useState("");
  const [active, setActive] = useState(true);
  const [productIds, setProductIds] = useState<number[]>([]);
  const [productLabels, setProductLabels] = useState<Record<number, string>>({});
  const [priceTypesSel, setPriceTypesSel] = useState<string[]>([]);
  const [pickSearch, setPickSearch] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const isActiveParam = statusTab === "active";

  const listQ = useQuery({
    queryKey: ["catalog-interchangeable", tenantSlug, statusTab, search, page, pageSize],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
        is_active: isActiveParam ? "true" : "false"
      });
      if (search.trim()) params.set("search", search.trim());
      const { data } = await api.get<{ data: InterchangeableGroupRow[]; total: number }>(
        `/api/${tenantSlug}/${apiPath}?${params}`
      );
      return data;
    }
  });

  const priceTypesQ = useQuery({
    queryKey: ["price-types", tenantSlug, "interchangeable-modal"],
    enabled: Boolean(tenantSlug) && open,
    queryFn: async () => {
      const { data } = await api.get<{ data: string[] }>(`/api/${tenantSlug}/price-types`);
      return data.data;
    }
  });

  const pickQ = useQuery({
    queryKey: ["products-pick", tenantSlug, pickSearch],
    enabled: Boolean(tenantSlug) && open && pickSearch.trim().length >= 1,
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "15", page: "1" });
      params.set("search", pickSearch.trim());
      const { data } = await api.get<{ data: ProductRow[] }>(
        `/api/${tenantSlug}/products?${params}`
      );
      return data.data;
    }
  });

  useEffect(() => {
    setPage(1);
  }, [search, statusTab, pageSize]);

  const rows = listQ.data?.data ?? [];
  const total = listQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function openCreate() {
    setEditId(null);
    setName("");
    setCode("");
    setSortOrder("");
    setComment("");
    setActive(true);
    setProductIds([]);
    setProductLabels({});
    setPriceTypesSel([]);
    setPickSearch("");
    setOpen(true);
  }

  function openEdit(r: InterchangeableGroupRow) {
    setEditId(r.id);
    setName(r.name);
    setCode(r.code ?? "");
    setSortOrder(r.sort_order != null ? String(r.sort_order) : "");
    setComment(r.comment ?? "");
    setActive(r.is_active);
    setProductIds(r.products.map((p) => p.id));
    setProductLabels(Object.fromEntries(r.products.map((p) => [p.id, p.name])));
    setPriceTypesSel([...r.price_types]);
    setPickSearch("");
    setOpen(true);
  }

  function togglePriceType(pt: string) {
    setPriceTypesSel((prev) =>
      prev.includes(pt) ? prev.filter((x) => x !== pt) : [...prev, pt]
    );
  }

  function addProduct(p: { id: number; name: string }) {
    setProductIds((prev) => (prev.includes(p.id) ? prev : [...prev, p.id]));
    setProductLabels((prev) => ({ ...prev, [p.id]: p.name }));
  }

  function removeProduct(id: number) {
    setProductIds((p) => p.filter((x) => x !== id));
    setProductLabels((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!tenantSlug) throw new Error("no");
      const body = {
        name: name.trim(),
        code: code.trim() || null,
        sort_order: sortOrder.trim() === "" ? null : Number.parseInt(sortOrder, 10),
        comment: comment.trim() || null,
        is_active: active,
        product_ids: productIds,
        price_types: priceTypesSel
      };
      if (!body.name) throw new Error("name");
      if (editId != null) {
        await api.put(`/api/${tenantSlug}/${apiPath}/${editId}`, body);
      } else {
        await api.post(`/api/${tenantSlug}/${apiPath}`, body);
      }
    },
    onSuccess: async () => {
      setMsg(null);
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["catalog-interchangeable", tenantSlug] });
    },
    onError: () => setMsg("Saqlashda xato yoki ruxsat yo‘q.")
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Группа взаимозаменяемых товаров</p>
        {isAdmin ? (
          <Button type="button" size="sm" onClick={openCreate}>
            Добавить
          </Button>
        ) : null}
      </div>

      {msg ? <p className="text-sm text-destructive">{msg}</p> : null}

      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="app-table-thead text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Название</th>
              <th className="px-3 py-2 font-medium">Код</th>
              <th className="px-3 py-2 font-medium">Сорт.</th>
              <th className="px-3 py-2 font-medium">Продукты</th>
              <th className="px-3 py-2 font-medium">Тип цены</th>
              <th className="px-3 py-2 text-right font-medium"> </th>
            </tr>
          </thead>
          <tbody>
            {listQ.isLoading ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  Загрузка…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  Пусто
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.code ?? "—"}</td>
                  <td className="px-3 py-2">
                    {r.sort_order != null ? formatGroupedInteger(r.sort_order) : "—"}
                  </td>
                  <td className="max-w-[200px] px-3 py-2 text-xs text-muted-foreground">
                    {r.products.slice(0, 3).map((p) => (
                      <span key={p.id} className="mr-1 inline-block rounded bg-muted px-1 py-0.5">
                        {p.name}
                      </span>
                    ))}
                    {r.products.length > 3 ? (
                      <span className="text-muted-foreground">+{r.products.length - 3}</span>
                    ) : null}
                  </td>
                  <td className="max-w-[180px] px-3 py-2 text-xs text-muted-foreground">
                    {r.price_types.slice(0, 3).join(", ")}
                    {r.price_types.length > 3 ? ` +${r.price_types.length - 3}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isAdmin ? (
                      <TableRowActionGroup className="justify-end" ariaLabel="Guruh">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-foreground"
                          title="Tahrirlash"
                          aria-label="Tahrirlash"
                          onClick={() => openEdit(r)}
                        >
                          <Pencil className="size-3.5" aria-hidden />
                        </Button>
                      </TableRowActionGroup>
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
          {total
            ? `Показано ${formatGroupedInteger((page - 1) * pageSize + 1)}–${formatGroupedInteger(Math.min(page * pageSize, total))} / ${formatGroupedInteger(total)}`
            : ""}
        </span>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ←
          </Button>
          <span className="px-2 py-1">
            {formatGroupedInteger(page)} / {formatGroupedInteger(totalPages)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            →
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]" showCloseButton>
          <DialogHeader>
            <DialogTitle>{editId ? "Редактировать" : "Добавить"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Название</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <div className="flex justify-between">
                <Label>Код</Label>
                <span className="text-xs text-muted-foreground">{code.length} / 20</span>
              </div>
              <Input value={code} maxLength={20} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Сортировка</Label>
              <Input
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value.replace(/[^0-9-]/g, ""))}
                inputMode="numeric"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Добавить продукт (поиск)</Label>
              <Input
                value={pickSearch}
                onChange={(e) => setPickSearch(e.target.value)}
                placeholder="SKU / ном…"
              />
              <div className="max-h-28 space-y-1 overflow-y-auto rounded border p-1">
                {(pickQ.data ?? []).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-muted"
                    onClick={() => addProduct({ id: p.id, name: p.name })}
                  >
                    {p.sku} — {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Выбранные продукты</Label>
              <div className="flex flex-wrap gap-1">
                {productIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className="rounded bg-muted px-2 py-0.5 text-xs"
                    onClick={() => removeProduct(id)}
                  >
                    {(productLabels[id] ?? `#${id}`).slice(0, 28)} ×
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Тип цены (из справочника)</Label>
              <div className="max-h-32 space-y-1 overflow-y-auto rounded border p-2">
                {(priceTypesQ.data ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">Нет типов или нет доступа</p>
                ) : (
                  priceTypesQ.data?.map((pt) => (
                    <label key={pt} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={priceTypesSel.includes(pt)}
                        onChange={() => togglePriceType(pt)}
                      />
                      {pt}
                    </label>
                  ))
                )}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Комментарий</Label>
              <textarea
                className="min-h-[64px] rounded-md border bg-background px-2 py-1 text-sm"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
            <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>Активный</span>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            </label>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !isAdmin}>
              {editId ? "Сохранить" : "Добавить"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
