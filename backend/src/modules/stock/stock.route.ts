import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { actorUserIdOrNull } from "../../lib/request-actor";
import { ensureTenantContext } from "../../lib/tenant-context";
import { jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import {
  applyStockAdjustment,
  applyStockReceipt,
  buildPostupleniya2StockTemplateBuffer,
  buildStockBalancesExportBuffer,
  buildStockImportTemplateBuffer,
  importStockReceiptFromXlsx,
  listPickingAggregateByProduct,
  listStockBalances,
  listLowStockForTenant,
  listStockForTenant,
  WAREHOUSE_STOCK_PURPOSES
} from "./stock.service";
import {
  createWarehouseCorrectionBulk,
  listCorrectionWorkspaceRows,
  listDistinctPriceTypesForTenant,
  listWarehouseCorrections
} from "./warehouse-correction.service";

const catalogRoles = ["admin", "operator"] as const;
const adminRoles = ["admin"] as const;

const balanceViewSchema = z.enum(["summary", "valuation", "by_warehouse"]);

const balancesQuerySchema = z.object({
  view: balanceViewSchema.optional().default("summary"),
  purpose: z.enum(WAREHOUSE_STOCK_PURPOSES).optional().default("sales"),
  warehouse_id: z.coerce.number().int().positive().optional(),
  category_id: z.coerce.number().int().positive().optional(),
  group_id: z.coerce.number().int().positive().optional(),
  active_only: z.enum(["true", "false"]).optional().default("true"),
  qty_mode: z.enum(["all", "positive", "zero"]).optional().default("all"),
  q: z.string().optional().default(""),
  price_type: z.string().min(1).max(128).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(25),
  sort: z.enum(["name_asc", "name_desc", "available_desc"]).optional().default("name_asc")
});

const balancesExportQuerySchema = balancesQuerySchema.omit({ page: true, limit: true });

const receiptBody = z.object({
  warehouse_id: z.number().int().positive(),
  items: z
    .array(
      z.object({
        product_id: z.number().int().positive(),
        qty: z.number().positive()
      })
    )
    .min(1),
  note: z.string().max(2000).optional().nullable()
});

const adjustmentBody = z.object({
  warehouse_id: z.number().int().positive(),
  product_id: z.number().int().positive(),
  delta: z.number().refine((n) => Number.isFinite(n) && n !== 0),
  note: z.string().max(500).optional().nullable()
});

const correctionsQuerySchema = z.object({
  warehouse_id: z.coerce.number().int().positive().optional(),
  kind: z.enum(["correction", "inventory_count"]).optional(),
  q: z.string().optional().default(""),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(25)
});

/** Fastify: query ba'zan `string | string[]`; bo'sh `key=` → `""` — coerce `positive()` buziladi. */
function queryScalar(v: unknown): unknown {
  if (v === "" || v === null || v === undefined) return undefined;
  if (Array.isArray(v)) return v.length > 0 ? queryScalar(v[0]) : undefined;
  return v;
}

function requiredPositiveIntFromQuery(v: unknown): number {
  const s = queryScalar(v);
  if (s === undefined) return Number.NaN;
  const n = typeof s === "number" && Number.isFinite(s) ? s : Number(String(s).trim());
  if (!Number.isFinite(n)) return Number.NaN;
  const i = Math.trunc(n);
  if (i !== n || i <= 0) return Number.NaN;
  return i;
}

/** Noto'g'ri yoki bo'sh qiymat → `undefined` (ikkita scope maydoni uchun — `NaN` emas). */
function optionalPositiveIntFromQuery(v: unknown): number | undefined {
  const s = queryScalar(v);
  if (s === undefined) return undefined;
  const n = typeof s === "number" && Number.isFinite(s) ? s : Number(String(s).trim());
  if (!Number.isFinite(n)) return undefined;
  const i = Math.trunc(n);
  if (i !== n || i <= 0) return undefined;
  return i;
}

const correctionWorkspaceQuerySchema = z
  .object({
    warehouse_id: z.preprocess(requiredPositiveIntFromQuery, z.number().int().positive()),
    catalog_group_id: z.preprocess(optionalPositiveIntFromQuery, z.number().int().positive().optional()),
    category_id: z.preprocess(optionalPositiveIntFromQuery, z.number().int().positive().optional()),
    price_type: z.preprocess(
      (v) => {
        const s = queryScalar(v);
        if (s === undefined) return undefined;
        const t = String(s).trim();
        return t === "" ? undefined : t;
      },
      z.string().max(128).optional()
    )
  })
  .transform((q) => {
    /** Ikkala scope kelganda (proxy / eski URL / xato klient) — kategoriya ustun. */
    if (q.category_id != null && q.catalog_group_id != null) {
      return { ...q, catalog_group_id: undefined };
    }
    return q;
  })
  .refine(
    (q) =>
      (q.catalog_group_id != null && q.category_id == null) ||
      (q.catalog_group_id == null && q.category_id != null),
    { message: "Exactly one of catalog_group_id or category_id is required" }
  );

const correctionBulkBodySchema = z.object({
  warehouse_id: z.number().int().positive(),
  kind: z.enum(["correction", "inventory_count"]),
  price_type: z.string().max(128).optional().nullable(),
  occurred_at: z.string().max(64).optional().nullable(),
  comment: z.string().max(2000).optional().nullable(),
  items: z
    .array(
      z.object({
        product_id: z.number().int().positive(),
        delta: z.number().refine((n) => Number.isFinite(n) && n !== 0),
        price_unit: z.number().optional().nullable()
      })
    )
    .min(1)
    .max(500)
});

export async function registerStockRoutes(app: FastifyInstance) {
  app.get(
    "/api/:slug/stock/import-template",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const kind = String((request.query as { kind?: string }).kind ?? "").toLowerCase();
      const post2 = kind === "postupleniya2" || kind === "postupleniya_2" || kind === "p2";
      const buf = post2
        ? await buildPostupleniya2StockTemplateBuffer()
        : await buildStockImportTemplateBuffer();
      reply.header(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      reply.header(
        "Content-Disposition",
        post2
          ? 'attachment; filename="postupleniya-kirim-shablon.xlsx"'
          : 'attachment; filename="ombor-kirim-shablon.xlsx"'
      );
      return reply.send(buf);
    }
  );

  app.post(
    "/api/:slug/stock/import",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      let buf: Buffer | null = null;
      let defaultWarehouseId: number | undefined;
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          buf = await part.toBuffer();
        } else if (part.type === "field" && part.fieldname === "warehouse_id") {
          const raw = String(part.value ?? "").trim();
          const n = Number.parseInt(raw, 10);
          if (Number.isFinite(n) && n > 0) defaultWarehouseId = n;
        }
      }
      if (!buf || buf.length === 0) {
        const file = await request.file();
        if (!file) {
          return reply.status(400).send({ error: "NoFile" });
        }
        buf = await file.toBuffer();
      }
      if (buf.length === 0) {
        return reply.status(400).send({ error: "EmptyFile" });
      }
      const result = await importStockReceiptFromXlsx(
        request.tenant!.id,
        buf,
        actorUserIdOrNull(request),
        defaultWarehouseId != null ? { defaultWarehouseId } : undefined
      );
      return reply.send(result);
    }
  );

  app.get(
    "/api/:slug/stock/low",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const raw = (request.query as { threshold?: string }).threshold;
      const parsed = Number.parseFloat(raw ?? "10");
      const threshold = Math.min(
        1_000_000,
        Math.max(0.0001, Number.isFinite(parsed) && parsed > 0 ? parsed : 10)
      );
      const data = await listLowStockForTenant(request.tenant!.id, threshold);
      return reply.send({ data, threshold: String(threshold) });
    }
  );

  app.get(
    "/api/:slug/stock/balances/export",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = balancesExportQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      const q = parsed.data;
      if (q.view === "valuation" && !q.price_type?.trim()) {
        return reply.status(400).send({ error: "PriceTypeRequired" });
      }
      try {
        const buf = await buildStockBalancesExportBuffer(request.tenant!.id, {
          purpose: q.purpose,
          warehouse_id: q.warehouse_id,
          category_id: q.category_id,
          group_id: q.group_id,
          active_only: q.active_only === "true",
          qty_mode: q.qty_mode,
          q: q.q ?? "",
          view: q.view,
          price_type: q.price_type?.trim() ?? null,
          sort: q.sort
        });
        reply.header(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        reply.header("Content-Disposition", 'attachment; filename="ostatki.xlsx"');
        return reply.send(buf);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "PRICE_TYPE_REQUIRED") {
          return reply.status(400).send({ error: "PriceTypeRequired" });
        }
        if (msg === "EXPORT_TOO_LARGE") {
          return reply.status(413).send({ error: "ExportTooLarge" });
        }
        throw e;
      }
    }
  );

  app.get(
    "/api/:slug/stock/balances",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = balancesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      const q = parsed.data;
      if (q.view === "valuation" && !q.price_type?.trim()) {
        return reply.status(400).send({ error: "PriceTypeRequired" });
      }
      try {
        const result = await listStockBalances(request.tenant!.id, {
          purpose: q.purpose,
          warehouse_id: q.warehouse_id,
          category_id: q.category_id,
          group_id: q.group_id,
          active_only: q.active_only === "true",
          qty_mode: q.qty_mode,
          q: q.q ?? "",
          view: q.view,
          price_type: q.price_type?.trim() ?? null,
          page: q.page,
          limit: q.limit,
          sort: q.sort
        });
        return reply.send(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "PRICE_TYPE_REQUIRED") {
          return reply.status(400).send({ error: "PriceTypeRequired" });
        }
        throw e;
      }
    }
  );

  app.get(
    "/api/:slug/stock/picking-aggregate",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as { warehouse_id?: string; q?: string };
      const rawWh = q.warehouse_id?.trim();
      const warehouse_id =
        rawWh != null && rawWh !== "" && /^\d+$/.test(rawWh) ? Number.parseInt(rawWh, 10) : undefined;
      const search = (q.q ?? "").trim().slice(0, 200) || undefined;
      const data = await listPickingAggregateByProduct(request.tenant!.id, {
        warehouse_id: warehouse_id,
        q: search
      });
      return reply.send({ data });
    }
  );

  app.get(
    "/api/:slug/stock",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as { warehouse_id?: string };
      const raw = q.warehouse_id?.trim();
      const warehouseId =
        raw != null && raw !== "" && /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : undefined;
      const data = await listStockForTenant(request.tenant!.id, warehouseId);
      return reply.send({ data });
    }
  );

  app.post(
    "/api/:slug/stock/receipts",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = receiptBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        await applyStockReceipt(request.tenant!.id, parsed.data, actorUserIdOrNull(request));
        return reply.status(201).send({ ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "BAD_WAREHOUSE") return reply.status(400).send({ error: "BadWarehouse" });
        if (msg === "EMPTY_ITEMS") return reply.status(400).send({ error: "EmptyItems" });
        if (msg === "BAD_QTY") return reply.status(400).send({ error: "BadQty" });
        if (msg === "BAD_PRODUCT") return reply.status(400).send({ error: "BadProduct" });
        throw e;
      }
    }
  );

  app.get(
    "/api/:slug/stock/correction-price-types",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const types = await listDistinctPriceTypesForTenant(request.tenant!.id);
      return reply.send({ data: types });
    }
  );

  app.get(
    "/api/:slug/stock/corrections",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = correctionsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      const q = parsed.data;
      const result = await listWarehouseCorrections(request.tenant!.id, {
        warehouse_id: q.warehouse_id,
        kind: q.kind,
        q: q.q,
        page: q.page,
        limit: q.limit
      });
      return reply.send(result);
    }
  );

  app.get(
    "/api/:slug/stock/correction-workspace",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = correctionWorkspaceQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        request.log.warn(
          {
            op: "correction_workspace_query_invalid",
            tenantId: request.tenant?.id,
            details: parsed.error.flatten(),
            query: request.query
          },
          "correction_workspace validation failed"
        );
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      const q = parsed.data;
      const scope =
        q.catalog_group_id != null
          ? ({ kind: "catalog_group" as const, id: q.catalog_group_id })
          : ({ kind: "category" as const, id: q.category_id! });
      try {
        const data = await listCorrectionWorkspaceRows(
          request.tenant!.id,
          q.warehouse_id,
          scope,
          q.price_type?.trim() || null
        );
        return reply.send({ data });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "BAD_WAREHOUSE") {
          request.log.warn(
            {
              op: "correction_workspace_bad_warehouse",
              tenantId: request.tenant?.id,
              warehouse_id: q.warehouse_id
            },
            "correction_workspace warehouse not in tenant"
          );
          return reply.status(400).send({ error: "BadWarehouse" });
        }
        throw e;
      }
    }
  );

  app.post(
    "/api/:slug/stock/corrections/bulk",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = correctionBulkBodySchema.safeParse(request.body);
      if (!parsed.success) {
        request.log.warn(
          {
            op: "correction_bulk_body_invalid",
            tenantId: request.tenant?.id,
            details: parsed.error.flatten()
          },
          "corrections/bulk validation failed"
        );
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const result = await createWarehouseCorrectionBulk(
          request.tenant!.id,
          parsed.data,
          actorUserIdOrNull(request)
        );
        request.log.info(
          {
            op: "correction_bulk_http_ok",
            tenantId: request.tenant?.id,
            documentId: result.id,
            line_count: parsed.data.items.length,
            kind: parsed.data.kind
          },
          "corrections/bulk created"
        );
        return reply.status(201).send(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "BAD_WAREHOUSE") return reply.status(400).send({ error: "BadWarehouse" });
        if (msg === "BAD_PRODUCT") return reply.status(400).send({ error: "BadProduct" });
        if (msg === "BAD_DELTA") return reply.status(400).send({ error: "BadDelta" });
        if (msg === "NEGATIVE_QTY") return reply.status(400).send({ error: "NegativeQty" });
        if (msg === "BELOW_RESERVED") return reply.status(400).send({ error: "BelowReserved" });
        if (msg === "EMPTY_ITEMS") return reply.status(400).send({ error: "EmptyItems" });
        if (msg === "TOO_MANY_LINES") return reply.status(400).send({ error: "TooManyLines" });
        if (msg === "BAD_KIND") return reply.status(400).send({ error: "BadKind" });
        throw e;
      }
    }
  );

  app.post(
    "/api/:slug/stock/adjustment",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = adjustmentBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const result = await applyStockAdjustment(
          request.tenant!.id,
          parsed.data,
          actorUserIdOrNull(request)
        );
        return reply.status(200).send({ ok: true, ...result });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "BAD_WAREHOUSE") return reply.status(400).send({ error: "BadWarehouse" });
        if (msg === "BAD_PRODUCT") return reply.status(400).send({ error: "BadProduct" });
        if (msg === "BAD_DELTA") return reply.status(400).send({ error: "BadDelta" });
        if (msg === "NEGATIVE_QTY") return reply.status(400).send({ error: "NegativeQty" });
        if (msg === "BELOW_RESERVED") return reply.status(400).send({ error: "BelowReserved" });
        throw e;
      }
    }
  );
}
