import type { FastifyReply, FastifyRequest } from "fastify";
import { getAccessUser } from "../modules/auth/auth.prehandlers";

export function ensureTenantContext(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!request.tenant) {
    reply.status(404).send({ error: "TenantNotFound" });
    return false;
  }
  const jwtUser = getAccessUser(request);
  if (Number(jwtUser.tenantId) !== request.tenant.id) {
    reply.status(403).send({ error: "CrossTenantDenied" });
    return false;
  }
  return true;
}
