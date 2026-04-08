"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { formatNumberGrouped } from "@/lib/format-numbers";
import { getUserFacingError } from "@/lib/error-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type TakeDetail = {
  id: number;
  status: string;
  title: string | null;
  warehouse: { id: number; name: string };
  lines: {
    product: { id: number; sku: string; name: string };
    system_qty: string;
    counted_qty: string | null;
  }[];
};

type ProductPick = { id: number; sku: string; name: string };

type EditableLine = {
  product_id: number;
  sku: string;
  name: string;
  system_qty: string;
  counted_qty: string;
};

function mapDetailToEditable(detail: TakeDetail): EditableLine[] {
  return detail.lines.map((l) => ({
    product_id: l.product.id,
    sku: l.product.sku,
    name: l.product.name,
    system_qty: l.system_qty,
    counted_qty: l.counted_qty != null ? String(l.counted_qty) : ""
  }));
}

function parseQty(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

type Props = {
  tenantSlug: string;
  takeId: number;
  onClose: () => void;
};

export function InventoryTakeEditor({ tenantSlug, takeId, onClose }: Props) {
  const qc = useQueryClient();
  const [lineRows, setLineRows] = useState<EditableLine[]>([]);
  const [dirty, setDirty] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(productSearch.trim()), 320);
    return () => window.clearTimeout(t);
  }, [productSearch]);

  const detailQ = useQuery({
    queryKey: ["stock-take", tenantSlug, takeId],
    enabled: Boolean(tenantSlug) && takeId > 0,
    queryFn: async () => {
      const { data } = await api.get<{ data: TakeDetail }>(`/api/${tenantSlug}/stock-takes/${takeId}`);
      return data.data;
    }
  });

  const detail = detailQ.data;

  useEffect(() => {
    setDirty(false);
    setErrorMsg(null);
    setProductSearch("");
    setLineRows([]);
  }, [takeId]);

  useEffect(() => {
    if (!detail || detail.id !== takeId || dirty) return;
    setLineRows(mapDetailToEditable(detail));
  }, [detail, takeId, dirty]);

  const productsPickQ = useQuery({
    queryKey: ["products-inv-pick", tenantSlug, debouncedSearch],
    enabled: Boolean(tenantSlug) && debouncedSearch.length >= 2,
    queryFn: async () => {
      const { data } = await api.get<{ data: ProductPick[] }>(
        `/api/${tenantSlug}/products?search=${encodeURIComponent(debouncedSearch)}&limit=80&is_active=true`
      );
      return data.data;
    }
  });

  const saveLinesMut = useMutation({
    mutationFn: async (lines: { product_id: number; counted_qty: number | null }[]) => {
      await api.put(`/api/${tenantSlug}/stock-takes/${takeId}/lines`, { lines });
    },
    onSuccess: async () => {
      setDirty(false);
      setErrorMsg(null);
      await qc.invalidateQueries({ queryKey: ["stock-take", tenantSlug, takeId] });
      await qc.invalidateQueries({ queryKey: ["stock-takes", tenantSlug] });
    },
    onError: (e) => setErrorMsg(getUserFacingError(e, "Строки не сохранены"))
  });

  const postMut = useMutation({
    mutationFn: async () => {
      await api.post(`/api/${tenantSlug}/stock-takes/${takeId}/post`);
    },
    onSuccess: async () => {
      setDirty(false);
      setErrorMsg(null);
      await qc.invalidateQueries({ queryKey: ["stock-take", tenantSlug, takeId] });
      await qc.invalidateQueries({ queryKey: ["stock-takes", tenantSlug] });
    },
    onError: (e) => setErrorMsg(getUserFacingError(e, "Проведение не выполнено"))
  });

  const cancelMut = useMutation({
    mutationFn: async () => {
      await api.post(`/api/${tenantSlug}/stock-takes/${takeId}/cancel`);
    },
    onSuccess: async () => {
      setDirty(false);
      setErrorMsg(null);
      await qc.invalidateQueries({ queryKey: ["stock-take", tenantSlug, takeId] });
      await qc.invalidateQueries({ queryKey: ["stock-takes", tenantSlug] });
    },
    onError: (e) => setErrorMsg(getUserFacingError(e, "Отмена не выполнена"))
  });

  const buildPayload = useCallback(() => {
    return lineRows.map((r) => ({
      product_id: r.product_id,
      counted_qty: parseQty(r.counted_qty)
    }));
  }, [lineRows]);

  const handleSaveLines = () => {
    setErrorMsg(null);
    saveLinesMut.mutate(buildPayload());
  };

  const handlePost = async () => {
    setErrorMsg(null);
    if (!lineRows.length) {
      setErrorMsg("Добавьте хотя бы одну строку.");
      return;
    }
    const incomplete = lineRows.some((r) => parseQty(r.counted_qty) == null);
    if (incomplete) {
      setErrorMsg("Укажите фактическое количество по всем строкам перед проведением.");
      return;
    }
    if (
      !window.confirm(
        "Провести инвентаризацию? Остатки на складе будут приведены к указанным количествам."
      )
    ) {
      return;
    }
    try {
      if (dirty) {
        await saveLinesMut.mutateAsync(buildPayload());
      }
      await postMut.mutateAsync();
    } catch (e) {
      setErrorMsg(getUserFacingError(e, "Проведение не выполнено"));
    }
  };

  const handleCancelDoc = () => {
    if (!window.confirm("Отменить черновик? Документ перейдёт в статус «отменён».")) return;
    cancelMut.mutate();
  };

  const addProduct = (p: ProductPick) => {
    setDirty(true);
    setErrorMsg(null);
    setLineRows((prev) => {
      if (prev.some((r) => r.product_id === p.id)) return prev;
      return [
        ...prev,
        {
          product_id: p.id,
          sku: p.sku,
          name: p.name,
          system_qty: "—",
          counted_qty: ""
        }
      ];
    });
    setProductSearch("");
    setDebouncedSearch("");
  };

  const updateCounted = (productId: number, value: string) => {
    setDirty(true);
    setLineRows((prev) => prev.map((r) => (r.product_id === productId ? { ...r, counted_qty: value } : r)));
  };

  const removeLine = (productId: number) => {
    setDirty(true);
    setLineRows((prev) => prev.filter((r) => r.product_id !== productId));
  };

  const pickResults = productsPickQ.data ?? [];
  const isDraft = detail?.status === "draft";

  const diffPreview = useMemo(() => {
    return lineRows.map((r) => {
      const counted = parseQty(r.counted_qty);
      const sys = r.system_qty === "—" ? null : Number.parseFloat(r.system_qty);
      if (counted == null || sys == null || !Number.isFinite(sys)) return null;
      return counted - sys;
    });
  }, [lineRows]);

  if (detailQ.isLoading) {
    return (
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <p className="text-sm text-destructive">Документ не найден.</p>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">
            Документ #{detail.id}
            {detail.title ? ` — ${detail.title}` : ""}
          </h2>
          <p className="text-xs text-muted-foreground">
            Склад: {detail.warehouse.name}. Статус:{" "}
            <span className="font-medium text-foreground">{detail.status}</span>
            {isDraft
              ? ". Системные количества фиксируются при сохранении строк."
              : detail.status === "posted"
                ? ". Остатки обновлены."
                : ""}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Закрыть
        </Button>
      </div>

      {errorMsg ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMsg}
        </p>
      ) : null}

      {isDraft ? (
        <>
          <div className="space-y-2 rounded-md border border-dashed bg-muted/20 p-3">
            <Label className="text-xs">Добавить товар (поиск по названию, SKU или штрихкоду)</Label>
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
              <Input
                className="pl-9"
                placeholder="Минимум 2 символа…"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>
            {debouncedSearch.length >= 2 ? (
              <div className="max-h-48 overflow-auto rounded-md border bg-background text-sm">
                {productsPickQ.isLoading ? (
                  <p className="px-3 py-2 text-muted-foreground">Поиск…</p>
                ) : pickResults.length === 0 ? (
                  <p className="px-3 py-2 text-muted-foreground">Ничего не найдено</p>
                ) : (
                  <ul className="divide-y">
                    {pickResults.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="hover:bg-muted/80 flex w-full items-start gap-2 px-3 py-2 text-left"
                          onClick={() => addProduct(p)}
                        >
                          <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>
                          <span className="flex-1">{p.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="app-table-thead">
                <tr>
                  <th className="px-3 py-2 text-left">SKU</th>
                  <th className="px-3 py-2 text-left">Товар</th>
                  <th className="px-3 py-2 text-right">В системе</th>
                  <th className="px-3 py-2 text-right">Факт</th>
                  <th className="px-3 py-2 text-right">Δ</th>
                  <th className="w-10 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {lineRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                      Нет строк. Добавьте товары поиском выше.
                    </td>
                  </tr>
                ) : (
                  lineRows.map((r, idx) => {
                    const d = diffPreview[idx];
                    return (
                      <tr key={r.product_id} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">{r.sku}</td>
                        <td className="max-w-[220px] truncate px-3 py-2" title={r.name}>
                          {r.name}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatNumberGrouped(r.system_qty, { maxFractionDigits: 3 })}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            className="ml-auto h-8 w-24 text-right tabular-nums"
                            inputMode="decimal"
                            placeholder="0"
                            value={r.counted_qty}
                            onChange={(e) => updateCounted(r.product_id, e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {d != null && Number.isFinite(d)
                            ? d > 0
                              ? `+${formatNumberGrouped(d, { maxFractionDigits: 3 })}`
                              : formatNumberGrouped(d, { maxFractionDigits: 3 })
                            : "—"}
                        </td>
                        <td className="px-2 py-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive"
                            aria-label="Удалить строку"
                            onClick={() => removeLine(r.product_id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={saveLinesMut.isPending} onClick={() => void handleSaveLines()}>
              Сохранить строки
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={postMut.isPending || saveLinesMut.isPending}
              onClick={() => void handlePost()}
            >
              {saveLinesMut.isPending || postMut.isPending ? "Обработка…" : "Провести"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={cancelMut.isPending}
              onClick={() => void handleCancelDoc()}
            >
              Отменить черновик
            </Button>
          </div>
        </>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="app-table-thead">
              <tr>
                <th className="px-3 py-2 text-left">SKU</th>
                <th className="px-3 py-2 text-left">Товар</th>
                <th className="px-3 py-2 text-right">Было в системе</th>
                <th className="px-3 py-2 text-right">Факт</th>
              </tr>
            </thead>
            <tbody>
              {lineRows.map((r) => (
                <tr key={r.product_id} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{r.sku}</td>
                  <td className="max-w-[240px] truncate px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumberGrouped(r.system_qty, { maxFractionDigits: 3 })}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.counted_qty?.trim()
                      ? formatNumberGrouped(r.counted_qty, { maxFractionDigits: 3 })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
