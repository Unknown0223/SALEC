import type { Prisma } from "@prisma/client";
import type { ExpeditorAssignmentRules } from "../staff/staff.service";
import { parseExpeditorAssignmentRules } from "../staff/staff.service";

/** 1 = dushanba … 7 = yakshanba (visit_weekdays bilan mos) */
function weekday1To7(d: Date): number {
  const j = d.getDay();
  if (j === 0) return 7;
  return j;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function clientTerritoryBlob(c: {
  region: string | null;
  district: string | null;
  zone: string | null;
  neighborhood: string | null;
  address: string | null;
}): string {
  return [c.region, c.district, c.zone, c.neighborhood, c.address].filter(Boolean).join(" ");
}

/**
 * Barcha berilgan (bo‘sh bo‘lmagan) shartlar bajarilishi kerak.
 * Bo‘sh massiv / undefined — shu o‘qda cheklov yo‘q.
 */
export function expeditorRulesMatch(
  rules: ExpeditorAssignmentRules,
  ctx: {
    clientTags: string[];
    orderAgentId: number | null;
    warehouseId: number | null;
    agentTradeDirection: string | null;
    territoryBlob: string;
    weekday: number;
  }
): boolean {
  const pts = rules.price_types;
  if (pts?.length) {
    const tags = ctx.clientTags.map(norm).filter(Boolean);
    const ok = pts.some((p) => tags.includes(norm(p)));
    if (!ok) return false;
  }

  const aids = rules.agent_ids;
  if (aids?.length) {
    if (ctx.orderAgentId == null || !aids.includes(ctx.orderAgentId)) return false;
  }

  const wids = rules.warehouse_ids;
  if (wids?.length) {
    if (ctx.warehouseId == null || !wids.includes(ctx.warehouseId)) return false;
  }

  const tds = rules.trade_directions;
  if (tds?.length) {
    const td = norm(ctx.agentTradeDirection);
    if (!td) return false;
    if (!tds.some((x) => norm(x) === td)) return false;
  }

  const terrs = rules.territories;
  if (terrs?.length) {
    const blob = ctx.territoryBlob.toLowerCase();
    const ok = terrs.some((t) => blob.includes(norm(t)));
    if (!ok) return false;
  }

  const wdays = rules.weekdays;
  if (wdays?.length) {
    if (!wdays.includes(ctx.weekday)) return false;
  }

  return true;
}

export async function resolveAutoExpeditorUserId(
  tx: Prisma.TransactionClient,
  tenantId: number,
  params: {
    client: {
      category: string | null;
      sales_channel: string | null;
      product_category_ref: string | null;
      region: string | null;
      district: string | null;
      zone: string | null;
      neighborhood: string | null;
      address: string | null;
    };
    orderAgentId: number | null;
    warehouseId: number | null;
    at: Date;
  }
): Promise<number | null> {
  const editors = await tx.user.findMany({
    where: { tenant_id: tenantId, role: "expeditor", is_active: true, app_access: true },
    select: { id: true, expeditor_assignment_rules: true },
    orderBy: { id: "asc" }
  });

  let agentTradeDirection: string | null = null;
  if (params.orderAgentId != null) {
    const ag = await tx.user.findFirst({
      where: {
        id: params.orderAgentId,
        tenant_id: tenantId,
        role: "agent",
        is_active: true
      },
      select: { trade_direction: true }
    });
    agentTradeDirection = ag?.trade_direction ?? null;
  }

  const clientTags = [
    params.client.category,
    params.client.sales_channel,
    params.client.product_category_ref
  ].filter((x): x is string => typeof x === "string" && x.trim() !== "");

  const territoryBlob = clientTerritoryBlob(params.client);
  const weekday = weekday1To7(params.at);

  for (const e of editors) {
    const rules = parseExpeditorAssignmentRules(e.expeditor_assignment_rules);
    const keys = [
      rules.price_types?.length,
      rules.agent_ids?.length,
      rules.warehouse_ids?.length,
      rules.trade_directions?.length,
      rules.territories?.length,
      rules.weekdays?.length
    ];
    if (!keys.some(Boolean)) {
      continue;
    }
    if (
      expeditorRulesMatch(rules, {
        clientTags,
        orderAgentId: params.orderAgentId,
        warehouseId: params.warehouseId,
        agentTradeDirection,
        territoryBlob,
        weekday
      })
    ) {
      return e.id;
    }
  }

  return null;
}
