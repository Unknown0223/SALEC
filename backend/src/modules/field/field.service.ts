import { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import { prisma } from "../../config/database";

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

/** --- Agent visits --- */
export async function listAgentVisits(
  tenantId: number,
  opts: { agent_id?: number; client_id?: number; page: number; limit: number }
) {
  const where: Prisma.AgentVisitWhereInput = { tenant_id: tenantId };
  if (opts.agent_id) where.agent_id = opts.agent_id;
  if (opts.client_id) where.client_id = opts.client_id;
  const skip = (opts.page - 1) * opts.limit;
  const [total, rows] = await Promise.all([
    prisma.agentVisit.count({ where }),
    prisma.agentVisit.findMany({
      where,
      orderBy: { checked_in_at: "desc" },
      skip,
      take: opts.limit,
      include: {
        agent: { select: { id: true, name: true, login: true } },
        client: { select: { id: true, name: true } }
      }
    })
  ]);
  return {
    data: rows.map(serializeVisit),
    total,
    page: opts.page,
    limit: opts.limit
  };
}

function serializeVisit(v: {
  id: number;
  checked_in_at: Date;
  checked_out_at: Date | null;
  latitude: Prisma.Decimal | null;
  longitude: Prisma.Decimal | null;
  notes: string | null;
  agent: { id: number; name: string; login: string };
  client: { id: number; name: string } | null;
}) {
  return {
    id: v.id,
    checked_in_at: v.checked_in_at.toISOString(),
    checked_out_at: v.checked_out_at?.toISOString() ?? null,
    latitude: v.latitude != null ? String(v.latitude) : null,
    longitude: v.longitude != null ? String(v.longitude) : null,
    notes: v.notes,
    agent: v.agent,
    client: v.client
  };
}

const VISITS_EXPORT_MAX = 10_000;

export async function exportAgentVisitsXlsx(
  tenantId: number,
  opts: { agent_id?: number; client_id?: number }
): Promise<Buffer> {
  const where: Prisma.AgentVisitWhereInput = { tenant_id: tenantId };
  if (opts.agent_id) where.agent_id = opts.agent_id;
  if (opts.client_id) where.client_id = opts.client_id;

  const rows = await prisma.agentVisit.findMany({
    where,
    orderBy: { checked_in_at: "desc" },
    take: VISITS_EXPORT_MAX,
    include: {
      agent: { select: { id: true, name: true, login: true } },
      client: { select: { id: true, name: true } }
    }
  });

  const aoa: (string | number)[][] = [
    [
      "ID",
      "Kirish (UTC)",
      "Chiqish (UTC)",
      "Agent ID",
      "Agent",
      "Login",
      "Mijoz ID",
      "Mijoz",
      "Kenglik",
      "Uzunlik",
      "Izoh",
      "Holat"
    ]
  ];
  for (const v of rows) {
    aoa.push([
      v.id,
      v.checked_in_at.toISOString(),
      v.checked_out_at?.toISOString() ?? "",
      v.agent_id,
      v.agent.name,
      v.agent.login,
      v.client_id ?? "",
      v.client?.name ?? "",
      v.latitude != null ? String(v.latitude) : "",
      v.longitude != null ? String(v.longitude) : "",
      v.notes ?? "",
      v.checked_out_at ? "Yakunlangan" : "Faol"
    ]);
  }

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Tashriflar");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function createAgentVisit(
  tenantId: number,
  body: {
    agent_id: number;
    client_id?: number | null;
    latitude?: number | null;
    longitude?: number | null;
    notes?: string | null;
  }
) {
  const agent = await prisma.user.findFirst({
    where: { id: body.agent_id, tenant_id: tenantId, role: "agent", is_active: true },
    select: { id: true }
  });
  if (!agent) throw new Error("AgentNotFound");
  if (body.client_id) {
    const c = await prisma.client.findFirst({
      where: { id: body.client_id, tenant_id: tenantId },
      select: { id: true }
    });
    if (!c) throw new Error("ClientNotFound");
  }
  const row = await prisma.agentVisit.create({
    data: {
      tenant_id: tenantId,
      agent_id: body.agent_id,
      client_id: body.client_id ?? null,
      latitude:
        body.latitude != null && Number.isFinite(body.latitude)
          ? new Prisma.Decimal(body.latitude)
          : null,
      longitude:
        body.longitude != null && Number.isFinite(body.longitude)
          ? new Prisma.Decimal(body.longitude)
          : null,
      notes: body.notes?.trim() || null
    },
    include: {
      agent: { select: { id: true, name: true, login: true } },
      client: { select: { id: true, name: true } }
    }
  });
  return serializeVisit(row);
}

export async function checkoutAgentVisit(tenantId: number, id: number) {
  const row = await prisma.agentVisit.findFirst({ where: { id, tenant_id: tenantId } });
  if (!row) return null;
  if (row.checked_out_at) throw new Error("AlreadyCheckedOut");
  const updated = await prisma.agentVisit.update({
    where: { id },
    data: { checked_out_at: new Date() },
    include: {
      agent: { select: { id: true, name: true, login: true } },
      client: { select: { id: true, name: true } }
    }
  });
  return serializeVisit(updated);
}

// ── Agent GPS pings (trek) ───────────────────────────────────────────────

export type AgentLocationPingRow = {
  id: number;
  agent_id: number;
  latitude: string;
  longitude: string;
  accuracy_meters: number | null;
  recorded_at: string;
};

export async function recordAgentLocationPing(
  tenantId: number,
  agentId: number,
  input: { latitude: number; longitude: number; accuracy_meters?: number | null }
): Promise<AgentLocationPingRow> {
  const agent = await prisma.user.findFirst({
    where: { id: agentId, tenant_id: tenantId, role: "agent", is_active: true },
    select: { id: true }
  });
  if (!agent) throw new Error("AgentNotFound");

  const row = await prisma.agentLocationPing.create({
    data: {
      tenant_id: tenantId,
      agent_id: agentId,
      latitude: new Prisma.Decimal(input.latitude),
      longitude: new Prisma.Decimal(input.longitude),
      accuracy_meters:
        input.accuracy_meters != null && Number.isFinite(input.accuracy_meters)
          ? input.accuracy_meters
          : null
    }
  });
  return {
    id: row.id,
    agent_id: row.agent_id,
    latitude: row.latitude.toString(),
    longitude: row.longitude.toString(),
    accuracy_meters: row.accuracy_meters,
    recorded_at: row.recorded_at.toISOString()
  };
}

export async function listAgentLocationPings(
  tenantId: number,
  opts: { agent_id: number; from: Date; to: Date; limit: number }
): Promise<{ data: AgentLocationPingRow[]; truncated: boolean }> {
  const take = Math.min(Math.max(opts.limit, 1), 5000);
  const rows = await prisma.agentLocationPing.findMany({
    where: {
      tenant_id: tenantId,
      agent_id: opts.agent_id,
      recorded_at: { gte: opts.from, lte: opts.to }
    },
    orderBy: { recorded_at: "asc" },
    take: take + 1
  });
  const truncated = rows.length > take;
  const sliced = truncated ? rows.slice(0, take) : rows;
  return {
    data: sliced.map((r) => ({
      id: r.id,
      agent_id: r.agent_id,
      latitude: r.latitude.toString(),
      longitude: r.longitude.toString(),
      accuracy_meters: r.accuracy_meters,
      recorded_at: r.recorded_at.toISOString()
    })),
    truncated
  };
}

/** --- Tasks --- */
export async function listTenantTasks(
  tenantId: number,
  opts: { status?: string; assignee_user_id?: number; page: number; limit: number }
) {
  const where: Prisma.TenantTaskWhereInput = { tenant_id: tenantId };
  if (opts.status) where.status = opts.status;
  if (opts.assignee_user_id) where.assignee_user_id = opts.assignee_user_id;
  const skip = (opts.page - 1) * opts.limit;
  const [total, rows] = await Promise.all([
    prisma.tenantTask.count({ where }),
    prisma.tenantTask.findMany({
      where,
      orderBy: [{ due_at: "asc" }, { created_at: "desc" }],
      skip,
      take: opts.limit,
      include: {
        assignee: { select: { id: true, name: true, login: true } },
        created_by: { select: { id: true, name: true, login: true } }
      }
    })
  ]);
  return {
    data: rows.map(serializeTask),
    total,
    page: opts.page,
    limit: opts.limit
  };
}

function serializeTask(t: {
  id: number;
  title: string;
  task_type_ref: string | null;
  description: string | null;
  status: string;
  priority: string;
  due_at: Date | null;
  created_at: Date;
  updated_at: Date;
  assignee: { id: number; name: string; login: string } | null;
  created_by: { id: number; name: string; login: string } | null;
}) {
  return {
    id: t.id,
    title: t.title,
    task_type_ref: t.task_type_ref ?? null,
    description: t.description,
    status: t.status,
    priority: t.priority,
    due_at: t.due_at?.toISOString() ?? null,
    created_at: t.created_at.toISOString(),
    updated_at: t.updated_at.toISOString(),
    assignee: t.assignee,
    created_by: t.created_by
  };
}

export async function createTenantTask(
  tenantId: number,
  actorUserId: number | undefined,
  body: {
    title: string;
    task_type_ref?: string | null;
    description?: string | null;
    priority?: string;
    due_at?: string | null;
    assignee_user_id?: number | null;
  }
) {
  if (body.assignee_user_id) {
    const u = await prisma.user.findFirst({
      where: { id: body.assignee_user_id, tenant_id: tenantId, is_active: true },
      select: { id: true }
    });
    if (!u) throw new Error("AssigneeNotFound");
  }
  const ttr =
    body.task_type_ref != null && String(body.task_type_ref).trim()
      ? String(body.task_type_ref).trim().slice(0, 128)
      : null;
  const row = await prisma.tenantTask.create({
    data: {
      tenant_id: tenantId,
      title: body.title.trim().slice(0, 500),
      task_type_ref: ttr,
      description: body.description?.trim() || null,
      priority: (body.priority ?? "normal").slice(0, 16),
      due_at: body.due_at ? new Date(body.due_at) : null,
      assignee_user_id: body.assignee_user_id ?? null,
      created_by_user_id: actorUserId
    },
    include: {
      assignee: { select: { id: true, name: true, login: true } },
      created_by: { select: { id: true, name: true, login: true } }
    }
  });
  return serializeTask(row);
}

export async function getTenantTask(tenantId: number, id: number) {
  const row = await prisma.tenantTask.findFirst({
    where: { id, tenant_id: tenantId },
    include: {
      assignee: { select: { id: true, name: true, login: true } },
      created_by: { select: { id: true, name: true, login: true } }
    }
  });
  return row ? serializeTask(row) : null;
}

export async function patchTenantTask(
  tenantId: number,
  id: number,
  body: Partial<{
    title: string;
    task_type_ref: string | null;
    description: string | null;
    status: string;
    priority: string;
    due_at: string | null;
    assignee_user_id: number | null;
  }>
) {
  const existing = await prisma.tenantTask.findFirst({ where: { id, tenant_id: tenantId } });
  if (!existing) return null;
  if (body.assignee_user_id) {
    const u = await prisma.user.findFirst({
      where: { id: body.assignee_user_id, tenant_id: tenantId, is_active: true },
      select: { id: true }
    });
    if (!u) throw new Error("AssigneeNotFound");
  }
  const data: Prisma.TenantTaskUpdateInput = {};
  if (body.title !== undefined) data.title = body.title.trim().slice(0, 500);
  if (body.task_type_ref !== undefined) {
    data.task_type_ref =
      body.task_type_ref != null && String(body.task_type_ref).trim()
        ? String(body.task_type_ref).trim().slice(0, 128)
        : null;
  }
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.status !== undefined) data.status = body.status.slice(0, 32);
  if (body.priority !== undefined) data.priority = body.priority.slice(0, 16);
  if (body.due_at !== undefined) data.due_at = body.due_at ? new Date(body.due_at) : null;
  if (body.assignee_user_id !== undefined) {
    if (body.assignee_user_id === null) {
      data.assignee = { disconnect: true };
    } else {
      data.assignee = { connect: { id: body.assignee_user_id } };
    }
  }
  const row = await prisma.tenantTask.update({
    where: { id },
    data,
    include: {
      assignee: { select: { id: true, name: true, login: true } },
      created_by: { select: { id: true, name: true, login: true } }
    }
  });
  return serializeTask(row);
}

/** --- Route day --- */
export async function getAgentRouteDay(tenantId: number, agentId: number, routeDateIso: string) {
  const d = new Date(routeDateIso);
  if (Number.isNaN(d.getTime())) return null;
  const day = startOfUtcDay(d);
  const row = await prisma.agentRouteDay.findUnique({
    where: {
      tenant_id_agent_id_route_date: { tenant_id: tenantId, agent_id: agentId, route_date: day }
    },
    include: { agent: { select: { id: true, name: true, login: true } } }
  });
  return row ? serializeRouteDay(row) : null;
}

function serializeRouteDay(r: {
  id: number;
  route_date: Date;
  stops: Prisma.JsonValue;
  notes: string | null;
  updated_at: Date;
  agent: { id: number; name: string; login: string };
}) {
  return {
    id: r.id,
    route_date: r.route_date.toISOString().slice(0, 10),
    stops: r.stops,
    notes: r.notes,
    updated_at: r.updated_at.toISOString(),
    agent: r.agent
  };
}

export async function upsertAgentRouteDay(
  tenantId: number,
  body: {
    agent_id: number;
    route_date: string;
    stops: unknown;
    notes?: string | null;
  }
) {
  const agent = await prisma.user.findFirst({
    where: { id: body.agent_id, tenant_id: tenantId, role: "agent", is_active: true },
    select: { id: true }
  });
  if (!agent) throw new Error("AgentNotFound");
  const d = new Date(body.route_date);
  if (Number.isNaN(d.getTime())) throw new Error("InvalidDate");
  const day = startOfUtcDay(d);
  const stops = Array.isArray(body.stops) ? body.stops : [];
  const row = await prisma.agentRouteDay.upsert({
    where: {
      tenant_id_agent_id_route_date: { tenant_id: tenantId, agent_id: body.agent_id, route_date: day }
    },
    create: {
      tenant_id: tenantId,
      agent_id: body.agent_id,
      route_date: day,
      stops: stops as Prisma.InputJsonValue,
      notes: body.notes?.trim() || null
    },
    update: {
      stops: stops as Prisma.InputJsonValue,
      notes: body.notes !== undefined ? body.notes?.trim() || null : undefined
    },
    include: { agent: { select: { id: true, name: true, login: true } } }
  });
  return serializeRouteDay(row);
}

export async function listAgentRouteDays(
  tenantId: number,
  opts: { agent_id?: number; from?: string; to?: string; page: number; limit: number }
) {
  const where: Prisma.AgentRouteDayWhereInput = { tenant_id: tenantId };
  if (opts.agent_id) where.agent_id = opts.agent_id;
  if (opts.from || opts.to) {
    where.route_date = {};
    if (opts.from) {
      const f = new Date(opts.from);
      if (!Number.isNaN(f.getTime())) (where.route_date as Prisma.DateTimeFilter).gte = startOfUtcDay(f);
    }
    if (opts.to) {
      const t = new Date(opts.to);
      if (!Number.isNaN(t.getTime())) {
        const end = startOfUtcDay(t);
        end.setUTCDate(end.getUTCDate() + 1);
        (where.route_date as Prisma.DateTimeFilter).lt = end;
      }
    }
  }
  const skip = (opts.page - 1) * opts.limit;
  const [total, rows] = await Promise.all([
    prisma.agentRouteDay.count({ where }),
    prisma.agentRouteDay.findMany({
      where,
      orderBy: { route_date: "desc" },
      skip,
      take: opts.limit,
      include: { agent: { select: { id: true, name: true, login: true } } }
    })
  ]);
  return {
    data: rows.map(serializeRouteDay),
    total,
    page: opts.page,
    limit: opts.limit
  };
}
