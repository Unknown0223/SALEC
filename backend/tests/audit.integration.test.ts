import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

const marker = join(__dirname, ".db-integration-ready");
const dbReady = existsSync(marker) && readFileSync(marker, "utf8").trim() === "1";

const app = buildApp();

describe.skipIf(!dbReady)("audit-events API (database)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("operator cannot list audit-events", async () => {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "operator",
      password: "secret123"
    });
    expect(loginResponse.status).toBe(200);
    const token = loginResponse.body.accessToken as string;

    const res = await request(app.server).get("/api/test1/audit-events").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("admin sees warehouse create in audit-events", async () => {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(loginResponse.status).toBe(200);
    const token = loginResponse.body.accessToken as string;

    const whName = `AuditWh_${Date.now()}`;
    const createWh = await request(app.server)
      .post("/api/test1/warehouses")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: whName, type: "test", address: null });
    expect(createWh.status).toBe(201);
    const whId = createWh.body.id as number;

    const audit = await request(app.server)
      .get(`/api/test1/audit-events?entity_type=warehouse&entity_id=${whId}&limit=20`)
      .set("Authorization", `Bearer ${token}`);
    expect(audit.status).toBe(200);
    const rows = audit.body.data as Array<{ action: string; entity_type: string; entity_id: string }>;
    expect(rows.some((r) => r.action === "create" && r.entity_type === "warehouse" && r.entity_id === String(whId))).toBe(
      true
    );
  });
});
