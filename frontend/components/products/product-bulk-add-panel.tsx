"use client";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/ui/filter-select";
import { api } from "@/lib/api";
import { formatNumberGrouped } from "@/lib/format-numbers";
import { STALE } from "@/lib/query-stale";
import { cn } from "@/lib/utils";
import {
  PRODUCT_UNIT_CUSTOM,
  PRODUCT_UNIT_OPTIONS,
  resolveUnitFromForm
} from "@/lib/product-units";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

type CatRow = { id: number; name: string; code: string | null };

type RowState = {
  categoryId: string;
  name: string;
  unitSelect: string;
  unitCustom: string;
  code: string;
  barcode: string;
  hsCode: string;
  qtyBlock: string;
  lenM: string;
  widM: string;
  thkM: string;
};

function parsePositiveMeters(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Uzunlik × en × qalinlik bo‘yicha hajm (m³), barcha uchala to‘ldirilganda */
function formatVolumeM3(r: RowState): string {
  const L = parsePositiveMeters(r.lenM);
  const W = parsePositiveMeters(r.widM);
  const T = parsePositiveMeters(r.thkM);
  if (L == null || W == null || T == null) return "—";
  const v = L * W * T;
  if (v === 0) return "0";
  if (v < 0.0001) return v.toExponential(2);
  return formatNumberGrouped(v, { maxFractionDigits: 4 });
}

function emptyRow(): RowState {
  return {
    categoryId: "",
    name: "",
    unitSelect: "dona",
    unitCustom: "",
    code: "",
    barcode: "",
    hsCode: "",
    qtyBlock: "",
    lenM: "",
    widM: "",
    thkM: ""
  };
}

type Props = {
  tenantSlug: string | null;
  /** Ro‘yxat sahifasiga qaytish */
  backHref: string;
  onDone: () => void;
  /** Alohida sahifada `PageHeader` bo‘lsa false qiling */
  showCardHeader?: boolean;
};

export function ProductBulkAddPanel({
  tenantSlug,
  backHref,
  onDone,
  showCardHeader = true
}: Props) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<RowState[]>(() => [emptyRow()]);
  const [rowChecked, setRowChecked] = useState<boolean[]>(() => [false]);
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkUnitSelect, setBulkUnitSelect] = useState("dona");
  const [bulkUnitCustom, setBulkUnitCustom] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setRowChecked((prev) => {
      if (prev.length === rows.length) return prev;
      if (prev.length < rows.length) {
        return [...prev, ...Array(rows.length - prev.length).fill(false)];
      }
      return prev.slice(0, rows.length);
    });
  }, [rows.length]);

  const catsQ = useQuery({
    queryKey: ["product-categories", tenantSlug, "bulk-panel"],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: CatRow[] }>(`/api/${tenantSlug}/product-categories`);
      return data.data;
    }
  });

  const cats = catsQ.data ?? [];

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!tenantSlug) throw new Error("no");
      const items: Record<string, unknown>[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const name = r.name.trim();
        if (!name) continue;
        const cid = Number.parseInt(r.categoryId, 10);
        if (!Number.isFinite(cid) || cid < 1) {
          throw new Error(`${i + 1}-qator: kategoriya *`);
        }
        const unit = resolveUnitFromForm(r.unitSelect, r.unitCustom);
        if (r.unitSelect === PRODUCT_UNIT_CUSTOM && !r.unitCustom.trim()) {
          throw new Error(`${i + 1}-qator: birlik *`);
        }
        if (!unit.trim()) {
          throw new Error(`${i + 1}-qator: birlik *`);
        }
        let sku = r.code.trim();
        if (!sku) sku = `BULK-${Date.now()}-${i + 1}`;
        const L = r.lenM.trim() === "" ? null : Number.parseFloat(r.lenM.replace(",", "."));
        const W = r.widM.trim() === "" ? null : Number.parseFloat(r.widM.replace(",", "."));
        const T = r.thkM.trim() === "" ? null : Number.parseFloat(r.thkM.replace(",", "."));
        const qb = r.qtyBlock.trim() === "" ? null : Number.parseInt(r.qtyBlock, 10);
        let length_cm: string | null = null;
        let width_cm: string | null = null;
        let height_cm: string | null = null;
        let volume_m3: string | null = null;
        let dimension_unit: string | null = null;
        if (L != null && L > 0) length_cm = String(L * 100);
        if (W != null && W > 0) width_cm = String(W * 100);
        if (T != null && T > 0) height_cm = String(T * 100);
        if (L != null || W != null || T != null) dimension_unit = "m";
        if (L != null && W != null && T != null && L > 0 && W > 0 && T > 0) {
          volume_m3 = String(L * W * T);
        }
        items.push({
          sku,
          name,
          unit: unit || "dona",
          category_id: cid,
          barcode: r.barcode.trim() || null,
          hs_code: r.hsCode.trim().slice(0, 32) || null,
          qty_per_block: qb != null && Number.isFinite(qb) ? qb : null,
          length_cm,
          width_cm,
          height_cm,
          dimension_unit,
          volume_m3,
          is_active: true
        });
      }
      if (items.length === 0) throw new Error("Kamida bitta to‘ldirilgan qator kerak");
      const { data } = await api.post<{ created: number; errors: string[] }>(
        `/api/${tenantSlug}/products/bulk`,
        { items }
      );
      return data;
    },
    onSuccess: (res) => {
      setMsg(
        `Saqlandi: ${res.created}. ${res.errors.length ? res.errors.slice(0, 4).join("; ") : ""}`
      );
      void qc.invalidateQueries({ queryKey: ["products", tenantSlug] });
      onDone();
      setRows([emptyRow()]);
      setRowChecked([false]);
    },
    onError: (e: unknown) => {
      setMsg(e instanceof Error ? e.message : "Xato");
    }
  });

  function updateRow(i: number, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  const allChecked = rows.length > 0 && rowChecked.length === rows.length && rowChecked.every(Boolean);

  function applyBulkCategory() {
    if (!bulkCategoryId) {
      setMsg("Avval «Hammaga» ustunidan kategoriyani tanlang.");
      return;
    }
    const hasSelection = rowChecked.some(Boolean);
    setRows((prev) =>
      prev.map((r, j) => {
        if (hasSelection && !rowChecked[j]) return r;
        return { ...r, categoryId: bulkCategoryId };
      })
    );
    setMsg(null);
  }

  function applyBulkUnit() {
    if (bulkUnitSelect === PRODUCT_UNIT_CUSTOM && !bulkUnitCustom.trim()) {
      setMsg("Maxsus birlik uchun matn kiriting.");
      return;
    }
    const hasSelection = rowChecked.some(Boolean);
    setRows((prev) =>
      prev.map((r, j) => {
        if (hasSelection && !rowChecked[j]) return r;
        return {
          ...r,
          unitSelect: bulkUnitSelect,
          unitCustom: bulkUnitSelect === PRODUCT_UNIT_CUSTOM ? bulkUnitCustom : ""
        };
      })
    );
    setMsg(null);
  }

  return (
    <Card className="border-primary/20">
      {showCardHeader ? (
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Bir nechta mahsulot qo‘shish</CardTitle>
          <CardDescription>
            <span className="text-destructive">*</span> — har bir to‘ldirilgan qator uchun kategoriya, nom va
            birlik majburiy. Birinchi ustun: qatorlarni belgilang yoki bo‘sh qoldiring — «Qatorlarga» barcha
            qatorlarga qo‘llanadi. Kod bo‘sh bo‘lsa, SKU avtomatik beriladi.
          </CardDescription>
        </CardHeader>
      ) : null}
      <CardContent className={showCardHeader ? "space-y-2" : "space-y-2 pt-4"}>
        <div className="overflow-x-auto rounded border">
          <table className="w-full min-w-[1120px] text-xs">
            <thead className="app-table-thead text-left">
              <tr>
                <th className="w-[9.5rem] min-w-[9.5rem] max-w-[9.5rem] px-1 py-2 align-top">
                  <div className="flex flex-col gap-2">
                    <label className="flex cursor-pointer items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="size-3.5 shrink-0 rounded border border-input"
                        checked={allChecked}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setRowChecked(rows.map(() => on));
                        }}
                      />
                      <span className="text-[11px] font-semibold leading-tight">Tanlash</span>
                    </label>
                    <p className="text-[10px] leading-snug text-muted-foreground">
                      Belgilangan qatorlarga qo‘llash. Hech biri belgilanmagan bo‘lsa — barcha qatorlarga.
                    </p>
                    <div className="border-t border-border/60 pt-1.5">
                      <p className="mb-0.5 text-[10px] font-medium text-muted-foreground">Kategoriya</p>
                      <FilterSelect
                        className="mb-1 h-7 w-full min-w-0 max-w-none rounded border border-input bg-background px-1 text-[11px]"
                        emptyLabel="Kategoriya"
                        aria-label="Kategoriya"
                        value={bulkCategoryId}
                        onChange={(e) => setBulkCategoryId(e.target.value)}
                      >
                        {cats.map((c) => (
                          <option key={c.id} value={String(c.id)}>
                            {c.name}
                            {c.code ? ` (${c.code})` : ""}
                          </option>
                        ))}
                      </FilterSelect>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7 w-full px-1 text-[11px]"
                        onClick={() => applyBulkCategory()}
                      >
                        Qatorlarga
                      </Button>
                    </div>
                    <div className="border-t border-border/60 pt-1.5">
                      <p className="mb-0.5 text-[10px] font-medium text-muted-foreground">Birlik</p>
                      <select
                        className="mb-1 h-7 w-full rounded border border-input bg-background px-1 text-[11px]"
                        value={bulkUnitSelect}
                        onChange={(e) => setBulkUnitSelect(e.target.value)}
                      >
                        {PRODUCT_UNIT_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      {bulkUnitSelect === PRODUCT_UNIT_CUSTOM ? (
                        <Input
                          className="mb-1 h-7 text-[11px]"
                          placeholder="Birlik"
                          value={bulkUnitCustom}
                          onChange={(e) => setBulkUnitCustom(e.target.value)}
                        />
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7 w-full px-1 text-[11px]"
                        onClick={() => applyBulkUnit()}
                      >
                        Qatorlarga
                      </Button>
                    </div>
                  </div>
                </th>
                <th className="px-1 py-2 align-bottom">
                  Kategoriya <span className="text-destructive">*</span>
                </th>
                <th className="min-w-[8rem] px-1 py-2 align-bottom">
                  Nomi <span className="text-destructive">*</span>
                </th>
                <th className="px-1 py-2 align-bottom">
                  Birlik <span className="text-destructive">*</span>
                </th>
                <th className="min-w-[11rem] whitespace-normal px-1 py-2 align-bottom font-medium leading-snug">
                  Uzunlik (D) × en (Ш) × qalinlik (Т){" "}
                  <span className="font-normal text-muted-foreground">(m)</span>
                </th>
                <th className="px-1 py-2 align-bottom">Blokdagi soni</th>
                <th className="px-1 py-2 align-bottom">Kod (SKU)</th>
                <th className="px-1 py-2 align-bottom">Shtrix-kod</th>
                <th className="px-1 py-2 align-bottom">TN VED</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-1 py-2 align-middle text-center">
                    <input
                      type="checkbox"
                      className="size-3.5 rounded border border-input"
                      checked={rowChecked[i] ?? false}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setRowChecked((prev) => {
                          const next = [...prev];
                          next[i] = on;
                          return next;
                        });
                      }}
                      aria-label={`${i + 1}-qatorni tanlash`}
                    />
                  </td>
                  <td className="px-1 py-2 align-middle">
                    <FilterSelect
                      className="h-8 w-full min-w-[6rem] max-w-[140px] rounded border border-input bg-background px-1 text-xs"
                      emptyLabel="Kategoriya"
                      aria-label="Kategoriya"
                      value={r.categoryId}
                      onChange={(e) => updateRow(i, { categoryId: e.target.value })}
                    >
                      {cats.map((c) => (
                        <option key={c.id} value={String(c.id)}>
                          {c.name}
                          {c.code ? ` (${c.code})` : ""}
                        </option>
                      ))}
                    </FilterSelect>
                  </td>
                  <td className="px-1 py-2 align-middle">
                    <Input
                      className="h-8 text-xs"
                      placeholder="Mahsulot nomi"
                      value={r.name}
                      onChange={(e) => updateRow(i, { name: e.target.value })}
                    />
                  </td>
                  <td className="px-1 py-2 align-middle">
                    <select
                      className="h-8 w-full max-w-[100px] rounded border bg-background px-1"
                      value={r.unitSelect}
                      onChange={(e) => updateRow(i, { unitSelect: e.target.value })}
                    >
                      {PRODUCT_UNIT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {r.unitSelect === PRODUCT_UNIT_CUSTOM ? (
                      <Input
                        className="mt-1 h-8 text-xs"
                        placeholder="Birlikni yozing"
                        value={r.unitCustom}
                        onChange={(e) => updateRow(i, { unitCustom: e.target.value })}
                      />
                    ) : null}
                  </td>
                  <td className="px-1 py-2 align-middle whitespace-nowrap">
                    <div className="inline-flex max-w-none flex-nowrap items-center gap-0.5">
                      <Input
                        id={`bulk-len-${i}`}
                        className="h-8 w-10 min-w-[2.25rem] shrink-0 px-1 text-center text-xs tabular-nums"
                        inputMode="decimal"
                        aria-label="Uzunlik (D), metr"
                        value={r.lenM}
                        onChange={(e) => updateRow(i, { lenM: e.target.value })}
                      />
                      <span className="shrink-0 select-none px-px text-muted-foreground" aria-hidden>
                        ×
                      </span>
                      <Input
                        id={`bulk-wid-${i}`}
                        className="h-8 w-10 min-w-[2.25rem] shrink-0 px-1 text-center text-xs tabular-nums"
                        inputMode="decimal"
                        aria-label="En (Ш), metr"
                        value={r.widM}
                        onChange={(e) => updateRow(i, { widM: e.target.value })}
                      />
                      <span className="shrink-0 select-none px-px text-muted-foreground" aria-hidden>
                        ×
                      </span>
                      <Input
                        id={`bulk-thk-${i}`}
                        className="h-8 w-10 min-w-[2.25rem] shrink-0 px-1 text-center text-xs tabular-nums"
                        inputMode="decimal"
                        aria-label="Qalinlik (Т), metr"
                        value={r.thkM}
                        onChange={(e) => updateRow(i, { thkM: e.target.value })}
                      />
                      <span className="shrink-0 pl-1 text-[10px] tabular-nums text-muted-foreground">
                        = {formatVolumeM3(r)} m³
                      </span>
                    </div>
                  </td>
                  <td className="px-1 py-2 align-middle">
                    <Input
                      className="h-8 w-14 px-1 text-xs"
                      inputMode="numeric"
                      placeholder="—"
                      value={r.qtyBlock}
                      onChange={(e) =>
                        updateRow(i, { qtyBlock: e.target.value.replace(/[^0-9]/g, "") })
                      }
                    />
                  </td>
                  <td className="px-1 py-2 align-middle">
                    <Input
                      className="h-8 w-20 px-1 text-xs"
                      maxLength={20}
                      placeholder="SKU"
                      value={r.code}
                      onChange={(e) => updateRow(i, { code: e.target.value })}
                    />
                  </td>
                  <td className="px-1 py-2 align-middle">
                    <Input
                      className="h-8 w-24 px-1 text-xs"
                      placeholder="—"
                      value={r.barcode}
                      onChange={(e) => updateRow(i, { barcode: e.target.value })}
                    />
                  </td>
                  <td className="px-1 py-2 align-middle">
                    <Input
                      className="h-8 w-20 px-1 text-xs"
                      placeholder="—"
                      value={r.hsCode}
                      onChange={(e) => updateRow(i, { hsCode: e.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setRows((p) => [...p, emptyRow()])}
        >
          + Yana qator
        </Button>
        {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
      </CardContent>
      <div className="flex flex-wrap justify-between gap-2 border-t border-border/60 px-4 py-3">
        <Link
          href={backHref}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          ← Ro‘yxatga qaytish
        </Link>
        <Button type="button" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {saveMut.isPending ? "…" : "Saqlash"}
        </Button>
      </div>
    </Card>
  );
}
