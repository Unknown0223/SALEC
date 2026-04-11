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

  async function adminToken(): Promise<string> {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(loginResponse.status).toBe(200);
    return loginResponse.body.accessToken as string;
  }

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

  describe.sequential("create/read/update discount & bonus scopes", () => {
    it("POST inactive manual discount → GET → DELETE", async () => {
      const token = await adminToken();
      const name = `IT-discount-${Date.now()}`;
      const post = await request(app.server)
        .post("/api/test1/bonus-rules")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name,
          type: "discount",
          discount_pct: 8,
          is_manual: true,
          is_active: false,
          priority: -9_000_000
        });
      expect(post.status).toBe(201);
      expect(post.body.type).toBe("discount");
      expect(Number(post.body.discount_pct)).toBe(8);
      expect(post.body.sum_threshold_scope).toBe("order");

      const get = await request(app.server)
        .get(`/api/test1/bonus-rules/${post.body.id}`)
        .set("Authorization", `Bearer ${token}`);
      expect(get.status).toBe(200);
      expect(get.body.name).toBe(name);

      const del = await request(app.server)
        .delete(`/api/test1/bonus-rules/${post.body.id}`)
        .set("Authorization", `Bearer ${token}`);
      expect(del.status).toBe(200);
    });

    it("POST qty with sum_threshold_scope calendar_month → PUT order → DELETE", async () => {
      const token = await adminToken();
      const name = `IT-qty-month-${Date.now()}`;
      const post = await request(app.server)
        .post("/api/test1/bonus-rules")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name,
          type: "qty",
          is_manual: true,
          is_active: false,
          priority: -9_000_001,
          sum_threshold_scope: "calendar_month",
          in_blocks: true,
          conditions: [{ step_qty: 6, bonus_qty: 1, sort_order: 0 }]
        });
      expect(post.status).toBe(201);
      expect(post.body.sum_threshold_scope).toBe("calendar_month");

      const put = await request(app.server)
        .put(`/api/test1/bonus-rules/${post.body.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ sum_threshold_scope: "order" });
      expect(put.status).toBe(200);
      expect(put.body.sum_threshold_scope).toBe("order");

      const del = await request(app.server)
        .delete(`/api/test1/bonus-rules/${post.body.id}`)
        .set("Authorization", `Bearer ${token}`);
      expect(del.status).toBe(200);
    });

    it("POST sum gift with calendar_month scope → GET → DELETE", async () => {
      const token = await adminToken();
      const name = `IT-sum-month-${Date.now()}`;
      const post = await request(app.server)
        .post("/api/test1/bonus-rules")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name,
          type: "sum",
          min_sum: 9_999_999,
          free_qty: 1,
          sum_threshold_scope: "calendar_month",
          is_manual: true,
          is_active: false,
          priority: -9_000_002
        });
      expect(post.status).toBe(201);
      expect(post.body.type).toBe("sum");
      expect(post.body.sum_threshold_scope).toBe("calendar_month");
      expect(Number(post.body.min_sum)).toBe(9_999_999);

      const del = await request(app.server)
        .delete(`/api/test1/bonus-rules/${post.body.id}`)
        .set("Authorization", `Bearer ${token}`);
      expect(del.status).toBe(200);
    });
  });
});
