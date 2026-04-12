import { prisma } from "../../config/database";

async function assertClient(tenantId: number, clientId: number): Promise<void> {
  const c = await prisma.client.findFirst({
    where: { id: clientId, tenant_id: tenantId },
    select: { id: true }
  });
  if (!c) throw new Error("NOT_FOUND");
}

export type ClientEquipmentApi = {
  id: number;
  inventory_type: string;
  equipment_kind: string | null;
  serial_number: string | null;
  inventory_number: string | null;
  assigned_at: string;
  removed_at: string | null;
  note: string | null;
};

export async function listClientEquipmentSplit(
  tenantId: number,
  clientId: number
): Promise<{ active: ClientEquipmentApi[]; removed: ClientEquipmentApi[] }> {
  await assertClient(tenantId, clientId);
  const rows = await prisma.clientEquipment.findMany({
    where: { tenant_id: tenantId, client_id: clientId },
    orderBy: [{ removed_at: "asc" }, { assigned_at: "desc" }]
  });
  const mapRow = (r: (typeof rows)[0]): ClientEquipmentApi => ({
    id: r.id,
    inventory_type: r.inventory_type,
    equipment_kind: r.equipment_kind,
    serial_number: r.serial_number,
    inventory_number: r.inventory_number,
    assigned_at: r.assigned_at.toISOString(),
    removed_at: r.removed_at?.toISOString() ?? null,
    note: r.note
  });
  return {
    active: rows.filter((r) => r.removed_at == null).map(mapRow),
    removed: rows.filter((r) => r.removed_at != null).map(mapRow)
  };
}

export async function createClientEquipmentRow(
  tenantId: number,
  clientId: number,
  input: {
    inventory_type: string;
    equipment_kind?: string | null;
    serial_number?: string | null;
    inventory_number?: string | null;
    note?: string | null;
  }
): Promise<ClientEquipmentApi> {
  await assertClient(tenantId, clientId);
  const t = input.inventory_type.trim();
  if (!t) throw new Error("VALIDATION");
  const row = await prisma.clientEquipment.create({
    data: {
      tenant_id: tenantId,
      client_id: clientId,
      inventory_type: t.slice(0, 256),
      equipment_kind: input.equipment_kind?.trim() ? input.equipment_kind.trim().slice(0, 256) : null,
      serial_number: input.serial_number?.trim() ? input.serial_number.trim().slice(0, 128) : null,
      inventory_number: input.inventory_number?.trim() ? input.inventory_number.trim().slice(0, 128) : null,
      note: input.note?.trim() ? input.note.trim().slice(0, 2000) : null
    }
  });
  return {
    id: row.id,
    inventory_type: row.inventory_type,
    equipment_kind: row.equipment_kind,
    serial_number: row.serial_number,
    inventory_number: row.inventory_number,
    assigned_at: row.assigned_at.toISOString(),
    removed_at: null,
    note: row.note
  };
}

export async function markClientEquipmentRemoved(tenantId: number, clientId: number, equipmentId: number): Promise<void> {
  await assertClient(tenantId, clientId);
  const r = await prisma.clientEquipment.findFirst({
    where: { id: equipmentId, tenant_id: tenantId, client_id: clientId }
  });
  if (!r) throw new Error("NOT_FOUND");
  await prisma.clientEquipment.update({
    where: { id: equipmentId },
    data: { removed_at: new Date() }
  });
}

export type ClientPhotoReportApi = {
  id: number;
  image_url: string;
  caption: string | null;
  order_id: number | null;
  created_at: string;
};

export async function listClientPhotoReports(
  tenantId: number,
  clientId: number
): Promise<ClientPhotoReportApi[]> {
  await assertClient(tenantId, clientId);
  const rows = await prisma.clientPhotoReport.findMany({
    where: { tenant_id: tenantId, client_id: clientId },
    orderBy: { created_at: "desc" },
    take: 200
  });
  return rows.map((r) => ({
    id: r.id,
    image_url: r.image_url,
    caption: r.caption,
    order_id: r.order_id,
    created_at: r.created_at.toISOString()
  }));
}

export async function createClientPhotoReportRow(
  tenantId: number,
  clientId: number,
  userId: number | null,
  input: { image_url: string; caption?: string | null; order_id?: number | null }
): Promise<ClientPhotoReportApi> {
  await assertClient(tenantId, clientId);
  const url = input.image_url.trim();
  if (!url || url.length > 4000) throw new Error("VALIDATION");
  let orderId: number | null = null;
  if (input.order_id != null && Number.isFinite(input.order_id) && input.order_id > 0) {
    const o = await prisma.order.findFirst({
      where: { id: input.order_id, tenant_id: tenantId, client_id: clientId },
      select: { id: true }
    });
    if (!o) throw new Error("ORDER_NOT_FOUND");
    orderId = o.id;
  }
  const row = await prisma.clientPhotoReport.create({
    data: {
      tenant_id: tenantId,
      client_id: clientId,
      image_url: url,
      caption: input.caption?.trim() ? input.caption.trim().slice(0, 1000) : null,
      order_id: orderId,
      created_by_user_id: userId
    }
  });
  return {
    id: row.id,
    image_url: row.image_url,
    caption: row.caption,
    order_id: row.order_id,
    created_at: row.created_at.toISOString()
  };
}

export async function deleteClientPhotoReport(
  tenantId: number,
  clientId: number,
  photoId: number
): Promise<void> {
  await assertClient(tenantId, clientId);
  const r = await prisma.clientPhotoReport.findFirst({
    where: { id: photoId, tenant_id: tenantId, client_id: clientId }
  });
  if (!r) throw new Error("NOT_FOUND");
  await prisma.clientPhotoReport.delete({ where: { id: photoId } });
}
