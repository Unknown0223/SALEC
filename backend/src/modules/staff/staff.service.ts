import bcrypt from "bcryptjs";
import { prisma } from "../../config/database";

type StaffKind = "agent" | "expeditor";

export type StaffRow = {
  id: number;
  kind: StaffKind;
  fio: string;
  product: string | null;
  agent_type: string | null;
  code: string | null;
  pinfl: string | null;
  consignment: boolean;
  apk_version: string | null;
  device_name: string | null;
  last_sync_at: string | null;
  phone: string | null;
  can_authorize: boolean;
  price_type: string | null;
  warehouse: string | null;
  trade_direction: string | null;
  branch: string | null;
  position: string | null;
  created_at: string;
  app_access: boolean;
  territory: string | null;
  login: string;
  is_active: boolean;
  client_count: number;
};

export type CreateStaffInput = {
  first_name: string;
  last_name?: string | null;
  middle_name?: string | null;
  login: string;
  password: string;
  phone?: string | null;
  product?: string | null;
  agent_type?: string | null;
  code?: string | null;
  pinfl?: string | null;
  consignment?: boolean;
  apk_version?: string | null;
  device_name?: string | null;
  can_authorize?: boolean;
  price_type?: string | null;
  warehouse_id?: number | null;
  return_warehouse_id?: number | null;
  trade_direction?: string | null;
  branch?: string | null;
  position?: string | null;
  app_access?: boolean;
  territory?: string | null;
  is_active?: boolean;
};

function kindRole(kind: StaffKind): string {
  return kind === "agent" ? "agent" : "expeditor";
}

function toFio(u: { first_name: string | null; last_name: string | null; middle_name: string | null; name: string }) {
  const parts = [u.last_name, u.first_name, u.middle_name].filter((x) => x && x.trim().length > 0);
  return parts.length > 0 ? parts.join(" ") : u.name;
}

export async function listStaff(tenantId: number, kind: StaffKind): Promise<StaffRow[]> {
  const role = kindRole(kind);
  const users = await prisma.user.findMany({
    where: { tenant_id: tenantId, role },
    include: {
      warehouse: { select: { name: true } },
      return_warehouse: { select: { name: true } }
    },
    orderBy: { created_at: "desc" }
  });

  const clientCounts = await prisma.client.groupBy({
    by: ["agent_id"],
    where: { tenant_id: tenantId, agent_id: { not: null }, merged_into_client_id: null },
    _count: { _all: true }
  });
  const countMap = new Map<number, number>();
  for (const row of clientCounts) {
    if (row.agent_id != null) countMap.set(row.agent_id, row._count._all);
  }

  return users.map((u) => ({
    id: u.id,
    kind,
    fio: toFio(u),
    product: u.product,
    agent_type: u.agent_type,
    code: u.code,
    pinfl: u.pinfl,
    consignment: u.consignment,
    apk_version: u.apk_version,
    device_name: u.device_name,
    last_sync_at: u.last_sync_at ? u.last_sync_at.toISOString() : null,
    phone: u.phone,
    can_authorize: u.can_authorize,
    price_type: u.price_type,
    warehouse: u.warehouse?.name ?? null,
    trade_direction: u.trade_direction,
    branch: u.branch,
    position: u.position,
    created_at: u.created_at.toISOString(),
    app_access: u.app_access,
    territory: u.territory,
    login: u.login,
    is_active: u.is_active,
    client_count: countMap.get(u.id) ?? 0
  }));
}

export async function createStaff(tenantId: number, kind: StaffKind, input: CreateStaffInput): Promise<StaffRow> {
  const login = input.login.trim().toLowerCase();
  if (!login) throw new Error("BAD_LOGIN");
  if (input.password.length < 6) throw new Error("BAD_PASSWORD");
  const firstName = input.first_name.trim();
  if (!firstName) throw new Error("BAD_FIRST_NAME");

  const exists = await prisma.user.findFirst({ where: { tenant_id: tenantId, login } });
  if (exists) throw new Error("LOGIN_EXISTS");

  if (input.warehouse_id != null) {
    const wh = await prisma.warehouse.findFirst({ where: { id: input.warehouse_id, tenant_id: tenantId } });
    if (!wh) throw new Error("BAD_WAREHOUSE");
  }
  if (input.return_warehouse_id != null) {
    const wh = await prisma.warehouse.findFirst({
      where: { id: input.return_warehouse_id, tenant_id: tenantId }
    });
    if (!wh) throw new Error("BAD_RETURN_WAREHOUSE");
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const created = await prisma.user.create({
    data: {
      tenant_id: tenantId,
      name: [input.last_name, input.first_name, input.middle_name].filter(Boolean).join(" ").trim() || firstName,
      first_name: firstName,
      last_name: input.last_name?.trim() || null,
      middle_name: input.middle_name?.trim() || null,
      login,
      password_hash: passwordHash,
      role: kindRole(kind),
      phone: input.phone?.trim() || null,
      product: input.product?.trim() || null,
      agent_type: input.agent_type?.trim() || null,
      code: input.code?.trim() || null,
      pinfl: input.pinfl?.trim() || null,
      consignment: input.consignment ?? false,
      apk_version: input.apk_version?.trim() || null,
      device_name: input.device_name?.trim() || null,
      can_authorize: input.can_authorize ?? true,
      price_type: input.price_type?.trim() || null,
      warehouse_id: input.warehouse_id ?? null,
      return_warehouse_id: input.return_warehouse_id ?? null,
      trade_direction: input.trade_direction?.trim() || null,
      branch: input.branch?.trim() || null,
      position: input.position?.trim() || null,
      app_access: input.app_access ?? true,
      territory: input.territory?.trim() || null,
      is_active: input.is_active ?? true
    }
  });

  const rows = await listStaff(tenantId, kind);
  const row = rows.find((x) => x.id === created.id);
  if (!row) throw new Error("NOT_FOUND");
  return row;
}
