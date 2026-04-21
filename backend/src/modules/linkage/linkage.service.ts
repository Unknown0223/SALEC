import { prisma } from "../../config/database";

export type LinkageSelectedMasters = {
  selected_agent_id?: number | null;
  selected_warehouse_id?: number | null;
  selected_cash_desk_id?: number | null;
  selected_expeditor_user_id?: number | null;
};

export type LinkageConstraintScope = {
  selected_agent_id: number | null;
  selected_warehouse_id: number | null;
  selected_cash_desk_id: number | null;
  selected_expeditor_user_id: number | null;
  constrained: boolean;
  client_ids: number[];
  warehouse_ids: number[];
  cash_desk_ids: number[];
  expeditor_ids: number[];
  product_ids: number[];
  product_restricted: boolean;
};

function parseEntitledProductIds(ent: unknown): { ids: number[]; restricted: boolean } {
  if (ent == null || typeof ent !== "object" || Array.isArray(ent)) {
    return { ids: [], restricted: false };
  }
  const obj = ent as Record<string, unknown>;
  const rulesRaw = obj.product_rules;
  if (!Array.isArray(rulesRaw) || rulesRaw.length === 0) {
    return { ids: [], restricted: false };
  }
  const ids = new Set<number>();
  let restricted = false;
  for (const r of rulesRaw) {
    if (r == null || typeof r !== "object" || Array.isArray(r)) continue;
    const row = r as Record<string, unknown>;
    const all = row.all === true;
    if (all) {
      restricted = true;
      continue;
    }
    const pids = Array.isArray(row.product_ids)
      ? row.product_ids
          .map((x) => (typeof x === "number" ? x : Number(x)))
          .filter((n) => Number.isInteger(n) && n > 0)
      : [];
    if (pids.length > 0) restricted = true;
    for (const id of pids) ids.add(id);
  }
  return { ids: [...ids], restricted };
}

function normalizeSelectedId(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw) || raw < 1) return null;
  return Math.floor(raw);
}

function intersectNumberSets(sets: Array<Set<number>>): number[] {
  if (sets.length === 0) return [];
  const [first, ...rest] = sets;
  const out: number[] = [];
  for (const value of first) {
    if (rest.every((s) => s.has(value))) out.push(value);
  }
  return out;
}

async function resolveByAgent(
  tenantId: number,
  selectedAgentId: number
): Promise<{
  client_ids: Set<number>;
  warehouse_ids: Set<number>;
  cash_desk_ids: Set<number>;
  expeditor_ids: Set<number>;
  product_ids: Set<number>;
  product_restricted: boolean;
}> {
  const [agentRow, clientsByPrimary, clientsBySlots, whLinks, cashLinks, expByClientSlots, expByOrders] =
    await Promise.all([
      prisma.user.findFirst({
        where: { tenant_id: tenantId, id: selectedAgentId, role: "agent", is_active: true },
        select: { id: true, agent_entitlements: true }
      }),
      prisma.client.findMany({
        where: {
          tenant_id: tenantId,
          merged_into_client_id: null,
          agent_id: selectedAgentId
        },
        select: { id: true }
      }),
      prisma.clientAgentAssignment.findMany({
        where: { tenant_id: tenantId, agent_id: selectedAgentId },
        distinct: ["client_id"],
        select: { client_id: true }
      }),
      prisma.warehouseUserLink.findMany({
        where: { user_id: selectedAgentId, warehouse: { tenant_id: tenantId } },
        distinct: ["warehouse_id"],
        select: { warehouse_id: true }
      }),
      prisma.cashDeskUserLink.findMany({
        where: { user_id: selectedAgentId, cash_desk: { tenant_id: tenantId, is_active: true } },
        distinct: ["cash_desk_id"],
        select: { cash_desk_id: true }
      }),
      prisma.clientAgentAssignment.findMany({
        where: { tenant_id: tenantId, agent_id: selectedAgentId, expeditor_user_id: { not: null } },
        distinct: ["expeditor_user_id"],
        select: { expeditor_user_id: true }
      }),
      prisma.order.findMany({
        where: { tenant_id: tenantId, agent_id: selectedAgentId, expeditor_user_id: { not: null } },
        distinct: ["expeditor_user_id"],
        select: { expeditor_user_id: true }
      })
    ]);

  const client_ids = new Set<number>(clientsByPrimary.map((r) => r.id));
  for (const r of clientsBySlots) client_ids.add(r.client_id);
  const warehouse_ids = new Set<number>(whLinks.map((r) => r.warehouse_id));
  const cash_desk_ids = new Set<number>(cashLinks.map((r) => r.cash_desk_id));
  const expeditor_ids = new Set<number>();
  for (const r of expByClientSlots) {
    if (r.expeditor_user_id != null) expeditor_ids.add(r.expeditor_user_id);
  }
  for (const r of expByOrders) {
    if (r.expeditor_user_id != null) expeditor_ids.add(r.expeditor_user_id);
  }

  if (!agentRow) {
    return {
      client_ids,
      warehouse_ids,
      cash_desk_ids,
      expeditor_ids,
      product_ids: new Set<number>(),
      product_restricted: false
    };
  }

  const { ids: entitledProductIds, restricted: product_restricted } = parseEntitledProductIds(
    agentRow.agent_entitlements
  );
  let product_ids = entitledProductIds;
  if (product_restricted && product_ids.length === 0) {
    const categoryIds = Array.isArray((agentRow.agent_entitlements as Record<string, unknown>)?.product_rules)
      ? ((agentRow.agent_entitlements as Record<string, unknown>).product_rules as unknown[])
          .map((r) =>
            r != null && typeof r === "object" && !Array.isArray(r)
              ? Number((r as Record<string, unknown>).category_id)
              : NaN
          )
          .filter((n) => Number.isInteger(n) && n > 0)
      : [];
    if (categoryIds.length > 0) {
      const rows = await prisma.product.findMany({
        where: { tenant_id: tenantId, category_id: { in: categoryIds } },
        select: { id: true }
      });
      product_ids = rows.map((r) => r.id);
    }
  }

  return {
    client_ids,
    warehouse_ids,
    cash_desk_ids,
    expeditor_ids,
    product_ids: new Set<number>(product_ids),
    product_restricted
  };
}

async function resolveByWarehouse(
  tenantId: number,
  selectedWarehouseId: number
): Promise<{
  client_ids: Set<number>;
  warehouse_ids: Set<number>;
  cash_desk_ids: Set<number>;
  expeditor_ids: Set<number>;
  product_ids: Set<number>;
}> {
  const [warehouse, links, clientByOrders, productByStock] = await Promise.all([
    prisma.warehouse.findFirst({
      where: { id: selectedWarehouseId, tenant_id: tenantId },
      select: { id: true }
    }),
    prisma.warehouseUserLink.findMany({
      where: { warehouse_id: selectedWarehouseId },
      select: { user_id: true, user: { select: { role: true, id: true } } }
    }),
    prisma.order.findMany({
      where: { tenant_id: tenantId, warehouse_id: selectedWarehouseId },
      distinct: ["client_id"],
      select: { client_id: true }
    }),
    prisma.stock.findMany({
      where: { tenant_id: tenantId, warehouse_id: selectedWarehouseId },
      distinct: ["product_id"],
      select: { product_id: true }
    })
  ]);
  if (!warehouse) {
    return {
      client_ids: new Set<number>(),
      warehouse_ids: new Set<number>(),
      cash_desk_ids: new Set<number>(),
      expeditor_ids: new Set<number>(),
      product_ids: new Set<number>()
    };
  }
  const userIds = links.map((r) => r.user_id);
  const agentIds = links.filter((r) => r.user.role === "agent").map((r) => r.user.id);
  const expeditor_ids = new Set<number>(
    links.filter((r) => r.user.role === "expeditor").map((r) => r.user.id)
  );

  const [cashLinks, clientsPrimary, clientsSlots, expFromSlots, expFromOrders] = await Promise.all([
    userIds.length
      ? prisma.cashDeskUserLink.findMany({
          where: { user_id: { in: userIds }, cash_desk: { tenant_id: tenantId, is_active: true } },
          distinct: ["cash_desk_id"],
          select: { cash_desk_id: true }
        })
      : Promise.resolve([]),
    agentIds.length
      ? prisma.client.findMany({
          where: { tenant_id: tenantId, merged_into_client_id: null, agent_id: { in: agentIds } },
          select: { id: true }
        })
      : Promise.resolve([]),
    agentIds.length
      ? prisma.clientAgentAssignment.findMany({
          where: { tenant_id: tenantId, agent_id: { in: agentIds } },
          distinct: ["client_id"],
          select: { client_id: true }
        })
      : Promise.resolve([]),
    agentIds.length
      ? prisma.clientAgentAssignment.findMany({
          where: { tenant_id: tenantId, agent_id: { in: agentIds }, expeditor_user_id: { not: null } },
          distinct: ["expeditor_user_id"],
          select: { expeditor_user_id: true }
        })
      : Promise.resolve([]),
    agentIds.length
      ? prisma.order.findMany({
          where: { tenant_id: tenantId, agent_id: { in: agentIds }, expeditor_user_id: { not: null } },
          distinct: ["expeditor_user_id"],
          select: { expeditor_user_id: true }
        })
      : Promise.resolve([])
  ]);

  const client_ids = new Set<number>(clientByOrders.map((r) => r.client_id));
  for (const r of clientsPrimary) client_ids.add(r.id);
  for (const r of clientsSlots) client_ids.add(r.client_id);
  for (const r of expFromSlots) if (r.expeditor_user_id != null) expeditor_ids.add(r.expeditor_user_id);
  for (const r of expFromOrders) if (r.expeditor_user_id != null) expeditor_ids.add(r.expeditor_user_id);

  return {
    client_ids,
    warehouse_ids: new Set<number>([selectedWarehouseId]),
    cash_desk_ids: new Set<number>(cashLinks.map((r) => r.cash_desk_id)),
    expeditor_ids,
    product_ids: new Set<number>(productByStock.map((r) => r.product_id))
  };
}

async function resolveByCashDesk(
  tenantId: number,
  selectedCashDeskId: number
): Promise<{
  client_ids: Set<number>;
  warehouse_ids: Set<number>;
  cash_desk_ids: Set<number>;
  expeditor_ids: Set<number>;
  product_ids: Set<number>;
}> {
  const [cashDesk, links, clientsByPayments] = await Promise.all([
    prisma.cashDesk.findFirst({
      where: { id: selectedCashDeskId, tenant_id: tenantId, is_active: true },
      select: { id: true }
    }),
    prisma.cashDeskUserLink.findMany({
      where: { cash_desk_id: selectedCashDeskId },
      select: { user_id: true, user: { select: { role: true, id: true } } }
    }),
    prisma.payment.findMany({
      where: { tenant_id: tenantId, cash_desk_id: selectedCashDeskId },
      distinct: ["client_id"],
      select: { client_id: true }
    })
  ]);
  if (!cashDesk) {
    return {
      client_ids: new Set<number>(),
      warehouse_ids: new Set<number>(),
      cash_desk_ids: new Set<number>(),
      expeditor_ids: new Set<number>(),
      product_ids: new Set<number>()
    };
  }
  const userIds = links.map((r) => r.user_id);
  const agentIds = links.filter((r) => r.user.role === "agent").map((r) => r.user.id);
  const expeditor_ids = new Set<number>(
    links.filter((r) => r.user.role === "expeditor").map((r) => r.user.id)
  );

  const [whLinks, clientsPrimary, clientsSlots, expFromSlots, expFromOrders] = await Promise.all([
    userIds.length
      ? prisma.warehouseUserLink.findMany({
          where: { user_id: { in: userIds }, warehouse: { tenant_id: tenantId, is_active: true } },
          distinct: ["warehouse_id"],
          select: { warehouse_id: true }
        })
      : Promise.resolve([]),
    agentIds.length
      ? prisma.client.findMany({
          where: { tenant_id: tenantId, merged_into_client_id: null, agent_id: { in: agentIds } },
          select: { id: true }
        })
      : Promise.resolve([]),
    agentIds.length
      ? prisma.clientAgentAssignment.findMany({
          where: { tenant_id: tenantId, agent_id: { in: agentIds } },
          distinct: ["client_id"],
          select: { client_id: true }
        })
      : Promise.resolve([]),
    agentIds.length
      ? prisma.clientAgentAssignment.findMany({
          where: { tenant_id: tenantId, agent_id: { in: agentIds }, expeditor_user_id: { not: null } },
          distinct: ["expeditor_user_id"],
          select: { expeditor_user_id: true }
        })
      : Promise.resolve([]),
    agentIds.length
      ? prisma.order.findMany({
          where: { tenant_id: tenantId, agent_id: { in: agentIds }, expeditor_user_id: { not: null } },
          distinct: ["expeditor_user_id"],
          select: { expeditor_user_id: true }
        })
      : Promise.resolve([])
  ]);

  const client_ids = new Set<number>(clientsByPayments.map((r) => r.client_id));
  for (const r of clientsPrimary) client_ids.add(r.id);
  for (const r of clientsSlots) client_ids.add(r.client_id);
  for (const r of expFromSlots) if (r.expeditor_user_id != null) expeditor_ids.add(r.expeditor_user_id);
  for (const r of expFromOrders) if (r.expeditor_user_id != null) expeditor_ids.add(r.expeditor_user_id);

  return {
    client_ids,
    warehouse_ids: new Set<number>(whLinks.map((r) => r.warehouse_id)),
    cash_desk_ids: new Set<number>([selectedCashDeskId]),
    expeditor_ids,
    product_ids: new Set<number>()
  };
}

async function resolveByExpeditor(
  tenantId: number,
  selectedExpeditorUserId: number
): Promise<{
  client_ids: Set<number>;
  warehouse_ids: Set<number>;
  cash_desk_ids: Set<number>;
  expeditor_ids: Set<number>;
  product_ids: Set<number>;
}> {
  const [expeditor, clientsByAssign, clientsByOrders, agentsByAssign, agentsByOrders, whLinks, cashLinks, productByOrders] =
    await Promise.all([
      prisma.user.findFirst({
        where: { tenant_id: tenantId, id: selectedExpeditorUserId, role: "expeditor", is_active: true },
        select: { id: true }
      }),
      prisma.clientAgentAssignment.findMany({
        where: { tenant_id: tenantId, expeditor_user_id: selectedExpeditorUserId },
        distinct: ["client_id"],
        select: { client_id: true }
      }),
      prisma.order.findMany({
        where: { tenant_id: tenantId, expeditor_user_id: selectedExpeditorUserId },
        distinct: ["client_id"],
        select: { client_id: true }
      }),
      prisma.clientAgentAssignment.findMany({
        where: {
          tenant_id: tenantId,
          expeditor_user_id: selectedExpeditorUserId,
          agent_id: { not: null }
        },
        distinct: ["agent_id"],
        select: { agent_id: true }
      }),
      prisma.order.findMany({
        where: { tenant_id: tenantId, expeditor_user_id: selectedExpeditorUserId, agent_id: { not: null } },
        distinct: ["agent_id"],
        select: { agent_id: true }
      }),
      prisma.warehouseUserLink.findMany({
        where: { user_id: selectedExpeditorUserId, warehouse: { tenant_id: tenantId, is_active: true } },
        distinct: ["warehouse_id"],
        select: { warehouse_id: true }
      }),
      prisma.cashDeskUserLink.findMany({
        where: { user_id: selectedExpeditorUserId, cash_desk: { tenant_id: tenantId, is_active: true } },
        distinct: ["cash_desk_id"],
        select: { cash_desk_id: true }
      }),
      prisma.orderItem.findMany({
        where: { order: { tenant_id: tenantId, expeditor_user_id: selectedExpeditorUserId } },
        distinct: ["product_id"],
        select: { product_id: true }
      })
    ]);
  if (!expeditor) {
    return {
      client_ids: new Set<number>(),
      warehouse_ids: new Set<number>(),
      cash_desk_ids: new Set<number>(),
      expeditor_ids: new Set<number>(),
      product_ids: new Set<number>()
    };
  }
  const agentIds = [
    ...agentsByAssign.map((r) => r.agent_id).filter((n): n is number => n != null),
    ...agentsByOrders.map((r) => r.agent_id).filter((n): n is number => n != null)
  ];
  const uniqueAgentIds = [...new Set(agentIds)];
  const [clientsPrimary, clientsSlots, whByAgent, cashByAgent] = await Promise.all([
    uniqueAgentIds.length
      ? prisma.client.findMany({
          where: { tenant_id: tenantId, merged_into_client_id: null, agent_id: { in: uniqueAgentIds } },
          select: { id: true }
        })
      : Promise.resolve([]),
    uniqueAgentIds.length
      ? prisma.clientAgentAssignment.findMany({
          where: { tenant_id: tenantId, agent_id: { in: uniqueAgentIds } },
          distinct: ["client_id"],
          select: { client_id: true }
        })
      : Promise.resolve([]),
    uniqueAgentIds.length
      ? prisma.warehouseUserLink.findMany({
          where: { user_id: { in: uniqueAgentIds }, warehouse: { tenant_id: tenantId, is_active: true } },
          distinct: ["warehouse_id"],
          select: { warehouse_id: true }
        })
      : Promise.resolve([]),
    uniqueAgentIds.length
      ? prisma.cashDeskUserLink.findMany({
          where: { user_id: { in: uniqueAgentIds }, cash_desk: { tenant_id: tenantId, is_active: true } },
          distinct: ["cash_desk_id"],
          select: { cash_desk_id: true }
        })
      : Promise.resolve([])
  ]);

  const client_ids = new Set<number>(clientsByAssign.map((r) => r.client_id));
  for (const r of clientsByOrders) client_ids.add(r.client_id);
  for (const r of clientsPrimary) client_ids.add(r.id);
  for (const r of clientsSlots) client_ids.add(r.client_id);
  const warehouse_ids = new Set<number>(whLinks.map((r) => r.warehouse_id));
  for (const r of whByAgent) warehouse_ids.add(r.warehouse_id);
  const cash_desk_ids = new Set<number>(cashLinks.map((r) => r.cash_desk_id));
  for (const r of cashByAgent) cash_desk_ids.add(r.cash_desk_id);

  return {
    client_ids,
    warehouse_ids,
    cash_desk_ids,
    expeditor_ids: new Set<number>([selectedExpeditorUserId]),
    product_ids: new Set<number>(productByOrders.map((r) => r.product_id))
  };
}

export function parseSelectedMastersFromQuery(query: Record<string, unknown>): LinkageSelectedMasters {
  const parseOptionalPositiveInt = (raw: unknown): number | undefined => {
    if (raw == null) return undefined;
    const asString = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw : "";
    if (!asString.trim()) return undefined;
    const n = Number.parseInt(asString.trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  return {
    selected_agent_id: parseOptionalPositiveInt(query.selected_agent_id),
    selected_warehouse_id: parseOptionalPositiveInt(query.selected_warehouse_id),
    selected_cash_desk_id: parseOptionalPositiveInt(query.selected_cash_desk_id),
    selected_expeditor_user_id: parseOptionalPositiveInt(query.selected_expeditor_user_id)
  };
}

export async function resolveConstraintScope(
  tenantId: number,
  selected: LinkageSelectedMasters
): Promise<LinkageConstraintScope> {
  const selected_agent_id = normalizeSelectedId(selected.selected_agent_id);
  const selected_warehouse_id = normalizeSelectedId(selected.selected_warehouse_id);
  const selected_cash_desk_id = normalizeSelectedId(selected.selected_cash_desk_id);
  const selected_expeditor_user_id = normalizeSelectedId(selected.selected_expeditor_user_id);

  const constrained =
    selected_agent_id != null ||
    selected_warehouse_id != null ||
    selected_cash_desk_id != null ||
    selected_expeditor_user_id != null;

  if (!constrained) {
    return {
      selected_agent_id,
      selected_warehouse_id,
      selected_cash_desk_id,
      selected_expeditor_user_id,
      constrained: false,
      client_ids: [],
      warehouse_ids: [],
      cash_desk_ids: [],
      expeditor_ids: [],
      product_ids: [],
      product_restricted: false
    };
  }

  const scoped = await Promise.all([
    selected_agent_id != null ? resolveByAgent(tenantId, selected_agent_id) : null,
    selected_warehouse_id != null ? resolveByWarehouse(tenantId, selected_warehouse_id) : null,
    selected_cash_desk_id != null ? resolveByCashDesk(tenantId, selected_cash_desk_id) : null,
    selected_expeditor_user_id != null ? resolveByExpeditor(tenantId, selected_expeditor_user_id) : null
  ]);
  const scopes = scoped.filter((s): s is NonNullable<(typeof scoped)[number]> => s != null);
  const client_ids = intersectNumberSets(scopes.map((s) => s.client_ids));
  const warehouse_ids = intersectNumberSets(scopes.map((s) => s.warehouse_ids));
  const cash_desk_ids = intersectNumberSets(scopes.map((s) => s.cash_desk_ids));
  const expeditor_ids = intersectNumberSets(scopes.map((s) => s.expeditor_ids));
  const product_ids = intersectNumberSets(scopes.map((s) => s.product_ids));
  const product_restricted =
    scopes.some((s) => "product_restricted" in s && Boolean((s as { product_restricted?: boolean }).product_restricted)) ||
    scopes.some((s) => s.product_ids.size > 0);

  return {
    selected_agent_id,
    selected_warehouse_id,
    selected_cash_desk_id,
    selected_expeditor_user_id,
    constrained: true,
    client_ids,
    warehouse_ids,
    cash_desk_ids,
    expeditor_ids,
    product_ids,
    product_restricted
  };
}
