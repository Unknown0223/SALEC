"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/dashboard/page-header";
import { api } from "@/lib/api";
import type { ProductRow } from "@/lib/product-types";
import {
  PRODUCT_UNIT_CUSTOM,
  PRODUCT_UNIT_OPTIONS,
  resolveUnitFromForm,
  splitUnitForForm
} from "@/lib/product-units";
import { FilterSelect } from "@/components/ui/filter-select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

type Props = {
  tenantSlug: string | null;
  mode: "create" | "edit";
  productId: number | null;
  /** Yangi mahsulot: URL dan kategoriya */
  initialCategoryId?: string;
  onSuccess: () => void;
  onCancel: () => void;
};

export function ProductForm({ tenantSlug, mode, productId, initialCategoryId, onSuccess, onCancel }: Props) {
  const qc = useQueryClient();
  const isEdit = mode === "edit" && productId != null && productId > 0;
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [unitSelect, setUnitSelect] = useState("dona");
  const [unitCustom, setUnitCustom] = useState("");
  const [barcode, setBarcode] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [retailPrice, setRetailPrice] = useState("");
  const [wholesalePrice, setWholesalePrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [productGroupId, setProductGroupId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [manufacturerId, setManufacturerId] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [volumeM3, setVolumeM3] = useState("");
  const [qtyPerBlock, setQtyPerBlock] = useState("");
  const [dimensionUnit, setDimensionUnit] = useState<"cm" | "m">("cm");
  const [widthCm, setWidthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [lengthCm, setLengthCm] = useState("");
  const [ikpuCode, setIkpuCode] = useState("");
  const [hsCode, setHsCode] = useState("");
  const [sellCode, setSellCode] = useState("");
  const [comment, setComment] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [isBlocked, setIsBlocked] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const productQ = useQuery({
    queryKey: ["product-detail-form", tenantSlug, productId],
    enabled: Boolean(tenantSlug) && isEdit,
    queryFn: async () => {
      const { data } = await api.get<ProductRow>(
        `/api/${tenantSlug}/products/${productId}?include_prices=true`
      );
      return data;
    }
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["product-categories", tenantSlug],
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; name: string }[] }>(
        `/api/${tenantSlug}/product-categories`
      );
      return data.data;
    },
    enabled: Boolean(tenantSlug)
  });

  const catalogOpts = (path: string) => ({
    queryKey: ["catalog-opts", path, tenantSlug],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", limit: "500", is_active: "true" });
      const { data } = await api.get<{ data: { id: number; name: string }[] }>(
        `/api/${tenantSlug}/${path}?${params}`
      );
      return data.data;
    },
    enabled: Boolean(tenantSlug)
  });

  const { data: productGroups = [] } = useQuery(catalogOpts("catalog/product-groups"));
  const { data: brands = [] } = useQuery(catalogOpts("catalog/brands"));
  const { data: manufacturers = [] } = useQuery(catalogOpts("catalog/manufacturers"));
  const { data: segments = [] } = useQuery(catalogOpts("catalog/segments"));

  useEffect(() => {
    if (isEdit) {
      const product = productQ.data;
      if (!product) return;
      setLocalError(null);
      setSku(product.sku);
      setName(product.name);
      setCategoryId(product.category_id != null ? String(product.category_id) : "");
      const { select, custom } = splitUnitForForm(product.unit);
      setUnitSelect(select);
      setUnitCustom(custom);
      setBarcode(product.barcode ?? "");
      setIsActive(product.is_active);
      const r = product.prices?.find((x) => x.price_type === "retail");
      const w = product.prices?.find((x) => x.price_type === "wholesale");
      setRetailPrice(r?.price ?? "");
      setWholesalePrice(w?.price ?? "");
      setProductGroupId(product.product_group_id != null ? String(product.product_group_id) : "");
      setBrandId(product.brand_id != null ? String(product.brand_id) : "");
      setManufacturerId(product.manufacturer_id != null ? String(product.manufacturer_id) : "");
      setSegmentId(product.segment_id != null ? String(product.segment_id) : "");
      setWeightKg(product.weight_kg ?? "");
      setVolumeM3(product.volume_m3 ?? "");
      setQtyPerBlock(product.qty_per_block != null ? String(product.qty_per_block) : "");
      setDimensionUnit(product.dimension_unit === "m" ? "m" : "cm");
      setWidthCm(product.width_cm ?? "");
      setHeightCm(product.height_cm ?? "");
      setLengthCm(product.length_cm ?? "");
      setIkpuCode(product.ikpu_code ?? "");
      setHsCode(product.hs_code ?? "");
      setSellCode(product.sell_code ?? "");
      setComment(product.comment ?? "");
      setSortOrder(product.sort_order != null ? String(product.sort_order) : "");
      setIsBlocked(Boolean(product.is_blocked));
      return;
    }
    setLocalError(null);
    setSku("");
    setName("");
    setUnitSelect("dona");
    setUnitCustom("");
    setBarcode("");
    setIsActive(true);
    setRetailPrice("");
    setWholesalePrice("");
    setCategoryId(initialCategoryId && /^\d+$/.test(initialCategoryId) ? initialCategoryId : "");
    setProductGroupId("");
    setBrandId("");
    setManufacturerId("");
    setSegmentId("");
    setWeightKg("");
    setVolumeM3("");
    setQtyPerBlock("");
    setDimensionUnit("cm");
    setWidthCm("");
    setHeightCm("");
    setLengthCm("");
    setIkpuCode("");
    setHsCode("");
    setSellCode("");
    setComment("");
    setSortOrder("");
    setIsBlocked(false);
  }, [isEdit, productQ.data, initialCategoryId]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!tenantSlug) throw new Error("Tenant yo‘q");
      const unitResolved = resolveUnitFromForm(unitSelect, unitCustom);
      if (unitSelect === PRODUCT_UNIT_CUSTOM && !unitCustom.trim()) {
        throw new Error("Boshqa birlik tanlangan — nomini yozing");
      }
      let resolvedCategory: number | null = null;
      if (categoryId.trim() !== "") {
        const cid = Number.parseInt(categoryId.trim(), 10);
        if (!Number.isFinite(cid) || cid < 1) throw new Error("Kategoriya noto‘g‘ri");
        resolvedCategory = cid;
      }
      if (!isEdit && resolvedCategory === null) {
        throw new Error("Kategoriya tanlash majburiy (*)");
      }

      const fkIdOrNull = (v: string) => {
        const t = v.trim();
        if (t === "") return null;
        const n = Number.parseInt(t, 10);
        if (!Number.isFinite(n) || n < 1) throw new Error("Tanlov noto‘g‘ri");
        return n;
      };
      const intOrNull = (v: string) => {
        const t = v.trim();
        if (t === "") return null;
        const n = Number.parseInt(t, 10);
        if (!Number.isFinite(n)) throw new Error("Butun son noto‘g‘ri");
        return n;
      };

      const payload: Record<string, unknown> = {
        sku: sku.trim(),
        name: name.trim(),
        unit: unitResolved || "dona",
        barcode: barcode.trim() || null,
        is_active: isActive,
        category_id: resolvedCategory,
        product_group_id: productGroupId.trim() === "" ? null : fkIdOrNull(productGroupId),
        brand_id: brandId.trim() === "" ? null : fkIdOrNull(brandId),
        manufacturer_id: manufacturerId.trim() === "" ? null : fkIdOrNull(manufacturerId),
        segment_id: segmentId.trim() === "" ? null : fkIdOrNull(segmentId),
        weight_kg: weightKg.trim() === "" ? null : weightKg.trim(),
        volume_m3: volumeM3.trim() === "" ? null : volumeM3.trim(),
        qty_per_block: qtyPerBlock.trim() === "" ? null : intOrNull(qtyPerBlock),
        dimension_unit: dimensionUnit,
        width_cm: widthCm.trim() === "" ? null : widthCm.trim(),
        height_cm: heightCm.trim() === "" ? null : heightCm.trim(),
        length_cm: lengthCm.trim() === "" ? null : lengthCm.trim(),
        ikpu_code: ikpuCode.trim() || null,
        hs_code: hsCode.trim() || null,
        sell_code: sellCode.trim() || null,
        comment: comment.trim() || null,
        sort_order: sortOrder.trim() === "" ? null : intOrNull(sortOrder),
        is_blocked: isBlocked
      };
      if (!payload.sku || !payload.name) {
        throw new Error("SKU va nom majburiy");
      }

      let resolvedProductId: number;
      if (isEdit && productId != null) {
        const { data } = await api.put(`/api/${tenantSlug}/products/${productId}`, payload);
        resolvedProductId = (data as { id: number }).id;
      } else {
        const { data } = await api.post(`/api/${tenantSlug}/products`, payload);
        resolvedProductId = (data as { id: number }).id;
      }

      const items: { price_type: string; price: number }[] = [];
      if (retailPrice.trim() !== "") {
        const r = Number.parseFloat(retailPrice.replace(",", ".").replace(/\s/g, ""));
        if (!Number.isFinite(r) || r < 0) throw new Error("Chakana narx noto‘g‘ri");
        items.push({ price_type: "retail", price: r });
      }
      if (wholesalePrice.trim() !== "") {
        const w = Number.parseFloat(wholesalePrice.replace(",", ".").replace(/\s/g, ""));
        if (!Number.isFinite(w) || w < 0) throw new Error("Ulgurji narx noto‘g‘ri");
        items.push({ price_type: "wholesale", price: w });
      }

      await api.put(`/api/${tenantSlug}/products/${resolvedProductId}/prices`, { items });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["products", tenantSlug] });
      if (productId != null) {
        await qc.invalidateQueries({ queryKey: ["product-detail-form", tenantSlug, productId] });
      }
      onSuccess();
    },
    onError: (e: unknown) => {
      const ax = e as { response?: { data?: { error?: string }; status?: number } };
      if (ax.response?.status === 403) {
        setLocalError("Ruxsat yo‘q (faqat admin yoki operator).");
        return;
      }
      if (ax.response?.data?.error === "SkuExists") {
        setLocalError("Bu SKU allaqachon mavjud.");
        return;
      }
      if (ax.response?.status === 401) {
        setLocalError("Sessiya yo‘q yoki muddati tugagan — /login sahifasidan qayta kiring.");
        return;
      }
      setLocalError(e instanceof Error ? e.message : "Saqlashda xato");
    }
  });

  if (isEdit && productQ.isLoading) {
    return <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>;
  }

  if (isEdit && productQ.isError) {
    return (
      <div className="space-y-3">
        <PageHeader title="Mahsulot" description="Topilmadi yoki xato" />
        <Button type="button" variant="outline" onClick={onCancel}>
          Orqaga
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 pb-10">
      <PageHeader
        title={isEdit ? "Mahsulotni tahrirlash" : "Yangi mahsulot"}
        description="To‘liq sahifada saqlash"
        actions={
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Orqaga
          </Button>
        }
      />

      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="pf-sku">SKU</Label>
          <Input
            id="pf-sku"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            disabled={mutation.isPending}
            autoComplete="off"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pf-name">
            Nomi <span className="text-destructive">*</span>
          </Label>
          <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} disabled={mutation.isPending} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pf-category">
            Kategoriya <span className="text-destructive">*</span>
          </Label>
          <FilterSelect
            id="pf-category"
            className="flex h-9 w-full min-w-0 max-w-none rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            emptyLabel="Kategoriya"
            aria-label="Kategoriya"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={mutation.isPending}
          >
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </FilterSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pf-unit">
            Birlik <span className="text-destructive">*</span>
          </Label>
          <select
            id="pf-unit"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            value={unitSelect}
            onChange={(e) => setUnitSelect(e.target.value)}
            disabled={mutation.isPending}
          >
            {PRODUCT_UNIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {unitSelect === PRODUCT_UNIT_CUSTOM ? (
            <Input
              id="pf-unit-custom"
              placeholder="Masalan: blok-paket"
              value={unitCustom}
              onChange={(e) => setUnitCustom(e.target.value)}
              disabled={mutation.isPending}
              autoComplete="off"
            />
          ) : null}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pf-barcode">Shtrix-kod (ixtiyoriy)</Label>
          <Input
            id="pf-barcode"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            disabled={mutation.isPending}
          />
        </div>

        <button
          type="button"
          className="text-left text-sm font-medium text-primary underline-offset-4 hover:underline"
          onClick={() => setExtraOpen((v) => !v)}
        >
          {extraOpen ? "▼" : "▶"} Qo‘shimcha (группа, бренд, ИКПУ, габариты…)
        </button>

        {extraOpen ? (
          <div className="grid gap-3 rounded-md border border-border bg-muted/20 p-3">
            <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3">
              <div className="grid gap-1.5">
                <Label>Группа товаров</Label>
                <FilterSelect
                  className="flex h-9 w-full min-w-0 max-w-none rounded-md border border-input bg-background px-2 text-sm"
                  emptyLabel="Группа товаров"
                  aria-label="Группа товаров"
                  value={productGroupId}
                  onChange={(e) => setProductGroupId(e.target.value)}
                  disabled={mutation.isPending}
                >
                  {productGroups.map((x) => (
                    <option key={x.id} value={String(x.id)}>
                      {x.name}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="grid gap-1.5">
                <Label>Бренд</Label>
                <FilterSelect
                  className="flex h-9 w-full min-w-0 max-w-none rounded-md border border-input bg-background px-2 text-sm"
                  emptyLabel="Бренд"
                  aria-label="Бренд"
                  value={brandId}
                  onChange={(e) => setBrandId(e.target.value)}
                  disabled={mutation.isPending}
                >
                  {brands.map((x) => (
                    <option key={x.id} value={String(x.id)}>
                      {x.name}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="grid gap-1.5">
                <Label>Производитель</Label>
                <FilterSelect
                  className="flex h-9 w-full min-w-0 max-w-none rounded-md border border-input bg-background px-2 text-sm"
                  emptyLabel="Производитель"
                  aria-label="Производитель"
                  value={manufacturerId}
                  onChange={(e) => setManufacturerId(e.target.value)}
                  disabled={mutation.isPending}
                >
                  {manufacturers.map((x) => (
                    <option key={x.id} value={String(x.id)}>
                      {x.name}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="grid gap-1.5">
                <Label>Сегмент</Label>
                <FilterSelect
                  className="flex h-9 w-full min-w-0 max-w-none rounded-md border border-input bg-background px-2 text-sm"
                  emptyLabel="Сегмент"
                  aria-label="Сегмент"
                  value={segmentId}
                  onChange={(e) => setSegmentId(e.target.value)}
                  disabled={mutation.isPending}
                >
                  {segments.map((x) => (
                    <option key={x.id} value={String(x.id)}>
                      {x.name}
                    </option>
                  ))}
                </FilterSelect>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label>Вес (kg)</Label>
                <Input value={weightKg} onChange={(e) => setWeightKg(e.target.value)} disabled={mutation.isPending} />
              </div>
              <div className="grid gap-1.5">
                <Label>Объём (m³)</Label>
                <Input value={volumeM3} onChange={(e) => setVolumeM3(e.target.value)} disabled={mutation.isPending} />
              </div>
              <div className="grid gap-1.5">
                <Label>Кол-во в блоке</Label>
                <Input
                  value={qtyPerBlock}
                  onChange={(e) => setQtyPerBlock(e.target.value.replace(/[^0-9]/g, ""))}
                  disabled={mutation.isPending}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Габариты</Label>
              <div className="flex flex-wrap gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="dimu"
                    checked={dimensionUnit === "cm"}
                    onChange={() => setDimensionUnit("cm")}
                  />
                  см
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="dimu"
                    checked={dimensionUnit === "m"}
                    onChange={() => setDimensionUnit("m")}
                  />
                  м
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="Ширина" value={widthCm} onChange={(e) => setWidthCm(e.target.value)} />
                <Input placeholder="Высота" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
                <Input placeholder="Длина" value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>ИКПУ</Label>
                <Input value={ikpuCode} onChange={(e) => setIkpuCode(e.target.value)} disabled={mutation.isPending} />
              </div>
              <div className="grid gap-1.5">
                <Label>ТН ВЭД</Label>
                <Input value={hsCode} onChange={(e) => setHsCode(e.target.value)} disabled={mutation.isPending} />
              </div>
              <div className="grid gap-1.5">
                <Label>Sell code</Label>
                <Input value={sellCode} onChange={(e) => setSellCode(e.target.value)} disabled={mutation.isPending} />
              </div>
              <div className="grid gap-1.5">
                <Label>Сортировка</Label>
                <Input
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value.replace(/[^0-9-]/g, ""))}
                  disabled={mutation.isPending}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Комментарий</Label>
              <textarea
                className="min-h-[64px] rounded-md border bg-background px-2 py-1 text-sm"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                disabled={mutation.isPending}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isBlocked}
                onChange={(e) => setIsBlocked(e.target.checked)}
                disabled={mutation.isPending}
              />
              Блок / ограничение (is_blocked)
            </label>
          </div>
        ) : null}

        <div className="grid gap-2 rounded-md border border-border bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground">Narxlar (UZS, `retail` / `wholesale`)</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pf-retail">Chakana (retail)</Label>
              <Input
                id="pf-retail"
                type="text"
                inputMode="decimal"
                placeholder="masalan 25000"
                value={retailPrice}
                onChange={(e) => setRetailPrice(e.target.value)}
                disabled={mutation.isPending}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pf-wholesale">Ulgurji (wholesale)</Label>
              <Input
                id="pf-wholesale"
                type="text"
                inputMode="decimal"
                placeholder="ixtiyoriy"
                value={wholesalePrice}
                onChange={(e) => setWholesalePrice(e.target.value)}
                disabled={mutation.isPending}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Bo‘sh qoldirsangiz tegishli turdagi narx o‘chiriladi (sinxronlash).
          </p>
        </div>
        {isEdit ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={mutation.isPending}
            />
            Faol
          </label>
        ) : null}
        {localError ? <p className="text-sm text-destructive">{localError}</p> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={mutation.isPending}>
          Bekor
        </Button>
        <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? "Saqlanmoqda…" : "Saqlash"}
        </Button>
      </div>
    </div>
  );
}
