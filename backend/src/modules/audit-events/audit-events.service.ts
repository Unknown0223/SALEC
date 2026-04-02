import { prisma } from "../../config/database";

export type ListTenantAuditQuery = {
  entity_type?: string;
  entity_id?: string;
  actor_user_id?: number;
  from?: string;
  to?: string;
  page: number;
  limit: number;
};

export async function listTenantAuditEvents(tenantId: number, q: ListTenantAuditQuery) {
  const where: {
    tenant_id: number;
    entity_type?: string;
    entity_id?: string;
    actor_user_id?: number;
    created_at?: { gte?: Date; lte?: Date };
  } = { tenant_id: tenantId };

  if (q.entity_type?.trim()) {
    where.entity_type = q.entity_type.trim();
  }
  if (q.entity_id?.trim()) {
    where.entity_id = q.entity_id.trim();
  }
  if (q.actor_user_id != null && Number.isFinite(q.actor_user_id)) {
    where.actor_user_id = Math.floor(q.actor_user_id);
  }
  if (q.from?.trim() || q.to?.trim()) {
    where.created_at = {};
    if (q.from?.trim()) {
      const d = new Date(q.from.trim());
      if (!Number.isNaN(d.getTime())) {
        where.created_at.gte = d;
      }
    }
    if (q.to?.trim()) {
      const d = new Date(q.to.trim());
      if (!Number.isNaN(d.getTime())) {
        where.created_at.lte = d;
      }
    }
    if (Object.keys(where.created_at).length === 0) {
      delete where.created_at;
    }
  }

  const [total, rows] = await Promise.all([
    prisma.tenantAuditEvent.count({ where }),
    prisma.tenantAuditEvent.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      include: {
        actor: { select: { login: true } }
      }
    })
  ]);

  return {
    data: rows.map((r) => ({
      id: r.id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      action: r.action,
      payload: r.payload,
      actor_user_id: r.actor_user_id,
      actor_login: r.actor?.login ?? null,
      created_at: r.created_at.toISOString()
    })),
    total,
    page: q.page,
    limit: q.limit
  };
}
