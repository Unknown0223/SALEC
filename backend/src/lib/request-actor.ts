import type { FastifyRequest } from "fastify";
import type { AccessJwtUser } from "../modules/auth/auth.prehandlers";

/** JWT `sub` dan foydalanuvchi id (audit uchun). */
export function actorUserIdOrNull(request: FastifyRequest): number | null {
  const u = request.user as AccessJwtUser | undefined;
  if (u?.sub == null) return null;
  const n = Number(u.sub);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}
