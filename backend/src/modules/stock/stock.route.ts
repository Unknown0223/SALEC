import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { actorUserIdOrNull } from "../../lib/request-actor";
import { ensureTenantContext } from "../../lib/tenant-context";
import { jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import {
  applyStockReceipt,
  buildStockImportTemplateBuffer,
  importStockReceiptFromXlsx,
  listStockForTenant
} from "./stock.service";

const catalogRoles = ["admin", "operator"] as const;
const adminRoles = ["admin"] as const;

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
      const buf = await buildStockImportTemplateBuffer();
      reply.header(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      reply.header("Content-Disposition", 'attachment; filename="ombor-kirim-shablon.xlsx"');
      return reply.send(buf);
    }
  );

  app.post(
    "/api/:slug/stock/import",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ error: "NoFile" });
      }
      const buf = await file.toBuffer();
      if (buf.length === 0) {
        return reply.status(400).send({ error: "EmptyFile" });
      }
      const result = await importStockReceiptFromXlsx(
        request.tenant!.id,
        buf,
        actorUserIdOrNull(request)
      );
      return reply.send(result);
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
