import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { actorUserIdOrNull } from "../../lib/request-actor";
import { ensureTenantContext } from "../../lib/tenant-context";
import { jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import {
  createGoodsReceipt,
  deleteGoodsReceiptDraft,
  getGoodsReceiptDetail,
  listGoodsReceipts,
  restoreGoodsReceiptDraft
} from "./goods-receipt.service";

const catalogRoles = ["admin", "operator", "supervisor", "agent", "expeditor"] as const;
const writeRoles = ["admin", "operator"] as const;

const listQuerySchema = z.object({
  warehouse_id: z.coerce.number().int().positive().optional(),
  supplier_id: z.coerce.number().int().positive().optional(),
  status: z.string().max(32).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  q: z.string().optional().default(""),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(25),
  archive: z
    .preprocess(
      (val) =>
        val === true || val === "true" || val === "1" || val === "yes",
      z.boolean()
    )
    .optional()
    .default(false)
});

const lineSchema = z.object({
  product_id: z.number().int().positive(),
  qty: z.number().positive(),
  unit_price: z.number().min(0).optional().nullable(),
  defect_qty: z.number().min(0).optional().nullable()
});

const createBodySchema = z.object({
  warehouse_id: z.number().int().positive(),
  supplier_id: z.number().int().positive().optional().nullable(),
  receipt_at: z.string().optional().nullable(),
  comment: z.string().max(4000).optional().nullable(),
  price_type: z.string().min(1).max(128),
  external_ref: z.string().max(128).optional().nullable(),
  status: z.enum(["draft", "posted"]).optional().default("posted"),
  lines: z.array(lineSchema).min(1)
});

export async function registerGoodsReceiptRoutes(app: FastifyInstance) {
  app.get(
    "/api/:slug/goods-receipts",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      const q = parsed.data;
      const result = await listGoodsReceipts(request.tenant!.id, {
        warehouse_id: q.warehouse_id,
        supplier_id: q.supplier_id,
        status: q.status,
        date_from: q.date_from,
        date_to: q.date_to,
        search: q.q,
        page: q.page,
        limit: q.limit,
        archive: q.archive
      });
      return reply.send(result);
    }
  );

  app.get(
    "/api/:slug/goods-receipts/:id",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (!Number.isFinite(id) || id <= 0) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const row = await getGoodsReceiptDetail(request.tenant!.id, id);
      if (!row) return reply.status(404).send({ error: "NotFound" });
      return reply.send({ data: row });
    }
  );

  app.post(
    "/api/:slug/goods-receipts",
    { preHandler: [jwtAccessVerify, requireRoles(...writeRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = createBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const out = await createGoodsReceipt(
          request.tenant!.id,
          parsed.data,
          actorUserIdOrNull(request)
        );
        return reply.status(201).send({ data: out });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "EMPTY_LINES") return reply.status(400).send({ error: "EmptyLines" });
        if (msg === "BAD_WAREHOUSE") return reply.status(400).send({ error: "BadWarehouse" });
        if (msg === "BAD_SUPPLIER") return reply.status(400).send({ error: "BadSupplier" });
        if (msg === "BAD_PRICE_TYPE") return reply.status(400).send({ error: "BadPriceType" });
        if (msg === "BAD_PRODUCT") return reply.status(400).send({ error: "BadProduct" });
        if (msg === "BAD_QTY") return reply.status(400).send({ error: "BadQty" });
        throw e;
      }
    }
  );

  app.delete(
    "/api/:slug/goods-receipts/:id",
    { preHandler: [jwtAccessVerify, requireRoles(...writeRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (!Number.isFinite(id) || id <= 0) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const dq = z
        .object({ delete_reason_ref: z.string().max(128).optional() })
        .parse((request.query as Record<string, unknown>) ?? {});
      try {
        await deleteGoodsReceiptDraft(
          request.tenant!.id,
          id,
          actorUserIdOrNull(request),
          dq.delete_reason_ref?.trim() || null
        );
        return reply.status(204).send();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "NOT_DRAFT") return reply.status(409).send({ error: "NotDraft" });
        if (msg === "ALREADY_VOIDED") return reply.status(409).send({ error: "AlreadyVoided" });
        throw e;
      }
    }
  );

  app.post(
    "/api/:slug/goods-receipts/:id/restore",
    { preHandler: [jwtAccessVerify, requireRoles(...writeRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (!Number.isFinite(id) || id <= 0) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      try {
        await restoreGoodsReceiptDraft(request.tenant!.id, id, actorUserIdOrNull(request));
        return reply.status(204).send();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "NOT_VOIDED") return reply.status(409).send({ error: "NotVoided" });
        if (msg === "NOT_DRAFT") return reply.status(409).send({ error: "NotDraft" });
        throw e;
      }
    }
  );
}
