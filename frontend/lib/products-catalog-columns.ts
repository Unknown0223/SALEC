import type { ProductRow } from "@/lib/product-types";

/** Mahsulotlar katalogi «Товар» tabi */
export const PRODUCT_ITEMS_TABLE_ID = "catalog.products.items.v1";

export const PRODUCT_ITEMS_COLUMN_IDS = [
  "name",
  "category",
  "product_group",
  "unit",
  "qty_per_block",
  "sort_order",
  "brand",
  "segment",
  "sku",
  "ikpu_code",
  "hs_code",
  "price"
] as const;

const LABELS: Record<(typeof PRODUCT_ITEMS_COLUMN_IDS)[number], string> = {
  name: "Название",
  category: "Категория",
  product_group: "Группа",
  unit: "Ед.",
  qty_per_block: "В блоке",
  sort_order: "Сорт.",
  brand: "Бренд",
  segment: "Сегмент",
  sku: "Код",
  ikpu_code: "ИКПУ",
  hs_code: "ТН ВЭД",
  price: "Цена"
};

export const PRODUCT_ITEMS_COLUMNS = PRODUCT_ITEMS_COLUMN_IDS.map((id) => ({
  id,
  label: LABELS[id]
}));

function retailPriceText(row: ProductRow): string {
  const p = row.prices?.find((x) => x.price_type === "retail");
  return p != null ? p.price : "";
}

export function productItemsExportCell(row: ProductRow, colId: string): string {
  switch (colId) {
    case "name":
      return row.name;
    case "category":
      return row.category?.name ?? "";
    case "product_group":
      return row.product_group?.name ?? "";
    case "unit":
      return row.unit;
    case "qty_per_block":
      return row.qty_per_block != null ? String(row.qty_per_block) : "";
    case "sort_order":
      return row.sort_order != null ? String(row.sort_order) : "";
    case "brand":
      return row.brand?.name ?? "";
    case "segment":
      return row.segment?.name ?? "";
    case "sku":
      return row.sku;
    case "ikpu_code":
      return row.ikpu_code ?? "";
    case "hs_code":
      return row.hs_code ?? "";
    case "price":
      return retailPriceText(row);
    default:
      return "";
  }
}
