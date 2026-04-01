/** API mahsulot qatorlari bilan mos */
export type ProductPriceDto = {
  id: number;
  price_type: string;
  price: string;
  currency: string;
};

export type ProductRow = {
  id: number;
  sku: string;
  name: string;
  unit: string;
  barcode: string | null;
  is_active: boolean;
  category_id: number | null;
  prices?: ProductPriceDto[];
};
