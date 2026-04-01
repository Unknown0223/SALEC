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

/**
 * Foydalanuvchi / agent / ekspeditor / supervizor ro‘yxatlarini o‘qish (filtrlar, mijoz tahriri).
 * POST va tahrirlar odatda `admin` / `operator` da qoladi.
 */
export const DIRECTORY_READ_ROLES = ["admin", "operator", "supervisor", "agent", "expeditor"] as const;

/** JWT allaqachon `jwtAccessVerify` orqali tekshirilgan bo‘lishi kerak. */
export function requireRoles(...allowed: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const role = getAccessUser(request).role;
    if (!role || !allowed.includes(role)) {
      return reply.status(403).send({ error: "ForbiddenRole" });
    }
  };
}
