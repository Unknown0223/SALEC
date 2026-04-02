"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import {
  PRODUCT_UNIT_CUSTOM,
  PRODUCT_UNIT_OPTIONS,
  resolveUnitFromForm
} from "@/lib/product-units";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

type CatRow = { id: number; name: string; code: string | null };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantSlug: string | null;
  onDone: () => void;
};

function parseDim(s: string): number | null {
  const t = s.replace(",", ".").trim();
  if (t === "") return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

export function ProductQuickAddDialog({ open, onOpenChange, tenantSlug, onDone }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"main" | "extra">("main");
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const [unitSelect, setUnitSelect] = useState("dona");
  const [unitCustom, setUnitCustom] = useState("");
  const [sku, setSku] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [qtyBlock, setQtyBlock] = useState("");
  const [dimUnit, setDimUnit] = useState<"m" | "cm">("m");
  const [w, setW] = useState("");
  const [h, setH] = useState("");
  const [l, setL] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [retailPrice, setRetailPrice] = useState("");
  const [barcode, setBarcode] = useState("");
  const [ikpu, setIkpu] = useState("");
  const [sellCode, setSellCode] = useState("");
  const [hsCode, setHsCode] = useState("");
  const [groupId, setGroupId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [comment, setComment] = useState("");
  const [isBlocked, setIsBlocked] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const catsQ = useQuery({
    queryKey: ["product-categories", tenantSlug, "quick-add"],
    enabled: Boolean(tenantSlug) && open,
    queryFn: async () => {
      const { data } = await api.get<{ data: CatRow[] }>(`/api/${tenantSlug}/product-categories`);
      return data.data;
    }
  });

  const catalogOpts = (path: string) => ({
    queryKey: ["catalog-opts", path, tenantSlug, "quick"],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", limit: "500", is_active: "true" });
      const { data } = await api.get<{ data: { id: number; name: string }[] }>(
        `/api/${tenantSlug}/${path}?${params}`
      );
      return data.data;
    },
    enabled: Boolean(tenantSlug) && open
  });

  const { data: groups = [] } = useQuery(catalogOpts("catalog/product-groups"));
  const { data: brands = [] } = useQuery(catalogOpts("catalog/brands"));
  const { data: segments = [] } = useQuery(catalogOpts("catalog/segments"));

  const volumeLabel = useMemo(() => {
    const L = parseDim(l);
    const W = parseDim(w);
    const H = parseDim(h);
    if (L == null || W == null || H == null || L <= 0 || W <= 0 || H <= 0) return "0 m³";
    if (dimUnit === "m") {
      return `${(L * W * H).toFixed(6)} m³`;
    }
    return `${((L * W * H) / 1_000_000).toFixed(6)} m³`;
  }, [l, w, h, dimUnit]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!tenantSlug) throw new Error("no");
      const cid = Number.parseInt(categoryId, 10);
      if (!Number.isFinite(cid) || cid < 1) throw new Error("Категория * tanlang");
      const nm = name.trim();
      if (!nm) throw new Error("Название * kiriting");
      const unit = resolveUnitFromForm(unitSelect, unitCustom);
      if (unitSelect === PRODUCT_UNIT_CUSTOM && !unitCustom.trim()) {
        throw new Error("Единица измерения *");
      }
      let finalSku = sku.trim();
      if (!finalSku) finalSku = `NEW-${Date.now().toString(36)}`;

      const L = parseDim(l);
      const Wd = parseDim(w);
      const Ht = parseDim(h);
      let length_cm: string | null = null;
      let width_cm: string | null = null;
      let height_cm: string | null = null;
      let volume_m3: string | null = null;
      if (L != null && Wd != null && Ht != null && L > 0 && Wd > 0 && Ht > 0) {
        if (dimUnit === "m") {
          length_cm = String(L * 100);
          width_cm = String(Wd * 100);
          height_cm = String(Ht * 100);
          volume_m3 = String(L * Wd * Ht);
        } else {
          length_cm = String(L);
          width_cm = String(Wd);
          height_cm = String(Ht);
          volume_m3 = String((L * Wd * Ht) / 1_000_000);
        }
      }

      const payload: Record<string, unknown> = {
        sku: finalSku,
        name: nm,
        unit: unit || "dona",
        category_id: cid,
        is_active: isActive,
        barcode: barcode.trim() || null,
        ikpu_code: ikpu.trim() || null,
        sell_code: sellCode.trim() || null,
        hs_code: hsCode.trim().slice(0, 32) || null,
        product_group_id: groupId ? Number.parseInt(groupId, 10) : null,
        brand_id: brandId ? Number.parseInt(brandId, 10) : null,
        segment_id: segmentId ? Number.parseInt(segmentId, 10) : null,
        weight_kg: weightKg.trim() === "" ? null : weightKg.trim(),
        qty_per_block: (() => {
          if (qtyBlock.trim() === "") return null;
          const n = Number.parseInt(qtyBlock.replace(/[^0-9]/g, ""), 10);
          return Number.isFinite(n) ? n : null;
        })(),
        dimension_unit: dimUnit,
        width_cm,
        height_cm,
        length_cm,
        volume_m3,
        sort_order:
          sortOrder.trim() === ""
            ? null
            : (() => {
                const n = Number.parseInt(sortOrder, 10);
                return Number.isFinite(n) ? n : null;
              })(),
        comment: comment.trim() || null,
        is_blocked: isBlocked
      };

      const { data: created } = await api.post<{ id: number }>(
        `/api/${tenantSlug}/products`,
        payload
      );
      const id = created.id;

      if (retailPrice.trim() !== "") {
        const r = Number.parseFloat(retailPrice.replace(",", ".").replace(/\s/g, ""));
        if (Number.isFinite(r) && r >= 0) {
          await api.put(`/api/${tenantSlug}/products/${id}/prices`, {
            items: [{ price_type: "retail", price: r }]
          });
        }
      }
    },
    onSuccess: async () => {
      setMsg(null);
      void qc.invalidateQueries({ queryKey: ["products", tenantSlug] });
      onDone();
      onOpenChange(false);
      setCategoryId("");
      setName("");
      setSku("");
      setUnitSelect("dona");
      setUnitCustom("");
      setWeightKg("");
      setQtyBlock("");
      setW("");
      setH("");
      setL("");
      setRetailPrice("");
      setBarcode("");
      setIkpu("");
      setSellCode("");
      setHsCode("");
      setGroupId("");
      setBrandId("");
      setSegmentId("");
      setSortOrder("");
      setComment("");
      setIsBlocked(false);
      setTab("main");
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Xato")
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]" showCloseButton>
        <DialogHeader>
          <DialogTitle>Добавить</DialogTitle>
          <DialogDescription>
            <span className="text-destructive">*</span> — majburiy maydonlar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b border-border pb-2">
          <button
            type="button"
            className={cn(
              "rounded-md px-3 py-1 text-sm",
              tab === "main" ? "bg-muted font-medium" : "text-muted-foreground"
            )}
            onClick={() => setTab("main")}
          >
            Главные данные
          </button>
          <button
            type="button"
            className={cn(
              "rounded-md px-3 py-1 text-sm",
              tab === "extra" ? "bg-muted font-medium" : "text-muted-foreground"
            )}
            onClick={() => setTab("extra")}
          >
            Дополнительные данные
          </button>
        </div>

        {tab === "main" ? (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>
                Категория <span className="text-destructive">*</span>
              </Label>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">— tanlang —</option>
                {(catsQ.data ?? []).map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                    {c.code ? ` (${c.code})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label>
                Название <span className="text-destructive">*</span>
              </Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>
                Единицы измерения <span className="text-destructive">*</span>
              </Label>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={unitSelect}
                onChange={(e) => setUnitSelect(e.target.value)}
              >
                {PRODUCT_UNIT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {unitSelect === PRODUCT_UNIT_CUSTOM ? (
                <Input
                  placeholder="бирлик номи"
                  value={unitCustom}
                  onChange={(e) => setUnitCustom(e.target.value)}
                />
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <Label>Код (SKU, 20 gacha)</Label>
              <Input value={sku} maxLength={24} onChange={(e) => setSku(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label>Вес (кг)</Label>
                <Input value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Количество в блоке</Label>
                <Input
                  value={qtyBlock}
                  onChange={(e) => setQtyBlock(e.target.value.replace(/[^0-9]/g, ""))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Габариты</Label>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={dimUnit === "m"}
                    onChange={() => setDimUnit("m")}
                  />
                  В метре
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={dimUnit === "cm"}
                    onChange={() => setDimUnit("cm")}
                  />
                  В сантиметре
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder={`Ширина (${dimUnit})`} value={w} onChange={(e) => setW(e.target.value)} />
                <Input placeholder={`Высота (${dimUnit})`} value={h} onChange={(e) => setH(e.target.value)} />
                <Input placeholder={`Длина (${dimUnit})`} value={l} onChange={(e) => setL(e.target.value)} />
              </div>
              <p className="text-sm text-muted-foreground">Объем: {volumeLabel}</p>
            </div>
            <div className="grid gap-1.5">
              <Label>Chakana narx (retail, ixtiyoriy)</Label>
              <Input value={retailPrice} onChange={(e) => setRetailPrice(e.target.value)} />
            </div>
            <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>Активный</span>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            </label>
            <Button type="button" variant="outline" size="sm" className="w-fit" disabled>
              Загрузить фото (keyinroq)
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Штрих-код</Label>
              <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>ИКПУ</Label>
              <Input value={ikpu} onChange={(e) => setIkpu(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Sell code</Label>
              <Input value={sellCode} onChange={(e) => setSellCode(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>ТН ВЭД</Label>
              <Input value={hsCode} onChange={(e) => setHsCode(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label>Группа товаров</Label>
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                >
                  <option value="">—</option>
                  {groups.map((x) => (
                    <option key={x.id} value={String(x.id)}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label>Бренд</Label>
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={brandId}
                  onChange={(e) => setBrandId(e.target.value)}
                >
                  <option value="">—</option>
                  {brands.map((x) => (
                    <option key={x.id} value={String(x.id)}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label>Сегмент</Label>
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={segmentId}
                  onChange={(e) => setSegmentId(e.target.value)}
                >
                  <option value="">—</option>
                  {segments.map((x) => (
                    <option key={x.id} value={String(x.id)}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Сортировка</Label>
              <Input
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value.replace(/[^0-9-]/g, ""))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Комментарий</Label>
              <textarea
                className="min-h-[64px] rounded-md border bg-background px-2 py-1 text-sm"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isBlocked} onChange={(e) => setIsBlocked(e.target.checked)} />
              Блок (is_blocked)
            </label>
          </div>
        )}

        {msg ? <p className="text-sm text-destructive">{msg}</p> : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Bekor
          </Button>
          <Button type="button" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? "…" : "Добавить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
