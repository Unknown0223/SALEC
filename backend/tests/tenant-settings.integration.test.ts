import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { prisma } from "../src/config/database";

const marker = join(__dirname, ".db-integration-ready");
const dbReady = existsSync(marker) && readFileSync(marker, "utf8").trim() === "1";

const app = buildApp();

describe.skipIf(!dbReady)("tenant settings bonus-stack (database)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("admin GET/PATCH bonus-stack; operator GET 200, PATCH 403", async () => {
    const adminLogin = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(adminLogin.status).toBe(200);
    const adminToken = adminLogin.body.accessToken as string;

    const get0 = await request(app.server)
      .get("/api/test1/settings/bonus-stack")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(get0.status).toBe(200);
    expect(get0.body.bonus_stack.mode).toBe("all");

    const patch = await request(app.server)
      .patch("/api/test1/settings/bonus-stack")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        mode: "capped",
        max_units: 2,
        forbid_apply_all_eligible: true
      });
    expect(patch.status).toBe(200);
    expect(patch.body.bonus_stack.mode).toBe("capped");
    expect(patch.body.bonus_stack.max_units).toBe(2);
    expect(patch.body.bonus_stack.forbid_apply_all_eligible).toBe(true);

    const opLogin = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "operator",
      password: "secret123"
    });
    expect(opLogin.status).toBe(200);
    const opToken = opLogin.body.accessToken as string;
    const opGet = await request(app.server)
      .get("/api/test1/settings/bonus-stack")
      .set("Authorization", `Bearer ${opToken}`);
    expect(opGet.status).toBe(200);
    expect(opGet.body.bonus_stack.mode).toBe("capped");

    const opPatch = await request(app.server)
      .patch("/api/test1/settings/bonus-stack")
      .set("Authorization", `Bearer ${opToken}`)
      .send({ mode: "all" });
    expect(opPatch.status).toBe(403);

    await prisma.tenant.update({
      where: { slug: "test1" },
      data: { settings: {} as object }
    });
  });
});
