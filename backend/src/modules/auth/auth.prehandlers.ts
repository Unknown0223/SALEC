import type { FastifyReply, FastifyRequest } from "fastify";

export type AccessJwtUser = {
  sub: string;
  tenantId: number;
  role: string;
  login: string;
};

export function getAccessUser(request: FastifyRequest): AccessJwtUser {
  return request.user as AccessJwtUser;
}

export async function jwtAccessVerify(request: FastifyRequest, _reply: FastifyReply) {
  await request.jwtVerify<AccessJwtUser>();
}

/** JWT allaqachon `jwtAccessVerify` orqali tekshirilgan bo‘lishi kerak. */
export function requireRoles(...allowed: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const role = getAccessUser(request).role;
    if (!role || !allowed.includes(role)) {
      return reply.status(403).send({ error: "ForbiddenRole" });
    }
  };
}
