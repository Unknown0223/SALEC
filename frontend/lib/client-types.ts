/** API `GET /api/:slug/clients` va `GET .../clients/:id` bilan mos */
export type ContactPersonSlot = {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
};

export type ClientAgentAssignmentRow = {
  slot: number;
  agent_id: number | null;
  agent_name: string | null;
  /** Kod agenta (`User.code`), masalan GGTR006 */
  agent_code?: string | null;
  visit_date: string | null;
  expeditor_phone: string | null;
  /** 1=Du … 7=Ya */
  visit_weekdays: number[];
  expeditor_user_id: number | null;
  expeditor_name: string | null;
};

export type ClientRow = {
  id: number;
  name: string;
  legal_name: string | null;
  phone: string | null;
  address: string | null;
  category: string | null;
  client_type_code: string | null;
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
  city: string | null;
  neighborhood: string | null;
  street: string | null;
  house_number: string | null;
  apartment: string | null;
  gps_text: string | null;
  visit_date: string | null;
  notes: string | null;
  client_format: string | null;
  client_code: string | null;
  sales_channel: string | null;
  product_category_ref: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_mfo: string | null;
  client_pinfl: string | null;
  oked: string | null;
  contract_number: string | null;
  vat_reg_code: string | null;
  latitude: string | null;
  longitude: string | null;
  zone: string | null;
  agent_id: number | null;
  agent_name: string | null;
  agent_assignments: ClientAgentAssignmentRow[];
  contact_persons: ContactPersonSlot[];
  created_at: string;
};
