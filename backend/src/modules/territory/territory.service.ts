import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validatePolygon(polygon: unknown): { lat: number; lng: number }[] {
  if (!Array.isArray(polygon) || polygon.length < 3) {
    throw new Error("Polygon requires at least 3 points");
  }
  const pts: { lat: number; lng: number }[] = [];
  for (const p of polygon) {
    if (
      typeof p !== "object" ||
      p === null ||
      !("lat" in p) ||
      !("lng" in p) ||
      typeof (p as any).lat !== "number" ||
      typeof (p as any).lng !== "number"
    ) {
      throw new Error("Each polygon vertex must be {lat: number, lng: number}");
    }
    const lat = (p as { lat: number; lng: number }).lat;
    const lng = (p as { lat: number; lng: number }).lng;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new Error("Coordinates out of range");
    }
    pts.push({ lat, lng });
  }
  // Close the ring if not already closed
  if (
    pts.length > 0 &&
    (pts[0].lat !== pts[pts.length - 1].lat ||
      pts[0].lng !== pts[pts.length - 1].lng)
  ) {
    pts.push({ ...pts[0] });
  }
  return pts;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listTerritories(
  tenantId: number,
  opts: { is_active?: boolean; q?: string; page: number; limit: number; archive?: boolean }
) {
  const where: Prisma.TerritoryWhereInput = { tenant_id: tenantId };
  if (opts.archive) {
    where.deleted_at = { not: null };
  } else {
    where.deleted_at = null;
  }
  if (opts.is_active !== undefined) where.is_active = opts.is_active;
  const q = (opts.q ?? "").trim();
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } }
    ];
  }
  const skip = (opts.page - 1) * opts.limit;
  const [total, rows] = await Promise.all([
    prisma.territory.count({ where }),
    prisma.territory.findMany({
      where,
      orderBy: [{ created_at: "desc" }, { name: "asc" }],
      skip,
      take: opts.limit,
      include: {
        userLinks: {
          include: {
            assignedByUser: { select: { id: true, name: true } }
          }
        }
      }
    })
  ]);
  const data = rows.map((t) => ({
    id: t.id,
    name: t.name,
    code: t.code,
    description: t.description,
    polygon: t.polygon as unknown,
    is_active: t.is_active,
    created_at: t.created_at.toISOString(),
    updated_at: t.updated_at.toISOString(),
    user_count: t.userLinks.length,
    deleted_at: t.deleted_at ? t.deleted_at.toISOString() : null,
    deleted_by_user_id: t.deleted_by_user_id ?? null
  }));
  return { data, total, page: opts.page, limit: opts.limit };
}

export async function getTerritory(tenantId: number, id: number) {
  const t = await prisma.territory.findFirst({
    where: { id, tenant_id: tenantId },
    include: {
      userLinks: {
        include: {
          assignedByUser: { select: { id: true, name: true } }
        }
      }
    }
  });
  return t;
}

export async function createTerritory(
  tenantId: number,
  body: {
    name: string;
    code?: string | null;
    description?: string | null;
    polygon?: unknown;
    is_active?: boolean;
  }
) {
  if (body.code) {
    const clash = await prisma.territory.findFirst({
      where: { tenant_id: tenantId, code: body.code, deleted_at: null }
    });
    if (clash) throw new Error("CodeTaken");
  }

  let polygon: Prisma.InputJsonValue = "[]" as unknown as Prisma.InputJsonValue;
  if (body.polygon !== undefined && body.polygon !== null) {
    const pts = validatePolygon(body.polygon);
    polygon = pts as unknown as Prisma.InputJsonValue;
  }

  const t = await prisma.territory.create({
    data: {
      tenant_id: tenantId,
      name: body.name.trim().slice(0, 256),
      code: body.code?.trim() || null,
      description: body.description?.trim() || null,
      polygon,
      is_active: body.is_active !== false
    }
  });
  return t;
}

export async function updateTerritory(
  tenantId: number,
  id: number,
  body: {
    name?: string;
    code?: string | null;
    description?: string | null;
    polygon?: unknown;
    is_active?: boolean;
  }
) {
  const existing = await prisma.territory.findFirst({
    where: { id, tenant_id: tenantId }
  });
  if (!existing) return null;
  if (existing.deleted_at != null) throw new Error("VOIDED");

  if (body.code !== undefined && body.code) {
    const clash = await prisma.territory.findFirst({
      where: { tenant_id: tenantId, code: body.code, deleted_at: null, NOT: { id } }
    });
    if (clash) throw new Error("CodeTaken");
  }

  let polygon: Prisma.InputJsonValue | undefined;
  if (body.polygon !== undefined && body.polygon !== null) {
    const pts = validatePolygon(body.polygon);
    polygon = pts as unknown as Prisma.InputJsonValue;
  }

  const data: Prisma.TerritoryUpdateInput = {};
  if (body.name !== undefined) data.name = body.name.trim().slice(0, 256);
  if (body.code !== undefined) data.code = body.code?.trim() || null;
  if (body.description !== undefined)
    data.description = body.description?.trim() || null;
  if (polygon !== undefined) data.polygon = polygon;
  if (body.is_active !== undefined) data.is_active = body.is_active;

  const updated = await prisma.territory.update({ where: { id }, data });
  return updated;
}

export async function deleteTerritory(
  tenantId: number,
  id: number,
  actorUserId: number | null
): Promise<void> {
  const existing = await prisma.territory.findFirst({
    where: { id, tenant_id: tenantId },
    select: { id: true, deleted_at: true }
  });
  if (!existing) throw new Error("NOT_FOUND");
  if (existing.deleted_at != null) throw new Error("ALREADY_VOIDED");
  const uid =
    actorUserId != null && Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : null;
  await prisma.territory.update({
    where: { id },
    data: { deleted_at: new Date(), deleted_by_user_id: uid }
  });
}

export async function restoreTerritory(tenantId: number, id: number): Promise<void> {
  const existing = await prisma.territory.findFirst({
    where: { id, tenant_id: tenantId },
    select: { id: true, deleted_at: true }
  });
  if (!existing) throw new Error("NOT_FOUND");
  if (existing.deleted_at == null) throw new Error("NOT_VOIDED");
  await prisma.territory.update({
    where: { id },
    data: { deleted_at: null, deleted_by_user_id: null }
  });
}

// ---------------------------------------------------------------------------
// User assignment
// ---------------------------------------------------------------------------

/**
 * Assign a user to a territory. Validates that both the territory and user
 * belong to the given tenant.
 */
export async function assignUser(
  tenantId: number,
  territoryId: number,
  userId: number,
  assignedBy?: number
) {
  const territory = await prisma.territory.findFirst({
    where: { id: territoryId, tenant_id: tenantId, deleted_at: null },
    select: { id: true }
  });
  if (!territory) throw new Error("TerritoryNotFound");

  const user = await prisma.user.findFirst({
    where: { id: userId, tenant_id: tenantId, is_active: true },
    select: { id: true }
  });
  if (!user) throw new Error("UserNotFound");

  try {
    await prisma.territoryUserLink.create({
      data: {
        territory_id: territoryId,
        user_id: userId,
        assigned_by: assignedBy ?? null
      }
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      throw new Error("AlreadyAssigned");
    }
    throw e;
  }
}

/** Remove a user from a territory. Returns true if a link was deleted. */
export async function unassignUser(
  tenantId: number,
  territoryId: number,
  userId: number
) {
  const territory = await prisma.territory.findFirst({
    where: { id: territoryId, tenant_id: tenantId },
    select: { id: true }
  });
  if (!territory) throw new Error("TerritoryNotFound");

  const deleted = await prisma.territoryUserLink.deleteMany({
    where: { territory_id: territoryId, user_id: userId }
  });
  return deleted.count > 0;
}

// ---------------------------------------------------------------------------
// GPS validation - point in polygon check
// ---------------------------------------------------------------------------

/**
 * Check if (lat, lng) is inside any active territory polygon for the tenant.
 * Fetches polygons via Prisma and runs the crossing-number algorithm.
 * If `territoryId` is provided, only checks that specific territory.
 */
export async function validateCheckin(
  tenantId: number,
  territoryId: number | null,
  lat: number,
  lng: number
): Promise<{
  inside: boolean;
  territory_id: number | null;
  territory_name: string | null;
}> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { inside: false, territory_id: null, territory_name: null };
  }

  const where: Prisma.TerritoryWhereInput = { tenant_id: tenantId, is_active: true, deleted_at: null };
  if (territoryId !== null) where.id = territoryId;

  const territories = await prisma.territory.findMany({ where });

  for (const t of territories) {
    const pts = t.polygon as unknown as { lat: number; lng: number }[];
    if (!Array.isArray(pts) || pts.length < 3) continue;

    if (isPointInPolygon(lat, lng, pts)) {
      return { inside: true, territory_id: t.id, territory_name: t.name };
    }
  }

  return { inside: false, territory_id: null, territory_name: null };
}

/**
 * Ray-casting point-in-polygon (crossing number algorithm).
 * Works with flat {lat, lng} arrays. First point is NOT assumed to repeat at end.
 */
function isPointInPolygon(
  lat: number,
  lng: number,
  vertices: { lat: number; lng: number }[]
): boolean {
  let inside = false;
  const n = vertices.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const vi = vertices[i];
    const vj = vertices[j];
    const intersects =
      vi.lat > lat !== vj.lat > lat &&
      lng <
        ((vj.lng - vi.lng) * (lat - vi.lat)) / (vj.lat - vi.lat) + vi.lng;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Point-in-polygon check executed as raw PostgreSQL SQL.
 * Uses the ray-casting algorithm with jsonb_array_elements + LEAD() window function on the DB side.
 */
export async function pointInPolygonSQL(
  territoryId: number,
  tenantId: number,
  lat: number,
  lng: number
): Promise<boolean> {
  // Verify the territory exists and belongs to the tenant
  const territory = await prisma.territory.findFirst({
    where: { id: territoryId, tenant_id: tenantId, deleted_at: null },
    select: { id: true }
  });
  if (!territory) return false;

  const sql = `
    WITH edges AS (
      SELECT
        row_num,
        elem.v->>'lat' AS lat_str,
        elem.v->>'lng' AS lng_str,
        LEAD(elem.v->>'lat') OVER (ORDER BY row_num) AS next_lat_str,
        LEAD(elem.v->>'lng') OVER (ORDER BY row_num) AS next_lng_str
      FROM territories t
      CROSS JOIN LATERAL (
        SELECT value AS v, ordinality AS row_num
        FROM jsonb_array_elements(t.polygon::jsonb)
      ) AS elem
      WHERE t.id = $1
    )
    SELECT (
      COALESCE(SUM(
        CASE WHEN (
          (edges.lat_str::float > $2) <> (COALESCE(edges.next_lat_str, first_lat.first) > $2)
          AND $3::float < (
            (COALESCE(edges.next_lng_str, first_lng.first)::float - edges.lng_str::float)
            / (COALESCE(edges.next_lat_str, first_lat.first)::float - edges.lat_str::float)
            * ($2 - edges.lat_str::float)
            + edges.lng_str::float
          )
        ) THEN 1 ELSE 0 END
      )::int % 2, 0) = 1
    ) AS inside
    FROM edges
    CROSS JOIN LATERAL (
      SELECT elem.v->>'lat' AS first
      FROM territories t
      CROSS JOIN LATERAL jsonb_array_elements(t.polygon::jsonb) AS elem
      WHERE t.id = $1
      LIMIT 1
    ) first_lat
    CROSS JOIN LATERAL (
      SELECT elem.v->>'lng' AS first
      FROM territories t
      CROSS JOIN LATERAL jsonb_array_elements(t.polygon::jsonb) AS elem
      WHERE t.id = $1
      LIMIT 1
    ) first_lng
    WHERE edges.next_lat_str IS NOT NULL
       OR (
         edges.lat_str::float <> first_lat.first::float
      )
  `;

  try {
    const result = await prisma.$queryRawUnsafe(
      sql,
      territoryId,
      lat,
      lng
    );
    const row = result as Array<{ inside: boolean }>;
    if (!row || row.length === 0) return false;
    return Boolean(row[0].inside);
  } catch {
    // Fallback to JS if raw SQL fails
    const t = await prisma.territory.findFirst({
      where: { id: territoryId, tenant_id: tenantId },
      select: { polygon: true }
    });
    if (!t) return false;
    const pts = t.polygon as unknown as { lat: number; lng: number }[];
    if (!Array.isArray(pts) || pts.length < 3) return false;
    return isPointInPolygon(lat, lng, pts);
  }
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export async function getTerritoryStats(
  tenantId: number,
  opts?: { from?: string; to?: string }
) {
  // Fetch all territories for the tenant
  const territories = await prisma.territory.findMany({
    where: { tenant_id: tenantId, deleted_at: null },
    select: { id: true, name: true }
  });

  // Collect all user IDs linked to each territory
  const links = await prisma.territoryUserLink.findMany({
    where: {
      territory: { tenant_id: tenantId }
    },
    select: { territory_id: true, user_id: true }
  });

  // Build territory_id -> user IDs map
  const territoryUsers = new Map<number, number[]>();
  for (const link of links) {
    const existing = territoryUsers.get(link.territory_id);
    if (existing) {
      if (!existing.includes(link.user_id)) existing.push(link.user_id);
    } else {
      territoryUsers.set(link.territory_id, [link.user_id]);
    }
  }

  // Flatten all unique user IDs across territories
  const allUserIds = Array.from(new Set(links.map((l) => l.user_id)));

  // Build date filter
  const whereTime: Prisma.DateTimeFilter = {};
  if (opts?.from) {
    const f = new Date(opts.from);
    if (!Number.isNaN(f.getTime())) whereTime.gte = f;
  }
  if (opts?.to) {
    const t = new Date(opts.to);
    if (!Number.isNaN(t.getTime())) {
      t.setUTCHours(23, 59, 59, 999);
      whereTime.lte = t;
    }
  }
  const hasTime = Object.keys(whereTime).length > 0;

  const ordersByUser = new Map<number, number>();
  const visitsByAgent = new Map<number, number>();

  if (allUserIds.length > 0) {
    const ordersWhere: Record<string, any> = {
      tenant_id: tenantId,
      agent_id: { in: allUserIds }
    };
    if (hasTime) ordersWhere.created_at = whereTime;

    const visitWhere: Record<string, any> = {
      tenant_id: tenantId,
      agent_id: { in: allUserIds }
    };
    if (hasTime) visitWhere.checked_in_at = whereTime;

    const ordersRaw = await prisma.order.groupBy({
      by: ["agent_id"],
      _count: { id: true },
      where: ordersWhere
    });

    const visitsRaw = await prisma.agentVisit.groupBy({
      by: ["agent_id"],
      _count: { id: true },
      where: visitWhere
    });

    for (const o of ordersRaw) {
      const count = typeof o._count === "object" && o._count !== null
        ? ((o as any)._count.id as number)
        : 0;
      if (o.agent_id !== null) ordersByUser.set(o.agent_id, count);
    }
    for (const v of visitsRaw) {
      const count = typeof v._count === "object" && v._count !== null
        ? ((v as any)._count.id as number)
        : 0;
      visitsByAgent.set(v.agent_id, count);
    }
  }

  return territories.map((t) => {
    const userIds = territoryUsers.get(t.id) ?? [];
    let orderCount = 0;
    let visitCount = 0;
    for (const uid of userIds) {
      orderCount += ordersByUser.get(uid) ?? 0;
      visitCount += visitsByAgent.get(uid) ?? 0;
    }
    return {
      territory_id: t.id,
      name: t.name,
      agents_count: userIds.length,
      visits_count: visitCount,
      orders_count: orderCount
    };
  });
}
