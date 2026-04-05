import type { FastifyInstance } from "fastify";
import { ensureTenantContext } from "../../lib/tenant-context";
import { jwtAccessVerify } from "../auth/auth.prehandlers";
import {
  getSalesSummary,
  getOrderTrends,
  getProductSales,
  getClientAnalytics,
  getAgentKpi,
  getStatusDistribution,
  getChannelStats,
  getAbcAnalysis,
  getXyzAnalysis,
  getClientChurn
} from "./reports.service";

export async function registerReportRoutes(app: FastifyInstance) {
  const preHandler = [jwtAccessVerify];

  // Sales summary
  app.get("/api/:slug/reports/sales", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const { from, to } = request.query as Record<string, string | undefined>;
    const data = await getSalesSummary(request.tenant!.id, from, to);
    return reply.send(data);
  });

  // Order trends (time series)
  app.get("/api/:slug/reports/order-trends", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const { from, to } = request.query as Record<string, string | undefined>;
    const data = await getOrderTrends(request.tenant!.id, from, to);
    return reply.send(data);
  });

  // Product sales (top products)
  app.get("/api/:slug/reports/products", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const { from, to, limit } = request.query as Record<string, string | undefined>;
    const data = await getProductSales(
      request.tenant!.id,
      from,
      to,
      limit ? Number.parseInt(limit, 10) : 20
    );
    return reply.send(data);
  });

  // Client analytics
  app.get("/api/:slug/reports/clients", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const { from, to, limit } = request.query as Record<string, string | undefined>;
    const data = await getClientAnalytics(
      request.tenant!.id,
      from,
      to,
      limit ? Number.parseInt(limit, 10) : 20
    );
    return reply.send(data);
  });

  // Agent KPI
  app.get("/api/:slug/reports/agent-kpi", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const { from, to } = request.query as Record<string, string | undefined>;
    const data = await getAgentKpi(request.tenant!.id, from, to);
    return reply.send(data);
  });

  // Status distribution
  app.get("/api/:slug/reports/status-distribution", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const data = await getStatusDistribution(request.tenant!.id);
    return reply.send(data);
  });

  // Channel and trade direction stats
  app.get("/api/:slug/reports/channels", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const { from, to } = request.query as Record<string, string | undefined>;
    const data = await getChannelStats(request.tenant!.id, from, to);
    return reply.send(data);
  });

  // ABC analysis (client revenue by 80/95 rule)
  app.get("/api/:slug/reports/abc-analysis", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const { from, to } = request.query as Record<string, string | undefined>;
    const data = await getAbcAnalysis(request.tenant!.id, from, to);
    return reply.send(data);
  });

  // XYZ analysis (client stability by coefficient of variation)
  app.get("/api/:slug/reports/xyz-analysis", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const { from, to } = request.query as Record<string, string | undefined>;
    const data = await getXyzAnalysis(request.tenant!.id, from, to);
    return reply.send(data);
  });

  // Client churn (inactive clients)
  app.get("/api/:slug/reports/client-churn", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const { monthsAgo } = request.query as Record<string, string | undefined>;
    const data = await getClientChurn(request.tenant!.id, monthsAgo ? parseInt(monthsAgo) : 3);
    return reply.send(data);
  });
}
