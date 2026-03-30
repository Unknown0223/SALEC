import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

const marker = join(__dirname, ".db-integration-ready");
const dbReady = existsSync(marker) && readFileSync(marker, "utf8").trim() === "1";

const app = buildApp();

describe.skipIf(!dbReady)("products & prices API (database)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("product-prices resolve returns seeded retail for SKU-001", async () => {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(loginResponse.status).toBe(200);
    const token = loginResponse.body.accessToken as string;

    const listResponse = await request(app.server)
      .get("/api/test1/products?page=1&limit=50&include_prices=true")
      .set("Authorization", `Bearer ${token}`);
    expect(listResponse.status).toBe(200);
    const rows = listResponse.body.data as { id: number; sku: string }[];
    const p001 = rows.find((r) => r.sku === "SKU-001");
    expect(p001).toBeDefined();

    const resolve = await request(app.server)
      .get(`/api/test1/product-prices/resolve?product_id=${p001!.id}&price_type=retail`)
      .set("Authorization", `Bearer ${token}`);
    expect(resolve.status).toBe(200);
    expect(resolve.body.price).toBe("25000");
  });

  it("PUT /products/:id/prices syncs then GET lists", async () => {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    const token = loginResponse.body.accessToken as string;

    const listResponse = await request(app.server)
      .get("/api/test1/products?page=1&limit=1&include_prices=true")
      .set("Authorization", `Bearer ${token}`);
    const pid = listResponse.body.data[0].id as number;

    const putRes = await request(app.server)
      .put(`/api/test1/products/${pid}/prices`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [
          { price_type: "retail", price: 111 },
          { price_type: "wholesale", price: 99 }
        ]
      });
    expect(putRes.status).toBe(200);
    expect(putRes.body.data).toHaveLength(2);

    const getRes = await request(app.server)
      .get(`/api/test1/products/${pid}/prices`)
      .set("Authorization", `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.some((x: { price_type: string }) => x.price_type === "retail")).toBe(true);

    await request(app.server)
      .put(`/api/test1/products/${pid}/prices`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [
          { price_type: "retail", price: 25000 },
          { price_type: "wholesale", price: 22000 }
        ]
      });
  });
});
