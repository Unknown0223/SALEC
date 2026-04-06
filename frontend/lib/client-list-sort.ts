import type { ClientColumnId } from "@/lib/client-table-columns";

/** Backend `GET /clients?sort=` bilan mos maydonlar */
export type ClientSortField =
  | "name"
  | "phone"
  | "id"
  | "created_at"
  | "region"
  | "legal_name"
  | "address"
  | "responsible_person"
  | "landmark"
  | "inn"
  | "client_pinfl"
  | "sales_channel"
  | "category"
  | "client_type_code"
  | "client_format"
  | "district"
  | "neighborhood"
  | "zone"
  | "city"
  | "client_code"
  | "latitude"
  | "longitude";

export const CLIENT_SORT_FIELD_LABELS: Record<ClientSortField, string> = {
  name: "Nomi",
  phone: "Telefon",
  id: "ID (raqam)",
  created_at: "Yaratilgan",
  region: "Viloyat",
  legal_name: "Yuridik nom",
  address: "Manzil",
  responsible_person: "Mas’ul / kontakt",
  landmark: "Orientir",
  inn: "INN",
  client_pinfl: "ПИНФЛ",
  sales_channel: "Savdo kanali",
  category: "Kategoriya",
  client_type_code: "Mijoz turi",
  client_format: "Format",
  district: "Tuman",
  neighborhood: "Mahalla",
  zone: "Zona",
  city: "Shahar",
  client_code: "Kod (Ид клиента)",
  latitude: "Широта",
  longitude: "Долгота"
};

/** Jadval ustuni → API tartib kaliti */
export const CLIENT_COLUMN_TO_SORT: Partial<Record<ClientColumnId, ClientSortField>> = {
  client_ref: "client_code",
  name: "name",
  legal_name: "legal_name",
  address: "address",
  phone: "phone",
  contact_person: "responsible_person",
  landmark: "landmark",
  inn: "inn",
  pinfl: "client_pinfl",
  trade_channel_code: "sales_channel",
  client_category_code: "category",
  client_type_code: "client_type_code",
  format_code: "client_format",
  client_region: "region",
  client_district: "district",
  client_zone: "zone",
  city_code: "city",
  latitude: "latitude",
  longitude: "longitude"
};

export function isClientSortField(v: string): v is ClientSortField {
  return Object.prototype.hasOwnProperty.call(CLIENT_SORT_FIELD_LABELS, v);
}
