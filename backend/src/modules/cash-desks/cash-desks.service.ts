import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";

export const CASH_DESK_LINK_ROLES = ["cashier", "manager", "operator", "supervisor", "expeditor"] as const;
export type CashDeskLinkRole = (typeof CASH_DESK_LINK_ROLES)[number];

const ROLE_FOR_LINK: Record<CashDeskLinkRole, string> = {
  cashier: "operator",
  manager: "operator",
  operator: "operator",
  supervisor: "supervisor",
  expeditor: "expeditor"
};

function normalizeCode(code: string | null | undefined): string | null {
  const t = (code ?? "").trim();
  return t.length ? t.slice(0, 20) : null;
}

export async function listCashDeskPickers(tenantId: number) {
  const [operators, supervisors, expeditors] = await Promise.all([
    prisma.user.findMany({
      where: { tenant_id: tenantId, is_active: true, role: "operator" },
      select: { id: true, name: true, login: true },
      orderBy: [{ name: "asc" }, { login: "asc" }]
    }),
    prisma.user.findMany({
      where: { tenant_id: tenantId, is_active: true, role: "supervisor" },
      select: { id: true, name: true, login: true },
      orderBy: [{ name: "asc" }, { login: "asc" }]
    }),
    prisma.user.findMany({
      where: { tenant_id: tenantId, is_active: true, role: "expeditor" },
      select: { id: true, name: true, login: true },
      orderBy: [{ name: "asc" }, { login: "asc" }]
    })
  ]);
  return {
    operators,
    supervisors,
    expeditors,
    cashier_pool: operators,
    manager_pool: operators,
    operator_pool: operators
  };
}

function mapLinkRoleCounts(links: { link_role: string }[]) {
  const m: Record<string, number> = Object.fromEntries(CASH_DESK_LINK_ROLES.map((r) => [r, 0]));
  for (const l of links) {
    if (typeof m[l.link_role] === "number") m[l.link_role] += 1;
  }
  return m;
}

export async function listCashDesks(
  tenantId: number,
  opts: { is_active?: boolean; q?: string; page: number; limit: number }
) {
  const where: Prisma.CashDeskWhereInput = { tenant_id: tenantId };
  if (opts.is_active !== undefined) where.is_active = opts.is_active;
  const q = (opts.q ?? "").trim();
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { comment: { contains: q, mode: "insensitive" } }
    ];
  }
  const skip = (opts.page - 1) * opts.limit;
  const [total, rows] = await Promise.all([
    prisma.cashDesk.count({ where }),
    prisma.cashDesk.findMany({
      where,
      orderBy: [{ sort_order: "asc" }, { created_at: "desc" }],
      skip,
      take: opts.limit,
      include: {
        links: {
          include: { user: { select: { id: true, name: true, login: true } } }
        }
      }
    })
  ]);
  const data = rows.map((d) => {
    const role_counts = mapLinkRoleCounts(d.links);
    const breakdown = CASH_DESK_LINK_ROLES.map((role) => ({
      role,
      count: role_counts[role] ?? 0
    })).filter((x) => x.count > 0);
    return {
      id: d.id,
      name: d.name,
      timezone: d.timezone,
      sort_order: d.sort_order,
      code: d.code,
      comment: d.comment,
      latitude: d.latitude != null ? String(d.latitude) : null,
      longitude: d.longitude != null ? String(d.longitude) : null,
      is_active: d.is_active,
      is_closed: d.is_closed,
      created_at: d.created_at.toISOString(),
      user_total: d.links.length,
      role_counts,
      breakdown,
      links: d.links.map((l) => ({
        link_role: l.link_role,
        user: l.user
      }))
    };
  });
  return { data, total, page: opts.page, limit: opts.limit };
}

export async function getCashDesk(tenantId: number, id: number) {
  const d = await prisma.cashDesk.findFirst({
    where: { id, tenant_id: tenantId },
    include: {
      links: {
        include: { user: { select: { id: true, name: true, login: true, role: true } } }
      }
    }
  });
  return d;
}

export async function assertUsersFitRoles(tenantId: number, links: { user_id: number; link_role: string }[]) {
  if (!links.length) return;
  const userIds = [...new Set(links.map((l) => l.user_id))];
  const users = await prisma.user.findMany({
    where: { tenant_id: tenantId, id: { in: userIds } },
    select: { id: true, role: true }
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  for (const l of links) {
    const u = byId.get(l.user_id);
    if (!u) throw new Error("UserNotFound");
    const role = l.link_role as CashDeskLinkRole;
    if (!CASH_DESK_LINK_ROLES.includes(role)) throw new Error("InvalidLinkRole");
    const need = ROLE_FOR_LINK[role];
    if (u.role !== need) throw new Error("UserRoleMismatch");
  }
}

/** Bitta foydalanuvchini kassaga bog‘lash (tenant va rol mosligi tekshiriladi). */
export async function createCashDeskUserLink(
  tenantId: number,
  cashDeskId: number,
  userId: number,
  linkRole: CashDeskLinkRole
) {
  const desk = await prisma.cashDesk.findFirst({
    where: { id: cashDeskId, tenant_id: tenantId },
    select: { id: true }
  });
  if (!desk) throw new Error("CashDeskNotFound");
  await assertUsersFitRoles(tenantId, [{ user_id: userId, link_role: linkRole }]);
  try {
    await prisma.cashDeskUserLink.create({
      data: { cash_desk_id: cashDeskId, user_id: userId, link_role: linkRole }
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("CashDeskUserLinkExists");
    }
    throw e;
  }
}

export async function createCashDesk(
  tenantId: number,
  body: {
    name: string;
    timezone?: string;
    sort_order?: number | null;
    code?: string | null;
    comment?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    is_active?: boolean;
    is_closed?: boolean;
    links?: { user_id: number; link_role: string }[];
  }
) {
  const code = normalizeCode(body.code ?? null);
  if (code) {
    const clash = await prisma.cashDesk.findFirst({
      where: { tenant_id: tenantId, code }
    });
    if (clash) throw new Error("CodeTaken");
  }
  const links = body.links ?? [];
  await assertUsersFitRoles(tenantId, links);
  const desk = await prisma.cashDesk.create({
    data: {
      tenant_id: tenantId,
      name: body.name.trim(),
      timezone: (body.timezone ?? "Asia/Tashkent").trim().slice(0, 64),
      sort_order: body.sort_order ?? null,
      code,
      comment: body.comment?.trim() || null,
      latitude: body.latitude != null ? new Prisma.Decimal(body.latitude) : null,
      longitude: body.longitude != null ? new Prisma.Decimal(body.longitude) : null,
      is_active: body.is_active !== false,
      is_closed: body.is_closed === true,
      links: {
        create: links.map((l) => ({
          user_id: l.user_id,
          link_role: l.link_role
        }))
      }
    },
    include: { links: { include: { user: { select: { id: true, name: true, login: true } } } } }
  });
  return desk;
}

export async function patchCashDesk(
  tenantId: number,
  id: number,
  body: {
    name?: string;
    timezone?: string;
    sort_order?: number | null;
    code?: string | null;
    comment?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    is_active?: boolean;
    is_closed?: boolean;
    links?: { user_id: number; link_role: string }[];
  }
) {
  const existing = await prisma.cashDesk.findFirst({ where: { id, tenant_id: tenantId } });
  if (!existing) return null;
  const code = body.code !== undefined ? normalizeCode(body.code) : undefined;
  if (code !== undefined && code) {
    const clash = await prisma.cashDesk.findFirst({
      where: { tenant_id: tenantId, code, NOT: { id } }
    });
    if (clash) throw new Error("CodeTaken");
  }
  if (body.links) {
    await assertUsersFitRoles(tenantId, body.links);
  }
  const data: Prisma.CashDeskUpdateInput = {};
  if (body.name !== undefined) data.name = body.name.trim();
  if (body.timezone !== undefined) data.timezone = body.timezone.trim().slice(0, 64);
  if (body.sort_order !== undefined) data.sort_order = body.sort_order;
  if (code !== undefined) data.code = code;
  if (body.comment !== undefined) data.comment = body.comment?.trim() || null;
  if (body.latitude !== undefined) {
    data.latitude = body.latitude != null ? new Prisma.Decimal(body.latitude) : null;
  }
  if (body.longitude !== undefined) {
    data.longitude = body.longitude != null ? new Prisma.Decimal(body.longitude) : null;
  }
  if (body.is_active !== undefined) data.is_active = body.is_active;
  if (body.is_closed !== undefined) data.is_closed = body.is_closed;

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.cashDesk.update({ where: { id }, data });
    }
    if (body.links) {
      await tx.cashDeskUserLink.deleteMany({ where: { cash_desk_id: id } });
      if (body.links.length) {
        await tx.cashDeskUserLink.createMany({
          data: body.links.map((l) => ({
            cash_desk_id: id,
            user_id: l.user_id,
            link_role: l.link_role
          }))
        });
      }
    }
  });
  return getCashDesk(tenantId, id);
}
