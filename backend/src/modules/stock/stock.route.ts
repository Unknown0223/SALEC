import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { actorUserIdOrNull } from "../../lib/request-actor";
import { ensureTenantContext } from "../../lib/tenant-context";
import { jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import {
  applyStockReceipt,
  buildPostupleniya2StockTemplateBuffer,
  buildStockBalancesExportBuffer,
  buildStockImportTemplateBuffer,
  importStockReceiptFromXlsx,
  listStockBalances,
  listLowStockForTenant,
  listStockForTenant,
  WAREHOUSE_STOCK_PURPOSES
} from "./stock.service";

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
}
