import { prisma } from "../../config/database";

export async function listSuppliersForTenant(tenantId: number, activeOnly = true) {
  return prisma.supplier.findMany({
    where: { tenant_id: tenantId, ...(activeOnly ? { is_active: true } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, phone: true, is_active: true }
  });
}

export async function createSupplierRow(
  tenantId: number,
  data: { name: string; code?: string | null; phone?: string | null; comment?: string | null }
) {
  const name = data.name.trim();
  if (!name) throw new Error("BAD_NAME");
  return prisma.supplier.create({
    data: {
      tenant_id: tenantId,
      name,
      code: data.code?.trim() || null,
      phone: data.phone?.trim() || null,
      comment: data.comment?.trim() || null
    },
    select: { id: true, name: true, code: true, phone: true }
  });
}
