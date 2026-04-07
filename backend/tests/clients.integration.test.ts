import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

const marker = join(__dirname, ".db-integration-ready");
const dbReady = existsSync(marker) && readFileSync(marker, "utf8").trim() === "1";

const app = buildApp();

describe.skipIf(!dbReady)("clients API (database)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns clients list for tenant after login", async () => {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });

    expect(loginResponse.status).toBe(200);
    const token = loginResponse.body.accessToken as string;

    const listResponse = await request(app.server)
      .get("/api/test1/clients")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body.data)).toBe(true);
    expect(typeof listResponse.body.total).toBe("number");
    expect(listResponse.body.page).toBe(1);
  });

  it("PATCH clients/:id updates credit_limit for admin", async () => {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(loginResponse.status).toBe(200);
    const token = loginResponse.body.accessToken as string;

    const listResponse = await request(app.server)
      .get("/api/test1/clients?page=1&limit=1")
      .set("Authorization", `Bearer ${token}`);
    const row = listResponse.body.data[0] as { id: number; credit_limit: string };
    const originalCredit = row.credit_limit;

    const patch = await request(app.server)
      .patch(`/api/test1/clients/${row.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ credit_limit: 1234567 });
    expect(patch.status).toBe(200);
    expect(patch.body.credit_limit).toBe("1234567");

    const revert = await request(app.server)
      .patch(`/api/test1/clients/${row.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ credit_limit: Number(originalCredit) });
    expect(revert.status).toBe(200);
  });

  it("GET clients/:id returns detail with open_orders_total", async () => {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(loginResponse.status).toBe(200);
    const token = loginResponse.body.accessToken as string;

    const listResponse = await request(app.server)
      .get("/api/test1/clients?page=1&limit=1")
      .set("Authorization", `Bearer ${token}`);
    const id = (listResponse.body.data[0] as { id: number }).id;

    const detail = await request(app.server)
      .get(`/api/test1/clients/${id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.id).toBe(id);
    expect(typeof detail.body.open_orders_total).toBe("string");
    expect(typeof detail.body.account_balance).toBe("string");
  });

  it("POST balance-movements adjusts account_balance for admin", async () => {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(loginResponse.status).toBe(200);
    const token = loginResponse.body.accessToken as string;

    const listResponse = await request(app.server)
      .get("/api/test1/clients?page=1&limit=1")
      .set("Authorization", `Bearer ${token}`);
    const id = (listResponse.body.data[0] as { id: number }).id;

    const before = await request(app.server)
      .get(`/api/test1/clients/${id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(before.status).toBe(200);
    const bal0 = before.body.account_balance as string;

    const post = await request(app.server)
      .post(`/api/test1/clients/${id}/balance-movements`)
      .set("Authorization", `Bearer ${token}`)
      .send({ delta: 100, note: "test topup" });
    expect(post.status).toBe(201);
    expect(post.body.account_balance).toBeDefined();

    const after = await request(app.server)
      .get(`/api/test1/clients/${id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(after.status).toBe(200);
    expect(Number(after.body.account_balance)).toBe(Number(bal0) + 100);

    const revert = await request(app.server)
      .post(`/api/test1/clients/${id}/balance-movements`)
      .set("Authorization", `Bearer ${token}`)
      .send({ delta: -100, note: "test revert" });
    expect(revert.status).toBe(201);
  });

  it("POST clients creates minimal row and created_from filter includes it", async () => {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(loginResponse.status).toBe(200);
    const token = loginResponse.body.accessToken as string;

    const unique = `API-New-${Date.now()}`;
    const create = await request(app.server)
      .post("/api/test1/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: unique, phone: null });
    expect(create.status).toBe(201);
    const id = create.body.id as number;
    expect(typeof id).toBe("number");

    const today = new Date().toISOString().slice(0, 10);
    const list = await request(app.server)
      .get(`/api/test1/clients?page=1&limit=500&created_from=${today}&search=${encodeURIComponent(unique)}`)
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    const ids = (list.body.data as { id: number }[]).map((r) => r.id);
    expect(ids).toContain(id);
  });

  it("GET clients/export returns CSV and total header for admin", async () => {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(loginResponse.status).toBe(200);
    const token = loginResponse.body.accessToken as string;

    const res = await request(app.server)
      .get("/api/test1/clients/export?page=1&limit=5")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(String(res.headers["content-type"] ?? "")).toMatch(/text\/csv/);
    expect(res.headers["x-clients-export-total"]).toBeDefined();
    expect(res.text).toContain("ID");
    expect(res.text).toContain("Nomi");
  });

  it("PATCH clients/bulk-active toggles is_active", async () => {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(loginResponse.status).toBe(200);
    const token = loginResponse.body.accessToken as string;

    const listResponse = await request(app.server)
      .get("/api/test1/clients?page=1&limit=1")
      .set("Authorization", `Bearer ${token}`);
    const id = (listResponse.body.data[0] as { id: number }).id;

    const off = await request(app.server)
      .patch("/api/test1/clients/bulk-active")
      .set("Authorization", `Bearer ${token}`)
      .send({ client_ids: [id], is_active: false });
    expect(off.status).toBe(200);
    expect(off.body.updated).toBe(1);

    const detailOff = await request(app.server)
      .get(`/api/test1/clients/${id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(detailOff.status).toBe(200);
    expect(detailOff.body.is_active).toBe(false);

    const on = await request(app.server)
      .patch("/api/test1/clients/bulk-active")
      .set("Authorization", `Bearer ${token}`)
      .send({ client_ids: [id], is_active: true });
    expect(on.status).toBe(200);
    expect(on.body.updated).toBe(1);

    const detailOn = await request(app.server)
      .get(`/api/test1/clients/${id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(detailOn.status).toBe(200);
    expect(detailOn.body.is_active).toBe(true);
  });
});
