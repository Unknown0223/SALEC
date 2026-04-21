import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

const marker = join(__dirname, ".db-integration-ready");
const dbReady = existsSync(marker) && readFileSync(marker, "utf8").trim() === "1";

const app = buildApp();

describe.skipIf(!dbReady)("linkage constraint scope (database)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("selected_agent_id bo‘yicha options endpointlari bir xil scope qaytaradi", async () => {
    const login = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(login.status).toBe(200);
    const token = login.body.accessToken as string;

    const agentRes = await request(app.server)
      .get("/api/test1/agents?is_active=true")
      .set("Authorization", `Bearer ${token}`);
    expect(agentRes.status).toBe(200);
    const agents = (agentRes.body?.data ?? []) as Array<{ id: number }>;
    if (agents.length === 0) return;
    const selectedAgentId = agents[0]!.id;

    const scopeRes = await request(app.server)
      .get(`/api/test1/linkage/options?selected_agent_id=${selectedAgentId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(scopeRes.status).toBe(200);
    const scope = scopeRes.body?.data as {
      constrained: boolean;
      selected_agent_id: number | null;
      client_ids: number[];
      warehouse_ids: number[];
      cash_desk_ids: number[];
      expeditor_ids: number[];
    };
    expect(scope.constrained).toBe(true);
    expect(scope.selected_agent_id).toBe(selectedAgentId);

    const createCtxRes = await request(app.server)
      .get(`/api/test1/orders/create-context?selected_agent_id=${selectedAgentId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(createCtxRes.status).toBe(200);
    const createCtx = createCtxRes.body as {
      clients: Array<{ id: number }>;
      warehouses: Array<{ id: number }>;
      expeditors: Array<{ id: number }>;
    };
    const allowedClientIds = new Set(scope.client_ids);
    const allowedWarehouseIds = new Set(scope.warehouse_ids);
    const allowedExpeditorIds = new Set(scope.expeditor_ids);
    for (const row of createCtx.clients ?? []) {
      expect(allowedClientIds.has(row.id)).toBe(true);
    }
    for (const row of createCtx.warehouses ?? []) {
      expect(allowedWarehouseIds.has(row.id)).toBe(true);
    }
    for (const row of createCtx.expeditors ?? []) {
      expect(allowedExpeditorIds.has(row.id)).toBe(true);
    }

    const warehousesRes = await request(app.server)
      .get(`/api/test1/warehouses?selected_agent_id=${selectedAgentId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(warehousesRes.status).toBe(200);
    for (const w of (warehousesRes.body?.data ?? []) as Array<{ id: number }>) {
      expect(allowedWarehouseIds.has(w.id)).toBe(true);
    }

    const cashDesksRes = await request(app.server)
      .get(`/api/test1/cash-desks?is_active=true&selected_agent_id=${selectedAgentId}&page=1&limit=200`)
      .set("Authorization", `Bearer ${token}`);
    expect(cashDesksRes.status).toBe(200);
    const allowedCashDeskIds = new Set(scope.cash_desk_ids);
    for (const c of (cashDesksRes.body?.data ?? []) as Array<{ id: number }>) {
      expect(allowedCashDeskIds.has(c.id)).toBe(true);
    }
  });

  it("ko‘p-master (agent + cash_desk) uchun kesishma qoidasini qo‘llaydi", async () => {
    const login = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(login.status).toBe(200);
    const token = login.body.accessToken as string;

    const agentRes = await request(app.server)
      .get("/api/test1/agents?is_active=true")
      .set("Authorization", `Bearer ${token}`);
    expect(agentRes.status).toBe(200);
    const agents = (agentRes.body?.data ?? []) as Array<{ id: number }>;
    if (agents.length === 0) return;
    const selectedAgentId = agents[0]!.id;

    const baseScopeRes = await request(app.server)
      .get(`/api/test1/linkage/options?selected_agent_id=${selectedAgentId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(baseScopeRes.status).toBe(200);
    const baseScope = baseScopeRes.body?.data as {
      cash_desk_ids: number[];
    };
    if ((baseScope.cash_desk_ids ?? []).length === 0) return;
    const selectedCashDeskId = baseScope.cash_desk_ids[0]!;

    const intersectRes = await request(app.server)
      .get(
        `/api/test1/linkage/options?selected_agent_id=${selectedAgentId}&selected_cash_desk_id=${selectedCashDeskId}`
      )
      .set("Authorization", `Bearer ${token}`);
    expect(intersectRes.status).toBe(200);
    const intersectScope = intersectRes.body?.data as {
      constrained: boolean;
      selected_agent_id: number | null;
      selected_cash_desk_id: number | null;
      cash_desk_ids: number[];
      client_ids: number[];
    };
    expect(intersectScope.constrained).toBe(true);
    expect(intersectScope.selected_agent_id).toBe(selectedAgentId);
    expect(intersectScope.selected_cash_desk_id).toBe(selectedCashDeskId);
    expect(intersectScope.cash_desk_ids).toContain(selectedCashDeskId);
    expect(intersectScope.cash_desk_ids.length).toBeLessThanOrEqual(baseScope.cash_desk_ids.length);

    const payRes = await request(app.server)
      .get(
        `/api/test1/payments?page=1&limit=50&selected_agent_id=${selectedAgentId}&selected_cash_desk_id=${selectedCashDeskId}`
      )
      .set("Authorization", `Bearer ${token}`);
    expect(payRes.status).toBe(200);
    for (const row of (payRes.body?.data ?? []) as Array<{ cash_desk_id: number | null; client_id: number }>) {
      if (row.cash_desk_id != null) expect(row.cash_desk_id).toBe(selectedCashDeskId);
      if (intersectScope.client_ids.length > 0) {
        expect(intersectScope.client_ids.includes(row.client_id)).toBe(true);
      }
    }
  });
});
