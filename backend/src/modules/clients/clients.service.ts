import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import { prisma } from "../../config/database";
import { ORDER_STATUSES_EXCLUDED_FROM_CREDIT_EXPOSURE } from "../orders/order-status";

/** Telefonni solishtirish uchun faqat raqamlar (masalan +998 90 → 99890). */
export function normalizePhoneDigits(phone: string | null | undefined): string | null {
  if (phone == null) return null;
  const d = phone.replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

export type ContactPersonSlot = {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
};

export type ClientListRow = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  category: string | null;
  credit_limit: string;
  is_active: boolean;
  /** Hisob saldo (qarzdorlik ko‘rsatkichi) */
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
};

export type DuplicatePhoneGroup = {
  phone_normalized: string;
  client_ids: number[];
  clients: Array<{
    id: number;
    name: string;
    phone: string | null;
    is_active: boolean;
    merged_into_client_id: number | null;
  }>;
};

export type ListClientsQuery = {
  page: number;
  limit: number;
  search?: string;
  is_active?: boolean;
  category?: string;
  sort?: "name" | "phone" | "id" | "created_at" | "region";
  order?: "asc" | "desc";
};

const CONTACT_SLOTS = 10;

function parseContactPersonsJson(raw: unknown): ContactPersonSlot[] {
  const slots: ContactPersonSlot[] = Array.from({ length: CONTACT_SLOTS }, () => ({
    firstName: null,
    lastName: null,
    phone: null
  }));
  if (!Array.isArray(raw)) return slots;
  for (let i = 0; i < CONTACT_SLOTS && i < raw.length; i++) {
    const o = raw[i] as Record<string, unknown>;
    slots[i] = {
      firstName: typeof o?.firstName === "string" ? o.firstName : null,
      lastName: typeof o.lastName === "string" ? o.lastName : null,
      phone: typeof o.phone === "string" ? o.phone : null
    };
  }
  return slots;
}

function contactPersonsToJson(slots: ContactPersonSlot[]): Prisma.InputJsonValue {
  const trimmed = slots.slice(0, CONTACT_SLOTS).map((s) => ({
    firstName: s.firstName?.trim() || null,
    lastName: s.lastName?.trim() || null,
    phone: s.phone?.trim() || null
  }));
  return trimmed as unknown as Prisma.InputJsonValue;
}

export async function listClientsForTenantPaged(
  tenantId: number,
  q: ListClientsQuery
): Promise<{ data: ClientListRow[]; total: number; page: number; limit: number }> {
  const where: Prisma.ClientWhereInput = {
    tenant_id: tenantId,
    merged_into_client_id: null
  };
  if (q.is_active === true) where.is_active = true;
  if (q.is_active === false) where.is_active = false;
  const cat = q.category?.trim();
  if (cat) where.category = cat;
  const search = q.search?.trim();
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
      { inn: { contains: search, mode: "insensitive" } },
      { region: { contains: search, mode: "insensitive" } },
      { district: { contains: search, mode: "insensitive" } },
      { landmark: { contains: search, mode: "insensitive" } },
      { responsible_person: { contains: search, mode: "insensitive" } },
      { notes: { contains: search, mode: "insensitive" } },
      { street: { contains: search, mode: "insensitive" } }
    ];
  }

  const sortField = q.sort ?? "name";
  const ord: Prisma.SortOrder = q.order === "desc" ? "desc" : "asc";
  const orderBy: Prisma.ClientOrderByWithRelationInput =
    sortField === "phone"
      ? { phone: ord }
      : sortField === "id"
        ? { id: ord }
        : sortField === "created_at"
          ? { created_at: ord }
          : sortField === "region"
            ? { region: ord }
            : { name: ord };

  const [total, clients] = await Promise.all([
    prisma.client.count({ where }),
    prisma.client.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy,
      select: {
        id: true,
        name: true,
        phone: true,
        address: true,
        category: true,
        credit_limit: true,
        is_active: true,
        created_at: true,
        responsible_person: true,
        landmark: true,
        inn: true,
        pdl: true,
        logistics_service: true,
        license_until: true,
        working_hours: true,
        region: true,
        district: true,
        neighborhood: true,
        street: true,
        house_number: true,
        apartment: true,
        gps_text: true,
        visit_date: true,
        notes: true,
        client_format: true,
        contact_persons: true,
        agent_id: true,
        agent: { select: { name: true } },
        client_balances: { take: 1, select: { balance: true } }
      }
    })
  ]);

  return {
    data: clients.map((c) => {
      const bal = c.client_balances[0]?.balance;
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        address: c.address,
        category: c.category,
        credit_limit: c.credit_limit.toString(),
        is_active: c.is_active,
        account_balance: bal != null ? bal.toString() : "0",
        responsible_person: c.responsible_person,
        landmark: c.landmark,
        inn: c.inn,
        pdl: c.pdl,
        logistics_service: c.logistics_service,
        license_until: c.license_until?.toISOString() ?? null,
        working_hours: c.working_hours,
        region: c.region,
        district: c.district,
        neighborhood: c.neighborhood,
        street: c.street,
        house_number: c.house_number,
        apartment: c.apartment,
        gps_text: c.gps_text,
        visit_date: c.visit_date?.toISOString() ?? null,
        notes: c.notes,
        client_format: c.client_format,
        agent_id: c.agent_id,
        agent_name: c.agent?.name ?? null,
        contact_persons: parseContactPersonsJson(c.contact_persons),
        created_at: c.created_at.toISOString()
      };
    }),
    total,
    page: q.page,
    limit: q.limit
  };
}

export type ClientDetailRow = ClientListRow & {
  phone_normalized: string | null;
  /** `cancelled` / `returned` dan tashqari zakazlar `total_sum` yig‘indisi (kredit yuki). */
  open_orders_total: string;
};

export async function getClientDetail(tenantId: number, id: number): Promise<ClientDetailRow> {
  const [c, agg, balRow] = await Promise.all([
    prisma.client.findFirst({
      where: { id, tenant_id: tenantId, merged_into_client_id: null },
      select: {
        id: true,
        name: true,
        phone: true,
        phone_normalized: true,
        address: true,
        category: true,
        credit_limit: true,
        is_active: true,
        agent_id: true,
        created_at: true,
        responsible_person: true,
        landmark: true,
        inn: true,
        pdl: true,
        logistics_service: true,
        license_until: true,
        working_hours: true,
        region: true,
        district: true,
        neighborhood: true,
        street: true,
        house_number: true,
        apartment: true,
        gps_text: true,
        visit_date: true,
        notes: true,
        client_format: true,
        contact_persons: true,
        agent: { select: { name: true } }
      }
    }),
    prisma.order.aggregate({
      where: {
        tenant_id: tenantId,
        client_id: id,
        status: { notIn: [...ORDER_STATUSES_EXCLUDED_FROM_CREDIT_EXPOSURE] }
      },
      _sum: { total_sum: true }
    }),
    prisma.clientBalance.findUnique({
      where: { tenant_id_client_id: { tenant_id: tenantId, client_id: id } },
      select: { balance: true }
    })
  ]);
  if (!c) {
    throw new Error("NOT_FOUND");
  }
  const open_orders_total = (agg._sum.total_sum ?? new Prisma.Decimal(0)).toString();
  const account_balance = balRow?.balance.toString() ?? "0";
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    address: c.address,
    category: c.category,
    credit_limit: c.credit_limit.toString(),
    is_active: c.is_active,
    phone_normalized: c.phone_normalized,
    agent_id: c.agent_id,
    agent_name: c.agent?.name ?? null,
    created_at: c.created_at.toISOString(),
    account_balance,
    responsible_person: c.responsible_person,
    landmark: c.landmark,
    inn: c.inn,
    pdl: c.pdl,
    logistics_service: c.logistics_service,
    license_until: c.license_until?.toISOString() ?? null,
    working_hours: c.working_hours,
    region: c.region,
    district: c.district,
    neighborhood: c.neighborhood,
    street: c.street,
    house_number: c.house_number,
    apartment: c.apartment,
    gps_text: c.gps_text,
    visit_date: c.visit_date?.toISOString() ?? null,
    notes: c.notes,
    client_format: c.client_format,
    contact_persons: parseContactPersonsJson(c.contact_persons),
    open_orders_total
  };
}

export type ClientBalanceMovementRow = {
  id: number;
  delta: string;
  note: string | null;
  user_login: string | null;
  created_at: string;
};

export async function listClientBalanceMovements(
  tenantId: number,
  clientId: number,
  page: number,
  limit: number
): Promise<{
  data: ClientBalanceMovementRow[];
  total: number;
  page: number;
  limit: number;
  account_balance: string;
}> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenant_id: tenantId, merged_into_client_id: null }
  });
  if (!client) {
    throw new Error("NOT_FOUND");
  }

  const bal = await prisma.clientBalance.findUnique({
    where: { tenant_id_client_id: { tenant_id: tenantId, client_id: clientId } }
  });
  if (!bal) {
    return { data: [], total: 0, page, limit, account_balance: "0" };
  }

  const [total, rows] = await Promise.all([
    prisma.clientBalanceMovement.count({ where: { client_balance_id: bal.id } }),
    prisma.clientBalanceMovement.findMany({
      where: { client_balance_id: bal.id },
      orderBy: { created_at: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { login: true } } }
    })
  ]);

  return {
    data: rows.map((r) => ({
      id: r.id,
      delta: r.delta.toString(),
      note: r.note,
      user_login: r.user?.login ?? null,
      created_at: r.created_at.toISOString()
    })),
    total,
    page,
    limit,
    account_balance: bal.balance.toString()
  };
}

export async function addClientBalanceMovement(
  tenantId: number,
  clientId: number,
  delta: number,
  note: string | null | undefined,
  actorUserId: number | null
): Promise<ClientDetailRow> {
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error("BAD_DELTA");
  }

  const client = await prisma.client.findFirst({
    where: { id: clientId, tenant_id: tenantId, merged_into_client_id: null }
  });
  if (!client) {
    throw new Error("NOT_FOUND");
  }

  const d = new Prisma.Decimal(delta);
  const uid =
    actorUserId != null && Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : null;

  await prisma.$transaction(async (tx) => {
    const bal = await tx.clientBalance.upsert({
      where: { tenant_id_client_id: { tenant_id: tenantId, client_id: clientId } },
      create: { tenant_id: tenantId, client_id: clientId, balance: d },
      update: { balance: { increment: d } }
    });
    await tx.clientBalanceMovement.create({
      data: {
        client_balance_id: bal.id,
        delta: d,
        note: note?.trim() || null,
        user_id: uid
      }
    });
  });

  await appendClientAuditLog(tenantId, clientId, actorUserId, "client.balance_movement", {
    delta,
    note: note?.trim() || null
  });

  return getClientDetail(tenantId, clientId);
}

export type UpdateClientInput = {
  name?: string;
  phone?: string | null;
  credit_limit?: number;
  address?: string | null;
  category?: string | null;
  responsible_person?: string | null;
  landmark?: string | null;
  inn?: string | null;
  pdl?: string | null;
  logistics_service?: string | null;
  license_until?: string | null;
  working_hours?: string | null;
  region?: string | null;
  district?: string | null;
  neighborhood?: string | null;
  street?: string | null;
  house_number?: string | null;
  apartment?: string | null;
  gps_text?: string | null;
  visit_date?: string | null;
  notes?: string | null;
  client_format?: string | null;
  agent_id?: number | null;
  contact_persons?: ContactPersonSlot[];
  is_active?: boolean;
};

export async function appendClientAuditLog(
  tenantId: number,
  clientId: number,
  userId: number | null | undefined,
  action: string,
  detail: Record<string, unknown>
): Promise<void> {
  const uid =
    userId != null && Number.isFinite(userId) && userId > 0 ? Math.floor(Number(userId)) : null;
  await prisma.clientAuditLog.create({
    data: {
      tenant_id: tenantId,
      client_id: clientId,
      user_id: uid,
      action,
      detail: detail as Prisma.InputJsonValue
    }
  });
}

export async function listClientAuditLogs(
  tenantId: number,
  clientId: number,
  page: number,
  limit: number
): Promise<{
  data: Array<{
    id: number;
    action: string;
    detail: unknown;
    user_login: string | null;
    created_at: string;
  }>;
  total: number;
  page: number;
  limit: number;
}> {
  const c = await prisma.client.findFirst({
    where: { id: clientId, tenant_id: tenantId, merged_into_client_id: null }
  });
  if (!c) {
    throw new Error("NOT_FOUND");
  }
  const [total, rows] = await Promise.all([
    prisma.clientAuditLog.count({ where: { tenant_id: tenantId, client_id: clientId } }),
    prisma.clientAuditLog.findMany({
      where: { tenant_id: tenantId, client_id: clientId },
      orderBy: { created_at: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { login: true } } }
    })
  ]);
  return {
    data: rows.map((r) => ({
      id: r.id,
      action: r.action,
      detail: r.detail,
      user_login: r.user?.login ?? null,
      created_at: r.created_at.toISOString()
    })),
    total,
    page,
    limit
  };
}

export async function updateClientFields(
  tenantId: number,
  id: number,
  input: UpdateClientInput,
  actorUserId?: number | null
): Promise<ClientDetailRow> {
  const existing = await prisma.client.findFirst({
    where: { id, tenant_id: tenantId, merged_into_client_id: null }
  });
  if (!existing) {
    throw new Error("NOT_FOUND");
  }

  const data: Prisma.ClientUncheckedUpdateInput = {};
  if (input.credit_limit !== undefined) {
    if (!Number.isFinite(input.credit_limit) || input.credit_limit < 0) {
      throw new Error("VALIDATION");
    }
    data.credit_limit = new Prisma.Decimal(input.credit_limit);
  }
  if (input.name !== undefined) {
    const n = input.name.trim();
    if (n.length < 1) throw new Error("VALIDATION");
    data.name = n;
  }
  if (input.phone !== undefined) {
    const p = input.phone?.trim() || null;
    data.phone = p;
    data.phone_normalized = normalizePhoneDigits(p);
  }
  if (input.address !== undefined) {
    data.address = input.address?.trim() || null;
  }
  if (input.category !== undefined) {
    data.category = input.category?.trim() || null;
  }
  if (input.responsible_person !== undefined) {
    data.responsible_person = input.responsible_person?.trim() || null;
  }
  if (input.landmark !== undefined) {
    data.landmark = input.landmark?.trim() || null;
  }
  if (input.inn !== undefined) {
    data.inn = input.inn?.trim() || null;
  }
  if (input.pdl !== undefined) {
    data.pdl = input.pdl?.trim() || null;
  }
  if (input.logistics_service !== undefined) {
    data.logistics_service = input.logistics_service?.trim() || null;
  }
  if (input.working_hours !== undefined) {
    data.working_hours = input.working_hours?.trim() || null;
  }
  if (input.region !== undefined) {
    data.region = input.region?.trim() || null;
  }
  if (input.district !== undefined) {
    data.district = input.district?.trim() || null;
  }
  if (input.neighborhood !== undefined) {
    data.neighborhood = input.neighborhood?.trim() || null;
  }
  if (input.street !== undefined) {
    data.street = input.street?.trim() || null;
  }
  if (input.house_number !== undefined) {
    data.house_number = input.house_number?.trim() || null;
  }
  if (input.apartment !== undefined) {
    data.apartment = input.apartment?.trim() || null;
  }
  if (input.gps_text !== undefined) {
    data.gps_text = input.gps_text?.trim() || null;
  }
  if (input.notes !== undefined) {
    data.notes = input.notes?.trim() || null;
  }
  if (input.client_format !== undefined) {
    data.client_format = input.client_format?.trim() || null;
  }
  if (input.license_until !== undefined) {
    if (input.license_until === null || input.license_until === "") {
      data.license_until = null;
    } else {
      const d = new Date(input.license_until);
      if (Number.isNaN(d.getTime())) throw new Error("VALIDATION");
      data.license_until = d;
    }
  }
  if (input.visit_date !== undefined) {
    if (input.visit_date === null || input.visit_date === "") {
      data.visit_date = null;
    } else {
      const d = new Date(input.visit_date);
      if (Number.isNaN(d.getTime())) throw new Error("VALIDATION");
      data.visit_date = d;
    }
  }
  if (input.agent_id !== undefined) {
    if (input.agent_id === null) {
      data.agent_id = null;
    } else {
      const u = await prisma.user.findFirst({
        where: { id: input.agent_id, tenant_id: tenantId, is_active: true }
      });
      if (!u) throw new Error("VALIDATION");
      data.agent_id = input.agent_id;
    }
  }
  if (input.contact_persons !== undefined) {
    const slots = input.contact_persons.slice(0, CONTACT_SLOTS);
    if (slots.length > CONTACT_SLOTS) throw new Error("VALIDATION");
    data.contact_persons = contactPersonsToJson(slots);
  }
  if (input.is_active !== undefined) {
    data.is_active = input.is_active;
  }

  if (Object.keys(data).length === 0) {
    throw new Error("EMPTY");
  }

  await prisma.client.update({ where: { id }, data });
  const detail: Record<string, unknown> = { ...input };
  await appendClientAuditLog(tenantId, id, actorUserId, "client.patch", detail);
  return getClientDetail(tenantId, id);
}

export async function getDuplicatePhoneGroups(tenantId: number): Promise<DuplicatePhoneGroup[]> {
  const keys = await prisma.$queryRaw<Array<{ phone_normalized: string }>>(
    Prisma.sql`
      SELECT "phone_normalized"
      FROM "clients"
      WHERE "tenant_id" = ${tenantId}
        AND "phone_normalized" IS NOT NULL
        AND "merged_into_client_id" IS NULL
      GROUP BY "tenant_id", "phone_normalized"
      HAVING COUNT(*) > 1
    `
  );

  const groups: DuplicatePhoneGroup[] = [];
  for (const k of keys) {
    if (!k.phone_normalized) continue;
    const clients = await prisma.client.findMany({
      where: {
        tenant_id: tenantId,
        phone_normalized: k.phone_normalized,
        merged_into_client_id: null
      },
      select: {
        id: true,
        name: true,
        phone: true,
        is_active: true,
        merged_into_client_id: true
      },
      orderBy: { id: "asc" }
    });
    if (clients.length < 2) continue;
    groups.push({
      phone_normalized: k.phone_normalized,
      client_ids: clients.map((c) => c.id),
      clients
    });
  }
  return groups;
}

export type CheckDuplicateMatch = {
  id: number;
  name: string;
  phone: string | null;
  reason: "phone" | "name";
};

export async function checkDuplicateCandidates(
  tenantId: number,
  name: string,
  phone: string | null | undefined
): Promise<CheckDuplicateMatch[]> {
  const norm = normalizePhoneDigits(phone);
  const trimmedName = name.trim().toLowerCase();
  const matches = new Map<number, CheckDuplicateMatch>();

  if (norm) {
    const byPhone = await prisma.client.findMany({
      where: {
        tenant_id: tenantId,
        phone_normalized: norm,
        merged_into_client_id: null
      },
      select: { id: true, name: true, phone: true }
    });
    for (const c of byPhone) {
      matches.set(c.id, { id: c.id, name: c.name, phone: c.phone, reason: "phone" });
    }
  }

  if (trimmedName.length >= 2) {
    const byName = await prisma.client.findMany({
      where: {
        tenant_id: tenantId,
        merged_into_client_id: null,
        name: { equals: name.trim(), mode: "insensitive" }
      },
      select: { id: true, name: true, phone: true }
    });
    for (const c of byName) {
      if (!matches.has(c.id)) {
        matches.set(c.id, { id: c.id, name: c.name, phone: c.phone, reason: "name" });
      }
    }
  }

  return [...matches.values()].sort((a, b) => a.id - b.id);
}

export async function mergeClientsIntoOne(
  tenantId: number,
  keepClientId: number,
  mergeClientIds: number[],
  actorUserId?: number | null
): Promise<{ kept: number; merged: number[]; orders_reassigned: number }> {
  const uniqueMerge = [...new Set(mergeClientIds)].filter((id) => id !== keepClientId);
  if (uniqueMerge.length === 0) {
    throw new Error("NO_MERGE_TARGETS");
  }

  const allIds = [keepClientId, ...uniqueMerge];
  const clients = await prisma.client.findMany({
    where: { id: { in: allIds }, tenant_id: tenantId },
    select: { id: true, merged_into_client_id: true, is_active: true }
  });
  if (clients.length !== allIds.length) {
    throw new Error("NOT_FOUND");
  }
  for (const c of clients) {
    if (c.merged_into_client_id != null) {
      throw new Error("ALREADY_MERGED");
    }
  }

  const orderUpdate = await prisma.$transaction(async (tx) => {
    const r = await tx.order.updateMany({
      where: { tenant_id: tenantId, client_id: { in: uniqueMerge } },
      data: { client_id: keepClientId }
    });
    await tx.client.updateMany({
      where: { id: { in: uniqueMerge }, tenant_id: tenantId },
      data: {
        is_active: false,
        merged_into_client_id: keepClientId
      }
    });
    return r.count;
  });

  await appendClientAuditLog(tenantId, keepClientId, actorUserId, "client.merge", {
    merged_client_ids: uniqueMerge,
    orders_reassigned: orderUpdate
  });

  return {
    kept: keepClientId,
    merged: uniqueMerge,
    orders_reassigned: orderUpdate
  };
}

/** Shablon va import uchun ruxsat etilgan ustun kalitlari (1-varaq, 1-qator sarlavha). */
export const CLIENT_IMPORT_COLUMN_KEYS = [
  "name",
  "phone",
  "address",
  "category",
  "credit_limit",
  "is_active",
  "responsible_person",
  "landmark",
  "inn",
  "pdl",
  "logistics_service",
  "license_until",
  "working_hours",
  "region",
  "district",
  "neighborhood",
  "street",
  "house_number",
  "apartment",
  "gps_text",
  "visit_date",
  "notes",
  "client_format",
  "agent_id",
  "contact1_firstName",
  "contact1_lastName",
  "contact1_phone",
  "contact2_firstName",
  "contact2_lastName",
  "contact2_phone",
  "contact3_firstName",
  "contact3_lastName",
  "contact3_phone"
] as const;

const HEADER_ALIASES: Record<string, string> = {
  nom: "name",
  nomi: "name",
  mijoz: "name",
  mijoz_nomi: "name",
  telefon: "phone",
  tel: "phone",
  manzil: "address",
  kategoriya: "category",
  kredit: "credit_limit",
  kredit_limiti: "credit_limit",
  faol: "is_active",
  masul: "responsible_person",
  masul_shaxs: "responsible_person",
  orientir: "landmark",
  stir: "inn",
  logistika: "logistics_service",
  litsenziya_muddati: "license_until",
  ish_vaqti: "working_hours",
  viloyat: "region",
  tuman: "district",
  mahalla: "neighborhood",
  kocha: "street",
  uy: "house_number",
  xonadon: "apartment",
  gps: "gps_text",
  tashrif: "visit_date",
  izoh: "notes",
  format: "client_format",
  agent: "agent_id",
  agent_id: "agent_id",
  // Ruscha sarlavhalar (Excel / 1C / CRM eksport)
  имя: "name",
  название: "name",
  наименование: "name",
  наименование_полное: "name",
  наименование_клиента: "name",
  наименование_контрагента: "name",
  контрагент: "name",
  организация: "name",
  покупатель: "name",
  клиент: "name",
  фио: "name",
  телефон: "phone",
  адрес: "address",
  категория: "category",
  категория_клиента: "category",
  кредит: "credit_limit",
  кредитный_лимит: "credit_limit",
  активен: "is_active",
  ответственный: "responsible_person",
  ориентир: "landmark",
  инн: "inn",
  регион: "region",
  область: "region",
  район: "district",
  улица: "street",
  дом: "house_number",
  квартира: "apartment",
  примечание: "notes",
  комментарий: "notes"
};

const VALID_IMPORT_KEYS = new Set<string>(CLIENT_IMPORT_COLUMN_KEYS);

function normalizeHeaderLabel(h: string): string {
  return h
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/\u00a0/g, " ")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[''`«»]/g, "");
}

function headerToClientImportKey(h: string): string | null {
  const n = normalizeHeaderLabel(h);
  if (HEADER_ALIASES[n]) return HEADER_ALIASES[n];
  if (VALID_IMPORT_KEYS.has(n)) return n;
  return null;
}

function isPlaceholderCell(s: string): boolean {
  const t = s.trim();
  return t === "" || t === "---" || t === "—" || t === "-" || t.toLowerCase() === "n/a";
}

function parseOptionalDate(raw: string | null): Date | null {
  if (raw == null || isPlaceholderCell(raw)) return null;
  const s = raw.trim();
  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime())) return iso;
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/.exec(s);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]) - 1;
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    const dt = new Date(y, mo, d);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  return null;
}

function parseIsActive(raw: string | null): boolean {
  if (raw == null || isPlaceholderCell(raw)) return true;
  const t = raw.trim().toLowerCase();
  if (["yoq", "false", "0", "no", "off"].includes(t)) return false;
  return true;
}

function parseCreditLimit(raw: string | null): Prisma.Decimal {
  if (raw == null || isPlaceholderCell(raw)) return new Prisma.Decimal(0);
  const n = Number.parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return new Prisma.Decimal(0);
  return new Prisma.Decimal(n);
}

/** SheetJS (`xlsx`) qatori — ExcelJS `readCellText` o‘rnini bosadi. */
function xlsxCellToString(cell: unknown): string | null {
  if (cell == null || cell === "") return null;
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  const s = typeof cell === "number" ? String(cell) : String(cell).trim();
  if (isPlaceholderCell(s)) return null;
  return s;
}

function readArrayCell(row: unknown[] | undefined, colIdx: number | undefined): string | null {
  if (row == null || colIdx == null || colIdx < 0) return null;
  return xlsxCellToString(row[colIdx]);
}

function headerLabelFromCell(cell: unknown): string {
  if (cell == null) return "";
  return String(cell).trim();
}

export async function buildClientImportTemplateBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Mijozlar", {
    views: [{ state: "frozen", ySplit: 1 }]
  });
  const headers = [...CLIENT_IMPORT_COLUMN_KEYS];
  ws.addRow(headers);
  const r1 = ws.getRow(1);
  r1.font = { bold: true };
  r1.eachCell((c) => {
    c.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8F4F8" }
    };
  });
  const example: string[] = headers.map((key) => {
    if (key === "name") return "Misol MCHJ yoki FIO";
    if (key === "phone") return "+998901112233";
    if (key === "credit_limit") return "0";
    if (key === "is_active") return "ha";
    if (key === "region") return "Toshkent";
    if (key.startsWith("contact1_")) {
      if (key === "contact1_firstName") return "Ali";
      if (key === "contact1_lastName") return "Valiyev";
      if (key === "contact1_phone") return "+998901112233";
    }
    return "---";
  });
  ws.addRow(example);
  ws.columns = headers.map(() => ({ width: 18 }));
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

const IMPORT_MAX_ERRORS_RETURNED = 100;
/** Birinchi qatorlardan qaysi birida sarlavha ekanini qidiramiz (sarlavha 3–10-qatorda bo‘lishi mumkin). */
const IMPORT_HEADER_SCAN_ROWS = 50;
/** Bitta varaqdan yuklab olinadigan maksimal qator (xotira / vaqt). */
const IMPORT_MAX_DATA_ROWS = 200_000;

function buildColIndexFromHeaderRow(headerCells: unknown): Record<string, number> | null {
  if (!Array.isArray(headerCells)) return null;
  const colIndexByKey: Record<string, number> = {};
  headerCells.forEach((cell, idx) => {
    const label = headerLabelFromCell(cell);
    if (!label) return;
    const key = headerToClientImportKey(label);
    if (key) colIndexByKey[key] = idx;
  });
  return Object.prototype.hasOwnProperty.call(colIndexByKey, "name") ? colIndexByKey : null;
}

function sheetToRowsMatrix(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: true
  }) as unknown[][];
}

/** Bir nechta varaq va sarlavha offsetini qo‘llab-quvvatlaydi; eng ko‘p ma’lumot qatori bo‘lgan blokni tanlaydi. */
function findImportTableInWorkbook(wb: XLSX.WorkBook): {
  sheetName: string;
  rows: unknown[][];
  headerRowIdx: number;
  colIndexByKey: Record<string, number>;
} | null {
  let best: {
    sheetName: string;
    rows: unknown[][];
    headerRowIdx: number;
    colIndexByKey: Record<string, number>;
    dataRows: number;
  } | null = null;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = sheetToRowsMatrix(ws);
    if (rows.length === 0) continue;

    const scanLimit = Math.min(IMPORT_HEADER_SCAN_ROWS, rows.length);
    for (let hr = 0; hr < scanLimit; hr++) {
      const colIndexByKey = buildColIndexFromHeaderRow(rows[hr]);
      if (!colIndexByKey) continue;
      const dataRows = rows.length - hr - 1;
      if (
        best == null ||
        dataRows > best.dataRows ||
        (dataRows === best.dataRows && rows.length > best.rows.length)
      ) {
        best = { sheetName, rows, headerRowIdx: hr, colIndexByKey, dataRows };
      }
    }
  }

  if (!best) return null;
  return {
    sheetName: best.sheetName,
    rows: best.rows,
    headerRowIdx: best.headerRowIdx,
    colIndexByKey: best.colIndexByKey
  };
}

export async function importClientsFromXlsx(
  tenantId: number,
  buffer: Buffer | Uint8Array
): Promise<{ created: number; errors: string[] }> {
  const errors: string[] = [];
  let totalRowErrors = 0;
  const pushErr = (msg: string) => {
    totalRowErrors += 1;
    if (errors.length < IMPORT_MAX_ERRORS_RETURNED) errors.push(msg);
  };

  const raw = Buffer.from(buffer);
  if (raw.length < 4) {
    return { created: 0, errors: ["Fayl bo‘sh yoki juda kichik."] };
  }
  // Haqiqiy .xlsx — zip (PK\x03\x04). Eski .xls yoki boshqa tur boshqacha bo‘ladi.
  if (raw[0] !== 0x50 || raw[1] !== 0x4b) {
    return {
      created: 0,
      errors: [
        "Bu fayl standart .xlsx (zip) ko‘rinishida emas. Ehtimol .xls yoki boshqa dastur eksporti. Excelda «Fayl → Saqlash tur» dan .xlsx tanlang."
      ]
    };
  }

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(raw, { type: "buffer", cellDates: true, dense: false });
  } catch (e) {
    const hint = e instanceof Error ? e.message : String(e);
    return {
      created: 0,
      errors: [
        "Fayl o‘qilmadi. Buzilgan .xlsx yoki noto‘g‘ri format. Excelda qayta saqlang (.xlsx) yoki loyiha shablonidan foydalaning.",
        `Texnik: ${hint.slice(0, 200)}`
      ]
    };
  }

  if (!wb.SheetNames.length) {
    return { created: 0, errors: ["Jadvalda varaq yo‘q."] };
  }

  const table = findImportTableInWorkbook(wb);
  if (!table) {
    const first = wb.SheetNames[0];
    const ws0 = first ? wb.Sheets[first] : undefined;
    const rows0 = ws0 ? sheetToRowsMatrix(ws0) : [];
    const headerTry = rows0[0];
    const sample = (Array.isArray(headerTry) ? headerTry : [])
      .map((c) => headerLabelFromCell(c))
      .filter(Boolean)
      .slice(0, 12);
    const preview = sample.join(" | ");
    return {
      created: 0,
      errors: [
        `Hech bir varaqning dastlabki ${IMPORT_HEADER_SCAN_ROWS} qatorida majburiy ustun (name / наименование va hokazo) topilmadi.`,
        preview
          ? `Birinchi varaq, 1-qator (namuna): ${preview}`
          : "Birinchi varaq bo‘sh yoki o‘qilmadi."
      ]
    };
  }

  const { rows, headerRowIdx, colIndexByKey } = table;

  let created = 0;
  let skippedEmpty = 0;

  const firstDataRow = headerRowIdx + 1;
  const lastRowIdx = Math.min(rows.length - 1, headerRowIdx + IMPORT_MAX_DATA_ROWS);

  if (firstDataRow > rows.length - 1) {
    return {
      created: 0,
      errors: [
        `Sarlavha ${headerRowIdx + 1}-qatorda topildi («${table.sheetName}»), lekin undan keyin ma’lumot qatori yo‘q.`
      ]
    };
  }

  for (let r = firstDataRow; r <= lastRowIdx; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) {
      skippedEmpty += 1;
      continue;
    }

    const nameRaw = readArrayCell(row, colIndexByKey.name);
    if (nameRaw == null) {
      skippedEmpty += 1;
      continue;
    }

    const phone = readArrayCell(row, colIndexByKey.phone);
    const address = readArrayCell(row, colIndexByKey.address);
    const category = readArrayCell(row, colIndexByKey.category);
    const credit_limit = parseCreditLimit(readArrayCell(row, colIndexByKey.credit_limit));
    const is_active = parseIsActive(readArrayCell(row, colIndexByKey.is_active));
    const responsible_person = readArrayCell(row, colIndexByKey.responsible_person);
    const landmark = readArrayCell(row, colIndexByKey.landmark);
    const inn = readArrayCell(row, colIndexByKey.inn);
    const pdl = readArrayCell(row, colIndexByKey.pdl);
    const logistics_service = readArrayCell(row, colIndexByKey.logistics_service);
    const license_until = parseOptionalDate(readArrayCell(row, colIndexByKey.license_until));
    const working_hours = readArrayCell(row, colIndexByKey.working_hours);
    const region = readArrayCell(row, colIndexByKey.region);
    const district = readArrayCell(row, colIndexByKey.district);
    const neighborhood = readArrayCell(row, colIndexByKey.neighborhood);
    const street = readArrayCell(row, colIndexByKey.street);
    const house_number = readArrayCell(row, colIndexByKey.house_number);
    const apartment = readArrayCell(row, colIndexByKey.apartment);
    const gps_text = readArrayCell(row, colIndexByKey.gps_text);
    const visit_date = parseOptionalDate(readArrayCell(row, colIndexByKey.visit_date));
    const notes = readArrayCell(row, colIndexByKey.notes);
    const client_format = readArrayCell(row, colIndexByKey.client_format);

    let agent_id: number | null = null;
    const agentStr = readArrayCell(row, colIndexByKey.agent_id);
    if (agentStr != null) {
      const aid = Number.parseInt(agentStr, 10);
      if (Number.isFinite(aid) && aid > 0) {
        const u = await prisma.user.findFirst({
          where: { id: aid, tenant_id: tenantId, is_active: true }
        });
        if (u) agent_id = aid;
      }
    }

    const slots: ContactPersonSlot[] = Array.from({ length: CONTACT_SLOTS }, () => ({
      firstName: null,
      lastName: null,
      phone: null
    }));
    for (let i = 0; i < 3; i++) {
      const p = i + 1;
      const fn = readArrayCell(row, colIndexByKey[`contact${p}_firstName`]);
      const ln = readArrayCell(row, colIndexByKey[`contact${p}_lastName`]);
      const ph = readArrayCell(row, colIndexByKey[`contact${p}_phone`]);
      slots[i] = { firstName: fn, lastName: ln, phone: ph };
    }

    try {
      await prisma.client.create({
        data: {
          tenant_id: tenantId,
          name: nameRaw.trim(),
          phone,
          phone_normalized: normalizePhoneDigits(phone),
          address,
          category,
          credit_limit,
          is_active,
          responsible_person,
          landmark,
          inn,
          pdl,
          logistics_service,
          license_until,
          working_hours,
          region,
          district,
          neighborhood,
          street,
          house_number,
          apartment,
          gps_text,
          visit_date,
          notes,
          client_format,
          agent_id,
          contact_persons: contactPersonsToJson(slots)
        }
      });
      created += 1;
    } catch (e) {
      const raw = e instanceof Error ? e.message : "xato";
      const short =
        raw.includes("Unique constraint") || raw.includes("unique constraint")
          ? "bu tenantda telefon yoki boshqa noyob maydon takrorlanmoqda"
          : raw.length > 180
            ? `${raw.slice(0, 180)}…`
            : raw;
      pushErr(`Qator ${r + 1} (Excel): ${short}`);
    }
  }

  const out = [...errors];
  if (created === 0 && errors.length === 0 && skippedEmpty > 0) {
    out.push(
      `Hech kim qo‘shilmadi: Excel ${headerRowIdx + 2}–${rows.length} qatorlarda «name» bo‘sh yoki --- (${skippedEmpty} qator o‘tkazildi).`
    );
  }
  if (totalRowErrors > IMPORT_MAX_ERRORS_RETURNED) {
    out.push(
      `… va yana ${totalRowErrors - IMPORT_MAX_ERRORS_RETURNED} ta qator xatosi (faqat birinchi ${IMPORT_MAX_ERRORS_RETURNED} matn qaytarildi).`
    );
  }

  return { created, errors: out };
}
