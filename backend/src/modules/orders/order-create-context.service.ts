import { listClientsForTenantPaged } from "../clients/clients.service";
import { listProductsForOrderCreateForm } from "../products/products.service";
import {
  listDistinctPriceTypesForTenant,
  listProductCategoriesForTenant,
  listUsersForOrderAgent,
  listWarehousesForTenant
} from "../reference/reference.service";
import { listStaff, type StaffRow } from "../staff/staff.service";
import { getTenantProfile, type TenantProfileDto } from "../tenant-settings/tenant-settings.service";

export type OrderCreateContextBundle = {
  clients: Awaited<ReturnType<typeof listClientsForTenantPaged>>["data"];
  products: Awaited<ReturnType<typeof listProductsForOrderCreateForm>>;
  warehouses: Awaited<ReturnType<typeof listWarehousesForTenant>>;
  users: Awaited<ReturnType<typeof listUsersForOrderAgent>>;
  price_types: string[];
  expeditors: StaffRow[];
  settings_profile: TenantProfileDto;
  product_categories: Awaited<ReturnType<typeof listProductCategoriesForTenant>>;
};

/**
 * Yangi zakaz formasi uchun bitta javob: oldin 8 ta alohida HTTP o‘rniga serverda parallel DB.
 */
export async function getOrderCreateContextBundle(tenantId: number): Promise<OrderCreateContextBundle> {
  const [
    clientsPaged,
    products,
    warehouses,
    users,
    priceTypesRaw,
    expeditors,
    profile,
    categories
  ] = await Promise.all([
    listClientsForTenantPaged(tenantId, { page: 1, limit: 200, is_active: true }),
    listProductsForOrderCreateForm(tenantId),
    listWarehousesForTenant(tenantId),
    listUsersForOrderAgent(tenantId),
    listDistinctPriceTypesForTenant(tenantId, "sale"),
    listStaff(tenantId, "expeditor", {}),
    getTenantProfile(tenantId),
    listProductCategoriesForTenant(tenantId)
  ]);

  const price_types = priceTypesRaw.length ? priceTypesRaw : ["retail"];

  return {
    clients: clientsPaged.data,
    products,
    warehouses,
    users,
    price_types,
    expeditors: expeditors.filter((r) => r.is_active),
    settings_profile: profile,
    product_categories: categories
  };
}
