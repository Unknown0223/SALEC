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
import { resolveConstraintScope, type LinkageSelectedMasters } from "../linkage/linkage.service";

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
export async function getOrderCreateContextBundle(
  tenantId: number,
  selected: LinkageSelectedMasters = {}
): Promise<OrderCreateContextBundle> {
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
  const scope = await resolveConstraintScope(tenantId, selected);

  const constrainedClients = scope.constrained
    ? clientsPaged.data.filter((c) => scope.client_ids.includes(c.id))
    : clientsPaged.data;
  const constrainedWarehouses = scope.constrained
    ? warehouses.filter((w) => scope.warehouse_ids.includes(w.id))
    : warehouses;
  const constrainedUsers = scope.constrained
    ? users.filter((u) => u.id === scope.selected_agent_id)
    : users;
  const constrainedExpeditors = scope.constrained
    ? expeditors.filter((r) => r.is_active && scope.expeditor_ids.includes(r.id))
    : expeditors.filter((r) => r.is_active);
  const constrainedProducts = scope.constrained
    ? scope.product_ids.length > 0
      ? products.filter((p) => scope.product_ids.includes(p.id))
      : scope.product_restricted
        ? []
        : products
    : products;

  return {
    clients: constrainedClients,
    products: constrainedProducts,
    warehouses: constrainedWarehouses,
    users: constrainedUsers,
    price_types,
    expeditors: constrainedExpeditors,
    settings_profile: profile,
    product_categories: categories
  };
}
