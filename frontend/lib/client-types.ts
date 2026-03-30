/** API `GET /api/:slug/clients` va `GET .../clients/:id` bilan mos */
export type ContactPersonSlot = {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
};

export type ClientRow = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  category: string | null;
  credit_limit: string;
  is_active: boolean;
  account_balance: string;
  responsible_person: string | null;
  landmark: string | null;
  inn: string | null;
  pdl: string | null;
  logistics_service: string | null;
  license_until: string | null;
  working_hours: string | null;
  region: string | null;
  district: string | null;
  neighborhood: string | null;
  street: string | null;
  house_number: string | null;
  apartment: string | null;
  gps_text: string | null;
  visit_date: string | null;
  notes: string | null;
  client_format: string | null;
  agent_id: number | null;
  agent_name: string | null;
  contact_persons: ContactPersonSlot[];
  created_at: string;

  // User requested columns (placeholders until fully wired in backend).
  legal_name?: string | null;
  pinfl?: string | null;
  trade_channel_code?: string | null;
  client_category_code?: string | null;
  client_type_code?: string | null;
  format_code?: string | null;
  city_code?: string | null;
  latitude?: string | null;
  longitude?: string | null;

  /** Kelajakdagi API: agent_1 … agent_10, agent_N_day, expeditor_N */
  [key: string]: unknown;
};