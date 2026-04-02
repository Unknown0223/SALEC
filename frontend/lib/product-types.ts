/** API mahsulot qatorlari bilan mos */
export type ProductPriceDto = {
  id: number;
  price_type: string;
  price: string;
  currency: string;
};

export type ProductRefMini = { id: number; name: string };

export type ProductRow = {
  id: number;
  sku: string;
  name: string;
  unit: string;
  barcode: string | null;
  is_active: boolean;
  category_id: number | null;
  product_group_id: number | null;
  brand_id: number | null;
  manufacturer_id: number | null;
  segment_id: number | null;
  weight_kg: string | null;
  volume_m3: string | null;
  qty_per_block: number | null;
  dimension_unit: string | null;
  width_cm: string | null;
  height_cm: string | null;
  length_cm: string | null;
  ikpu_code: string | null;
  hs_code: string | null;
  sell_code: string | null;
  comment: string | null;
  sort_order: number | null;
  is_blocked: boolean;
  created_at: string;
  category: ProductRefMini | null;
  product_group: ProductRefMini | null;
  brand: ProductRefMini | null;
  manufacturer: ProductRefMini | null;
  segment: ProductRefMini | null;
  prices?: ProductPriceDto[];
};

export type CatalogSimpleRow = {
  id: number;
  name: string;
  code: string | null;
  sort_order: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type InterchangeableGroupRow = {
  id: number;
  name: string;
  code: string | null;
  sort_order: number | null;
  comment: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  products: { id: number; sku: string; name: string }[];
  price_types: string[];
};
