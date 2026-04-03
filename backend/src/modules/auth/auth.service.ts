import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { prisma } from "../../config/database";

type LoginInput = {
  slug: string;
  login: string;
  password: string;
  device_name?: string | null;
  user_agent?: string | null;
  ip_address?: string | null;
};
type RefreshInput = { refreshToken: string };

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function buildTokens(app: FastifyInstance, user: { id: number; tenant_id: number; role: string; login: string }) {
  const accessToken = app.jwt.sign(
    { sub: String(user.id), tenantId: user.tenant_id, role: user.role, login: user.login },
    { expiresIn: "15m" }
  );
  const refreshToken = randomBytes(48).toString("hex");
  return { accessToken, refreshToken };
}

export async function login(app: FastifyInstance, input: LoginInput) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: input.slug } });
  if (!tenant || !tenant.is_active) {
    throw new Error("TENANT_NOT_FOUND");
  }

  const user = await prisma.user.findUnique({
    where: { tenant_id_login: { tenant_id: tenant.id, login: input.login } }
  });
  if (!user || !user.is_active) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const ok = await bcrypt.compare(input.password, user.password_hash);
  if (!ok) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const maxSessions = Math.max(1, user.max_sessions ?? 2);
  const sessionWhere = {
    user_id: user.id,
    tenant_id: tenant.id,
    revoked_at: null,
    expires_at: { gt: new Date() } as const
  };
  let activeSessions = await prisma.refreshToken.count({ where: sessionWhere });
  /* Limit to‘lganda yangi kirish uchun eng eski sessiyalarni yopamiz (logout qilinmagan dev/test qoldiqlari) */
  while (activeSessions >= maxSessions) {
    const toFree = activeSessions - maxSessions + 1;
    const oldest = await prisma.refreshToken.findMany({
      where: sessionWhere,
      orderBy: { created_at: "asc" },
      take: toFree,
      select: { id: true }
    });
    if (oldest.length === 0) break;
    await prisma.refreshToken.updateMany({
      where: { id: { in: oldest.map((r) => r.id) } },
      data: { revoked_at: new Date() }
    });
    activeSessions = await prisma.refreshToken.count({ where: sessionWhere });
  }

  const tokens = buildTokens(app, user);
  const deviceName = input.device_name?.trim().slice(0, 255) || null;
  const userAgent = input.user_agent?.trim().slice(0, 512) || null;
  const ipAddr = input.ip_address?.trim().slice(0, 64) || null;

  await prisma.refreshToken.create({
    data: {
      tenant_id: tenant.id,
      user_id: user.id,
      token_hash: hashToken(tokens.refreshToken),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      device_name: deviceName,
      user_agent: userAgent,
      ip_address: ipAddr
    }
  });

  return {
    ...tokens,
    user: {
      id: user.id,
      name: user.name,
      login: user.login,
      role: user.role,
      tenantId: user.tenant_id
    }
  };
}

export async function refresh(app: FastifyInstance, input: RefreshInput) {
  const tokenHash = hashToken(input.refreshToken);

  const existing = await prisma.refreshToken.findUnique({
    where: { token_hash: tokenHash },
    include: { user: true, tenant: true }
  });

  if (!existing || existing.revoked_at || existing.expires_at < new Date()) {
    throw new Error("INVALID_REFRESH");
  }
  if (!existing.tenant.is_active || !existing.user.is_active) {
    throw new Error("INVALID_REFRESH");
  }

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revoked_at: new Date() }
  });

  const tokens = buildTokens(app, existing.user);
  await prisma.refreshToken.create({
    data: {
      tenant_id: existing.tenant_id,
      user_id: existing.user_id,
      token_hash: hashToken(tokens.refreshToken),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      device_name: existing.device_name,
      user_agent: existing.user_agent,
      ip_address: existing.ip_address
    }
  });

  return tokens;
}

export async function logout(input: RefreshInput) {
  const tokenHash = hashToken(input.refreshToken);
  await prisma.refreshToken.updateMany({
    where: { token_hash: tokenHash, revoked_at: null },
    data: { revoked_at: new Date() }
  });
}
