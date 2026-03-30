import multipart from "@fastify/multipart";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { getAccessUser, jwtAccessVerify } from "./modules/auth/auth.prehandlers";
import { registerAuthRoutes } from "./modules/auth/auth.route";
import { registerClientRoutes } from "./modules/clients/clients.route";
import { registerBonusRuleRoutes } from "./modules/bonus-rules/bonus-rules.route";
import { registerOrderRoutes } from "./modules/orders/orders.route";
import { registerOrderStreamRoutes } from "./modules/orders/order-stream.route";
import { registerReferenceRoutes } from "./modules/reference/reference.route";
import { registerTenantSettingsRoutes } from "./modules/tenant-settings/tenant-settings.route";
import { registerStockRoutes } from "./modules/stock/stock.route";
import { registerProductPriceRoutes } from "./modules/products/product-prices.route";
import { registerProductRoutes } from "./modules/products/products.route";
import { env } from "./config/env";
import { jwtPlugin } from "./plugins/jwt.plugin";
import { tenantPlugin } from "./plugins/tenant.plugin";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });
  app.register(multipart, { limits: { fileSize: env.MULTIPART_MAX_FILE_BYTES } });
  app.register(jwtPlugin);
  app.register(tenantPlugin);
  app.register(registerAuthRoutes);
  app.register(registerClientRoutes);
  app.register(registerProductPriceRoutes);
  app.register(registerProductRoutes);
  app.register(registerBonusRuleRoutes);
  app.register(registerOrderRoutes);
  app.register(registerOrderStreamRoutes);
  app.register(registerReferenceRoutes);
  app.register(registerTenantSettingsRoutes);
  app.register(registerStockRoutes);

  app.get("/health", async () => ({
    status: "ok",
    time: new Date().toISOString()
  }));

  app.get("/api/:slug/protected", {
    preHandler: [jwtAccessVerify]
  }, async (request, reply) => {
    if (!request.tenant) {
      return reply.status(404).send({ error: "TenantNotFound" });
    }
    const jwtUser = getAccessUser(request);
    if (Number(jwtUser.tenantId) !== request.tenant.id) {
      return reply.status(403).send({ error: "CrossTenantDenied" });
    }

    return reply.send({
      ok: true,
      tenant: request.tenant.slug,
      userId: jwtUser.sub
    });
  });

  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;
    app.log.error({ err: error, requestId }, error.message);
    const code = (error as { code?: string }).code;
    if (code === "FST_REQ_FILE_TOO_LARGE") {
      return reply.status(413).send({
        error: "PayloadTooLarge",
        message: `Fayl juda katta. Maksimal hajm: ${Math.round(env.MULTIPART_MAX_FILE_BYTES / (1024 * 1024))} MB. Kichikroq .xlsx yoki .env da MULTIPART_MAX_FILE_BYTES ni oshiring.`,
        maxBytes: env.MULTIPART_MAX_FILE_BYTES,
        requestId
      });
    }
    if ((error as { statusCode?: number }).statusCode) {
      return reply.status((error as { statusCode: number }).statusCode).send({
        error: error.name,
        message: error.message,
        requestId
      });
    }
    const prismaCode =
      error !== null &&
      typeof error === "object" &&
      (error as { name?: string }).name === "PrismaClientKnownRequestError" &&
      typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : undefined;
    if (prismaCode === "P2022" || prismaCode === "P2021") {
      return reply.status(503).send({
        error: "DatabaseSchemaMismatch",
        message:
          "Baza migratsiyalari to‘liq qo‘llanmagan (jadval/ustun yetishmayapti). Backend papkasida: npm run db:deploy",
        prismaCode,
        requestId
      });
    }
    reply.status(500).send({
      error: "InternalServerError",
      message: "Unexpected server error",
      requestId
    });
  });

  return app;
}
