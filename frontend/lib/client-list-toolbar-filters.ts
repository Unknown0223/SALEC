/** Klientlar ro‘yxati filtrlari — `GET /clients` query bilan mos (draft / applied). */

import type { ClientSortField } from "@/lib/client-list-sort";

export type ClientToolbarFiltersState = {
  activeFilter: "all" | "true" | "false";
  categoryFilter: string;
  regionFilter: string;
  cityFilter: string;
  districtFilter: string;
  neighborhoodFilter: string;
  zoneFilter: string;
  clientTypeFilter: string;
  clientFormatFilter: string;
  salesChannelFilter: string;
  agentFilter: string;
  expeditorFilter: string;
  supervisorFilter: string;
  /** "" yoki 1..7 */
  visitWeekdayFilter: string;
  innFilter: string;
  phoneFilter: string;
  pinflFilter: string;
  /** "" | "yes" | "no" → has_active_equipment */
  hasInventoryFilter: "" | "yes" | "no";
  equipmentKindFilter: string;
  creditAllowedFilter: "" | "yes" | "no";
  consignmentFilter: "" | "yes" | "no";
  consignmentLimitedFilter: "" | "yes" | "no";
  /** YYYY-MM-DD */
  createdFrom: string;
  createdTo: string;
};

export const INITIAL_CLIENT_TOOLBAR_FILTERS: ClientToolbarFiltersState = {
  activeFilter: "all",
  categoryFilter: "",
  regionFilter: "",
  cityFilter: "",
  districtFilter: "",
  neighborhoodFilter: "",
  zoneFilter: "",
  clientTypeFilter: "",
  clientFormatFilter: "",
  salesChannelFilter: "",
  agentFilter: "",
  expeditorFilter: "",
  supervisorFilter: "",
  visitWeekdayFilter: "",
  innFilter: "",
  phoneFilter: "",
  pinflFilter: "",
  hasInventoryFilter: "",
  equipmentKindFilter: "",
  creditAllowedFilter: "",
  consignmentFilter: "",
  consignmentLimitedFilter: "",
  createdFrom: "",
  createdTo: ""
};

export type ClientListFilterBundle = ClientToolbarFiltersState & {
  search: string;
  sortField: ClientSortField;
  sortOrder: "asc" | "desc";
};

export function appendClientListFilterParams(params: URLSearchParams, p: ClientListFilterBundle): void {
  if (p.search.trim()) params.set("search", p.search.trim());
  if (p.activeFilter !== "all") params.set("is_active", p.activeFilter);
  if (p.categoryFilter.trim()) params.set("category", p.categoryFilter.trim());
  if (p.regionFilter.trim()) params.set("region", p.regionFilter.trim());
  if (p.cityFilter.trim()) params.set("city", p.cityFilter.trim());
  if (p.districtFilter.trim()) params.set("district", p.districtFilter.trim());
  if (p.neighborhoodFilter.trim()) params.set("neighborhood", p.neighborhoodFilter.trim());
  if (p.zoneFilter.trim()) params.set("zone", p.zoneFilter.trim());
  if (p.clientTypeFilter.trim()) params.set("client_type_code", p.clientTypeFilter.trim());
  if (p.clientFormatFilter.trim()) params.set("client_format", p.clientFormatFilter.trim());
  if (p.salesChannelFilter.trim()) params.set("sales_channel", p.salesChannelFilter.trim());
  if (p.agentFilter.trim()) params.set("agent_id", p.agentFilter.trim());
  if (p.expeditorFilter.trim()) params.set("expeditor_user_id", p.expeditorFilter.trim());
  if (p.supervisorFilter.trim()) params.set("supervisor_user_id", p.supervisorFilter.trim());
  if (p.visitWeekdayFilter.trim()) params.set("visit_weekday", p.visitWeekdayFilter.trim());
  if (p.innFilter.trim()) params.set("inn", p.innFilter.trim());
  if (p.phoneFilter.trim()) params.set("phone", p.phoneFilter.trim());
  if (p.pinflFilter.trim()) params.set("client_pinfl", p.pinflFilter.trim());
  if (p.hasInventoryFilter === "yes") params.set("has_active_equipment", "true");
  if (p.hasInventoryFilter === "no") params.set("has_active_equipment", "false");
  if (p.equipmentKindFilter.trim()) params.set("equipment_kind", p.equipmentKindFilter.trim());
  if (p.creditAllowedFilter === "yes") params.set("has_credit", "true");
  if (p.creditAllowedFilter === "no") params.set("has_credit", "false");
  if (p.consignmentFilter === "yes") params.set("agent_consignment", "yes");
  if (p.consignmentFilter === "no") params.set("agent_consignment", "no");
  if (p.consignmentLimitedFilter === "yes") params.set("agent_consignment_limited", "yes");
  if (p.consignmentLimitedFilter === "no") params.set("agent_consignment_limited", "no");
  if (p.createdFrom.trim()) params.set("created_from", p.createdFrom.trim());
  if (p.createdTo.trim()) params.set("created_to", p.createdTo.trim());
  params.set("sort", p.sortField);
  params.set("order", p.sortOrder);
}
