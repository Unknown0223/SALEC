import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

const marker = join(__dirname, ".db-integration-ready");
const dbReady = existsSync(marker) && readFileSync(marker, "utf8").trim() === "1";

const app = buildApp();

describe.skipIf(!dbReady)("bonus-rules API (database)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns bonus rules list for tenant after login", async () => {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });

    expect(loginResponse.status).toBe(200);
    const token = loginResponse.body.accessToken as string;

    const listResponse = await request(app.server)
      .get("/api/test1/bonus-rules")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body.data)).toBe(true);
    expect(typeof listResponse.body.total).toBe("number");
  });

  it("preview-qty: seed 6+1 in_blocks → 12 sotib olinganda 2 bonus", async () => {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(loginResponse.status).toBe(200);
    const token = loginResponse.body.accessToken as string;

    const listResponse = await request(app.server)
      .get("/api/test1/bonus-rules")
      .set("Authorization", `Bearer ${token}`);
    expect(listResponse.status).toBe(200);
    const sixOne = (listResponse.body.data as { id: number; name: string }[]).find(
      (r) => r.name === "6+1 aksiya"
    );
    expect(sixOne).toBeDefined();

    const preview = await request(app.server)
      .post(`/api/test1/bonus-rules/${sixOne!.id}/preview-qty`)
      .set("Authorization", `Bearer ${token}`)
      .send({ purchased_qty: 12 });

    expect(preview.status).toBe(200);
    expect(preview.body.bonus_qty).toBe(2);
    expect(preview.body.matched).toBe(true);
    expect(preview.body.in_blocks).toBe(true);
  });
});
