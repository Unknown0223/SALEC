import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

const marker = join(__dirname, ".db-integration-ready");
const dbReady = existsSync(marker) && readFileSync(marker, "utf8").trim() === "1";

const app = buildApp();

describe.skipIf(!dbReady)("warehouses API (database)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /warehouses → PATCH → DELETE (yangi ombor, qoldiq yo‘q)", async () => {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(loginResponse.status).toBe(200);
    const token = loginResponse.body.accessToken as string;

    const name = `IT-omb-${Date.now()}`;
    const create = await request(app.server)
      .post("/api/test1/warehouses")
      .set("Authorization", `Bearer ${token}`)
      .send({ name, type: "integratsiya", address: "test manzil" });
    expect(create.status).toBe(201);
    expect(create.body.name).toBe(name);
    expect(create.body.type).toBe("integratsiya");
    const id = create.body.id as number;

    const patch = await request(app.server)
      .patch(`/api/test1/warehouses/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: `${name}-v2`, address: null });
    expect(patch.status).toBe(200);
    expect(patch.body.name).toBe(`${name}-v2`);

    const list = await request(app.server)
      .get("/api/test1/warehouses")
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect((list.body.data as { id: number }[]).some((w) => w.id === id)).toBe(true);

    const del = await request(app.server)
      .delete(`/api/test1/warehouses/${id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(204);
  });

  it("POST duplicate name → 409", async () => {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    const token = loginResponse.body.accessToken as string;
    const name = `IT-dup-${Date.now()}`;
    const a = await request(app.server)
      .post("/api/test1/warehouses")
      .set("Authorization", `Bearer ${token}`)
      .send({ name });
    expect(a.status).toBe(201);
    const b = await request(app.server)
      .post("/api/test1/warehouses")
      .set("Authorization", `Bearer ${token}`)
      .send({ name });
    expect(b.status).toBe(409);
    await request(app.server)
      .delete(`/api/test1/warehouses/${a.body.id}`)
      .set("Authorization", `Bearer ${token}`);
  });
});
