import type { FastifyInstance } from "fastify";
import { ensureTenantContext } from "../../lib/tenant-context";
import { getAccessUser, jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import { enqueuePingJob, getBackgroundJobForTenant } from "./jobs.service";

const jobOperatorRoles = ["admin", "operator"] as const;

export async function registerJobRoutes(app: FastifyInstance) {
  app.post(
    "/api/:slug/jobs/ping",
    { preHandler: [jwtAccessVerify, requireRoles(...jobOperatorRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const tenant = request.tenant!;
      const user = getAccessUser(request);
      try {
        const result = await enqueuePingJob(tenant.id, Number(user.sub));
        return reply.status(202).send(result);
      } catch (err) {
        request.log.warn({ err }, "jobs.enqueue failed (redis?)");
        return reply.status(503).send({
          error: "JobQueueUnavailable",
          message: "Redis yoki navbat mavjud emas. Worker va REDIS_URL ni tekshiring."
        });
      }
    }
  );

  app.get(
    "/api/:slug/jobs/:jobId",
    { preHandler: [jwtAccessVerify, requireRoles(...jobOperatorRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const { jobId } = request.params as { jobId: string };
      try {
        const job = await getBackgroundJobForTenant(jobId, request.tenant!.id);
        if (!job) {
          return reply.status(404).send({ error: "JobNotFound" });
        }
        return reply.send(job);
      } catch (err) {
        request.log.warn({ err }, "jobs.get failed (redis?)");
        return reply.status(503).send({
          error: "JobQueueUnavailable",
          message: "Redis yoki navbat mavjud emas."
        });
      }
    }
  );
}
