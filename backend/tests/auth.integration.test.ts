import { createHash } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Tenant = { id: number; slug: string; name: string; is_active: boolean };
type User = {
  id: number;
  tenant_id: number;
  name: string;
  login: string;
  password_hash: string;
  role: string;
  is_active: boolean;
};
type RefreshToken = {
  id: number;
  tenant_id: number;
  user_id: number;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
};

const { state, mockPrisma } = vi.hoisted(() => {
  const state: {
    tenants: Tenant[];
    users: User[];
    refreshTokens: RefreshToken[];
  } = {
    tenants: [],
    users: [],
    refreshTokens: []
  };

  return {
    state,
    mockPrisma: {
      tenant: {
        findUnique: vi.fn(async ({ where }: { where: { slug: string } }) => {
          return state.tenants.find((t) => t.slug === where.slug) ?? null;
        })
      },
      user: {
        findUnique: vi.fn(async ({ where }: { where: { tenant_id_login: { tenant_id: number; login: string } } }) => {
          return (
            state.users.find(
              (u) => u.tenant_id === where.tenant_id_login.tenant_id && u.login === where.tenant_id_login.login
            ) ?? null
          );
        })
      },
      refreshToken: {
        create: vi.fn(async ({ data }: { data: Omit<RefreshToken, "id" | "revoked_at"> }) => {
          const row: RefreshToken = { id: state.refreshTokens.length + 1, ...data, revoked_at: null };
          state.refreshTokens.push(row);
          return row;
        }),
        findUnique: vi.fn(async ({ where, include }: { where: { token_hash: string }; include?: unknown }) => {
          const row = state.refreshTokens.find((r) => r.token_hash === where.token_hash);
          if (!row) return null;
          if (include) {
            const user = state.users.find((u) => u.id === row.user_id)!;
            const tenant = state.tenants.find((t) => t.id === row.tenant_id)!;
            return { ...row, user, tenant };
          }
          return row;
        }),
        update: vi.fn(async ({ where, data }: { where: { id: number }; data: { revoked_at: Date } }) => {
          const row = state.refreshTokens.find((r) => r.id === where.id);
          if (row) row.revoked_at = data.revoked_at;
          return row;
        }),
        updateMany: vi.fn(
          async ({ where, data }: { where: { token_hash: string; revoked_at: null }; data: { revoked_at: Date } }) => {
            let count = 0;
            state.refreshTokens.forEach((r) => {
              if (r.token_hash === where.token_hash && r.revoked_at === null) {
                r.revoked_at = data.revoked_at;
                count += 1;
              }
            });
            return { count };
          }
        )
      }
    }
  };
});

vi.mock("../src/config/database", () => ({
  prisma: mockPrisma
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(async (password: string, hash: string) => password === "secret123" && hash === "hashed-secret")
  }
}));

import { buildApp } from "../src/app";

const app = buildApp();

describe("auth + tenant integration", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    state.tenants = [
      { id: 1, slug: "andijon", name: "Andijon", is_active: true },
      { id: 2, slug: "namangan", name: "Namangan", is_active: true }
    ];
    state.users = [
      {
        id: 10,
        tenant_id: 1,
        name: "Agent One",
        login: "agent01",
        password_hash: "hashed-secret",
        role: "agent",
        is_active: true
      }
    ];
    state.refreshTokens = [];
    vi.clearAllMocks();
  });

  it("returns 401 for protected route without token", async () => {
    const response = await request(app.server).get("/api/andijon/protected");
    expect(response.status).toBe(401);
  });

  it("login works and grants access for the same tenant", async () => {
    const loginResponse = await request(app.server).post("/auth/login").send({
      slug: "andijon",
      login: "agent01",
      password: "secret123"
    });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.accessToken).toBeTypeOf("string");
    expect(loginResponse.body.refreshToken).toBeTypeOf("string");

    const protectedResponse = await request(app.server)
      .get("/api/andijon/protected")
      .set("Authorization", `Bearer ${loginResponse.body.accessToken}`);

    expect(protectedResponse.status).toBe(200);
    expect(protectedResponse.body.ok).toBe(true);
  });

  it("returns 403 on cross-tenant token usage", async () => {
    const loginResponse = await request(app.server).post("/auth/login").send({
      slug: "andijon",
      login: "agent01",
      password: "secret123"
    });

    const response = await request(app.server)
      .get("/api/namangan/protected")
      .set("Authorization", `Bearer ${loginResponse.body.accessToken}`);

    expect(response.status).toBe(403);
  });

  it("login works via /api/auth prefix", async () => {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "andijon",
      login: "agent01",
      password: "secret123"
    });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.accessToken).toBeTypeOf("string");
  });

  it("GET /auth/me returns user when authorized", async () => {
    const loginResponse = await request(app.server).post("/auth/login").send({
      slug: "andijon",
      login: "agent01",
      password: "secret123"
    });

    const meResponse = await request(app.server)
      .get("/auth/me")
      .set("Authorization", `Bearer ${loginResponse.body.accessToken}`);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user.login).toBe("agent01");
    expect(meResponse.body.user.role).toBe("agent");
  });

  it("GET /api/auth/me returns user when authorized", async () => {
    const loginResponse = await request(app.server).post("/auth/login").send({
      slug: "andijon",
      login: "agent01",
      password: "secret123"
    });

    const meResponse = await request(app.server)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${loginResponse.body.accessToken}`);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user.tenantId).toBe(1);
  });

  it("refresh rotates refresh token", async () => {
    const loginResponse = await request(app.server).post("/auth/login").send({
      slug: "andijon",
      login: "agent01",
      password: "secret123"
    });

    const oldHash = createHash("sha256").update(loginResponse.body.refreshToken).digest("hex");

    const refreshResponse = await request(app.server).post("/auth/refresh").send({
      refreshToken: loginResponse.body.refreshToken
    });

    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.body.accessToken).toBeTypeOf("string");
    expect(refreshResponse.body.refreshToken).toBeTypeOf("string");

    const oldTokenRow = state.refreshTokens.find((r) => r.token_hash === oldHash);
    expect(oldTokenRow?.revoked_at).not.toBeNull();
  });
});
