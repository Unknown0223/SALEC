import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { prisma } from "../src/config/database";

const marker = join(__dirname, ".db-integration-ready");
const dbReady = existsSync(marker) && readFileSync(marker, "utf8").trim() === "1";

const app = buildApp();

/** Seed zaxirasi `type: main` omborda — `name` bo‘yicha birinchi qator har doim shu bo‘lmasligi mumkin */
async function mainWarehouseId(token: string): Promise<number> {
  const list = await request(app.server).get("/api/test1/warehouses").set("Authorization", `Bearer ${token}`);
  expect(list.status).toBe(200);
  const rows = list.body.data as { id: number; name: string; type: string | null }[];
  expect(rows.length).toBeGreaterThan(0);
  const main = rows.find((w) => w.type === "main") ?? rows.find((w) => /asosiy/i.test(w.name)) ?? rows[0];
  return main.id;
}

/** Seed qty=100 yetmaydi; ba'zi testlar orderni to‘g‘ridan-to‘g‘ri o‘chiradi va reserved_qty “osib” qoladi. */
async function ensureOrdersIntegrationStock(): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "test1" } });
  if (!tenant) return;
  const mainWh =
    (await prisma.warehouse.findFirst({ where: { tenant_id: tenant.id, type: "main" } })) ??
    (await prisma.warehouse.findFirst({
      where: { tenant_id: tenant.id, name: { contains: "Asosiy", mode: "insensitive" } }
    }));
  if (!mainWh) return;
  const products = await prisma.product.findMany({
    where: { tenant_id: tenant.id, sku: { in: ["SKU-001", "SKU-002", "SKU-003"] } }
  });
  const plenty = new Prisma.Decimal("1000000");
  const zero = new Prisma.Decimal("0");
  for (const p of products) {
    await prisma.stock.upsert({
      where: {
        tenant_id_warehouse_id_product_id: {
          tenant_id: tenant.id,
          warehouse_id: mainWh.id,
          product_id: p.id
        }
      },
      create: {
        tenant_id: tenant.id,
        warehouse_id: mainWh.id,
        product_id: p.id,
        qty: plenty,
        reserved_qty: zero
      },
      update: { qty: plenty, reserved_qty: zero }
    });
  }
}

describe.skipIf(!dbReady)("orders API (database)", () => {
  /** Bir xil ombor/zaxira — parallel `it` bir-birini buzadi (InsufficientStock). */
  describe.sequential("orders sequential", () => {
  beforeAll(async () => {
    await app.ready();
    await ensureOrdersIntegrationStock();
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST order uses retail price and GET list", async () => {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(loginResponse.status).toBe(200);
    const token = loginResponse.body.accessToken as string;

    const clientsRes = await request(app.server)
      .get("/api/test1/clients?page=1&limit=5&search=Asosiy")
      .set("Authorization", `Bearer ${token}`);
    const clientId = clientsRes.body.data[0].id as number;

    const productsRes = await request(app.server)
      .get("/api/test1/products?page=1&limit=5&search=SKU-001")
      .set("Authorization", `Bearer ${token}`);
    const productId = productsRes.body.data[0].id as number;
    const warehouseId = await mainWarehouseId(token);

    const create = await request(app.server)
      .post("/api/test1/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        client_id: clientId,
        warehouse_id: warehouseId,
        items: [{ product_id: productId, qty: 2 }]
      });

    expect(create.status).toBe(201);
    expect(create.body.items).toHaveLength(1);
    expect(create.body.total_sum).toBe("50000");
    expect(create.body.number).toBe(String(create.body.id));
    expect(create.body.allowed_next_statuses).toContain("confirmed");
    expect(create.body.allowed_next_statuses).toContain("cancelled");

    const patchOk = await request(app.server)
      .patch(`/api/test1/orders/${create.body.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "confirmed" });
    expect(patchOk.status).toBe(200);
    expect(patchOk.body.status).toBe("confirmed");
    expect(patchOk.body.status_logs).toHaveLength(1);
    expect(patchOk.body.status_logs[0].from_status).toBe("new");
    expect(patchOk.body.status_logs[0].to_status).toBe("confirmed");
    expect(patchOk.body.status_logs[0].user_login).toBe("admin");
    expect(patchOk.body.allowed_next_statuses).toContain("picking");

    const detail = await request(app.server)
      .get(`/api/test1/orders/${create.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.status_logs).toHaveLength(1);

    const patchBad = await request(app.server)
      .patch(`/api/test1/orders/${create.body.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "delivered" });
    expect(patchBad.status).toBe(400);
    expect(patchBad.body.error).toBe("InvalidTransition");

    const list = await request(app.server)
      .get("/api/test1/orders?page=1&limit=10")
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.some((o: { id: number }) => o.id === create.body.id)).toBe(true);

    const listByClient = await request(app.server)
      .get(`/api/test1/orders?page=1&limit=50&client_id=${clientId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(listByClient.status).toBe(200);
    expect(
      listByClient.body.data.every((o: { client_id: number }) => o.client_id === clientId)
    ).toBe(true);
  });

  it("POST order with two lines sums retail totals", async () => {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(loginResponse.status).toBe(200);
    const token = loginResponse.body.accessToken as string;

    const clientsRes = await request(app.server)
      .get("/api/test1/clients?page=1&limit=5&search=Asosiy")
      .set("Authorization", `Bearer ${token}`);
    const clientId = clientsRes.body.data[0].id as number;

    const p1 = await request(app.server)
      .get("/api/test1/products?page=1&limit=5&search=SKU-001")
      .set("Authorization", `Bearer ${token}`);
    const p2 = await request(app.server)
      .get("/api/test1/products?page=1&limit=5&search=SKU-002")
      .set("Authorization", `Bearer ${token}`);
    const id1 = p1.body.data[0].id as number;
    const id2 = p2.body.data[0].id as number;
    const warehouseId = await mainWarehouseId(token);

    const create = await request(app.server)
      .post("/api/test1/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        client_id: clientId,
        warehouse_id: warehouseId,
        items: [
          { product_id: id1, qty: 1 },
          { product_id: id2, qty: 1 }
        ]
      });

    expect(create.status).toBe(201);
    expect(create.body.items.filter((i: { is_bonus: boolean }) => !i.is_bonus)).toHaveLength(2);
    // Seed: 10% chegirma SKU-002 zakazda bo‘lsa butun yig‘indiga qo‘llanadi: 85000 * 0.9 = 76500
    expect(create.body.total_sum).toBe("76500");
  });

  it("POST order applies seed 6+1 qty bonus for 12 units", async () => {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(loginResponse.status).toBe(200);
    const token = loginResponse.body.accessToken as string;

    const clientsRes = await request(app.server)
      .get("/api/test1/clients?page=1&limit=5&search=Asosiy")
      .set("Authorization", `Bearer ${token}`);
    const clientId = clientsRes.body.data[0].id as number;

    const productsRes = await request(app.server)
      .get("/api/test1/products?page=1&limit=5&search=SKU-001")
      .set("Authorization", `Bearer ${token}`);
    const productId = productsRes.body.data[0].id as number;
    const warehouseId = await mainWarehouseId(token);

    const create = await request(app.server)
      .post("/api/test1/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        client_id: clientId,
        warehouse_id: warehouseId,
        items: [{ product_id: productId, qty: 12 }]
      });

    expect(create.status).toBe(201);
    expect(create.body.total_sum).toBe("300000");
    expect(create.body.bonus_sum).toBe("50000");
    const bonusItems = create.body.items.filter((i: { is_bonus: boolean }) => i.is_bonus);
    expect(bonusItems).toHaveLength(1);
    expect(bonusItems[0].qty).toBe("2");
    expect(bonusItems[0].total).toBe("50000");
  });

  it("POST order applies 10% discount only when cart has SKU-002 (seed rule scope)", async () => {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(loginResponse.status).toBe(200);
    const token = loginResponse.body.accessToken as string;

    const clientsRes = await request(app.server)
      .get("/api/test1/clients?page=1&limit=5&search=Asosiy")
      .set("Authorization", `Bearer ${token}`);
    const clientId = clientsRes.body.data[0].id as number;

    const productsRes = await request(app.server)
      .get("/api/test1/products?page=1&limit=5&search=SKU-002")
      .set("Authorization", `Bearer ${token}`);
    const productId = productsRes.body.data[0].id as number;
    const warehouseId = await mainWarehouseId(token);

    const create = await request(app.server)
      .post("/api/test1/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        client_id: clientId,
        warehouse_id: warehouseId,
        items: [{ product_id: productId, qty: 10 }]
      });

    expect(create.status).toBe(201);
    expect(create.body.total_sum).toBe("540000");
    expect(create.body.items.filter((i: { is_bonus: boolean }) => !i.is_bonus)).toHaveLength(1);
  });

  it("POST order sum bonus: 500k+ subtotal adds SKU-003 gift (seed)", async () => {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(loginResponse.status).toBe(200);
    const token = loginResponse.body.accessToken as string;

    const clientsRes = await request(app.server)
      .get("/api/test1/clients?page=1&limit=5&search=Asosiy")
      .set("Authorization", `Bearer ${token}`);
    const clientId = clientsRes.body.data[0].id as number;

    const productsRes = await request(app.server)
      .get("/api/test1/products?page=1&limit=5&search=SKU-001")
      .set("Authorization", `Bearer ${token}`);
    const productId = productsRes.body.data[0].id as number;
    const warehouseId = await mainWarehouseId(token);

    const create = await request(app.server)
      .post("/api/test1/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        client_id: clientId,
        warehouse_id: warehouseId,
        items: [{ product_id: productId, qty: 20 }]
      });

    expect(create.status).toBe(201);
    expect(create.body.total_sum).toBe("500000");
    expect(create.body.items.some((i: { is_bonus: boolean; sku: string }) => i.is_bonus && i.sku === "SKU-003")).toBe(
      true
    );
  });

  it("once_per_client: discount rule applies once per client, second order full price", async () => {
    const tenant = await prisma.tenant.findUnique({ where: { slug: "test1" } });
    expect(tenant).not.toBeNull();
    const tenantId = tenant!.id;

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: {} as object }
    });

    const freshClient = await prisma.client.create({
      data: {
        tenant_id: tenantId,
        name: "once-per-client (integration)",
        phone: "+998900000199",
        phone_normalized: "998900000199"
      }
    });

    await prisma.bonusRule.updateMany({
      where: { tenant_id: tenantId, name: "[seed] Chegirma 10%" },
      data: { once_per_client: true }
    });

    try {
      const loginResponse = await request(app.server).post("/api/auth/login").send({
        slug: "test1",
        login: "admin",
        password: "secret123"
      });
      expect(loginResponse.status).toBe(200);
      const token = loginResponse.body.accessToken as string;

      const productsRes = await request(app.server)
        .get("/api/test1/products?page=1&limit=5&search=SKU-002")
        .set("Authorization", `Bearer ${token}`);
      const productId = productsRes.body.data[0].id as number;
      const warehouseId = await mainWarehouseId(token);

      const first = await request(app.server)
        .post("/api/test1/orders")
        .set("Authorization", `Bearer ${token}`)
        .send({
          client_id: freshClient.id,
          warehouse_id: warehouseId,
          items: [{ product_id: productId, qty: 10 }]
        });
      expect(first.status).toBe(201);
      expect(first.body.total_sum).toBe("540000");

      const second = await request(app.server)
        .post("/api/test1/orders")
        .set("Authorization", `Bearer ${token}`)
        .send({
          client_id: freshClient.id,
          warehouse_id: warehouseId,
          items: [{ product_id: productId, qty: 10 }]
        });
      expect(second.status).toBe(201);
      expect(second.body.total_sum).toBe("600000");
    } finally {
      await prisma.order.deleteMany({ where: { client_id: freshClient.id } });
      await prisma.client.delete({ where: { id: freshClient.id } });
      await prisma.bonusRule.updateMany({
        where: { tenant_id: tenantId, name: "[seed] Chegirma 10%" },
        data: { once_per_client: false }
      });
    }
  });

  it("POST order rejects when open orders total + new order exceeds client credit_limit", async () => {
    const tenant = await prisma.tenant.findUnique({ where: { slug: "test1" } });
    expect(tenant).not.toBeNull();

    const freshClient = await prisma.client.create({
      data: {
        tenant_id: tenant!.id,
        name: "credit-test (integration)",
        phone: "+998900000298",
        phone_normalized: "998900000298",
        credit_limit: new Prisma.Decimal("50000")
      }
    });

    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(loginResponse.status).toBe(200);
    const token = loginResponse.body.accessToken as string;

    try {
      const productsRes = await request(app.server)
        .get("/api/test1/products?page=1&limit=5&search=SKU-001")
        .set("Authorization", `Bearer ${token}`);
      const productId = productsRes.body.data[0].id as number;
      const warehouseId = await mainWarehouseId(token);

      const first = await request(app.server)
        .post("/api/test1/orders")
        .set("Authorization", `Bearer ${token}`)
        .send({
          client_id: freshClient.id,
          warehouse_id: warehouseId,
          items: [{ product_id: productId, qty: 2 }]
        });
      expect(first.status).toBe(201);
      expect(first.body.total_sum).toBe("50000");

      const second = await request(app.server)
        .post("/api/test1/orders")
        .set("Authorization", `Bearer ${token}`)
        .send({
          client_id: freshClient.id,
          warehouse_id: warehouseId,
          items: [{ product_id: productId, qty: 1 }]
        });
      expect(second.status).toBe(400);
      expect(second.body.error).toBe("CreditLimitExceeded");
      expect(second.body.credit_limit).toBe("50000");
      expect(second.body.outstanding).toBe("50000");
      expect(second.body.order_total).toBe("25000");
    } finally {
      await prisma.order.deleteMany({ where: { client_id: freshClient.id } });
      await prisma.client.delete({ where: { id: freshClient.id } });
    }
  });

  it("PATCH orders/:id replaces payment lines and recomputes auto bonus", async () => {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(loginResponse.status).toBe(200);
    const token = loginResponse.body.accessToken as string;

    const clientsRes = await request(app.server)
      .get("/api/test1/clients?page=1&limit=5&search=Asosiy")
      .set("Authorization", `Bearer ${token}`);
    const clientId = clientsRes.body.data[0].id as number;

    const productsRes = await request(app.server)
      .get("/api/test1/products?page=1&limit=5&search=SKU-001")
      .set("Authorization", `Bearer ${token}`);
    const productId = productsRes.body.data[0].id as number;
    const warehouseId = await mainWarehouseId(token);

    const create = await request(app.server)
      .post("/api/test1/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        client_id: clientId,
        warehouse_id: warehouseId,
        items: [{ product_id: productId, qty: 1 }]
      });
    expect(create.status).toBe(201);
    expect(create.body.bonus_sum).toBe("0");

    const patched = await request(app.server)
      .patch(`/api/test1/orders/${create.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ product_id: productId, qty: 12 }]
      });
    expect(patched.status).toBe(200);
    expect(Number.parseFloat(patched.body.bonus_sum)).toBeGreaterThan(0);
    const bonusLines = patched.body.items.filter((i: { is_bonus: boolean }) => i.is_bonus);
    expect(bonusLines.length).toBeGreaterThan(0);
    const lineLogs = (patched.body.change_logs as { action: string; user_login: string | null }[]).filter(
      (c) => c.action === "lines"
    );
    expect(lineLogs.length).toBe(1);
    expect(lineLogs[0].user_login).toBe("admin");
  });

  it("PATCH orders/:id/meta appends change_logs", async () => {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(loginResponse.status).toBe(200);
    const token = loginResponse.body.accessToken as string;

    const whRes = await request(app.server)
      .get("/api/test1/warehouses")
      .set("Authorization", `Bearer ${token}`);
    expect(whRes.status).toBe(200);
    const warehouses = whRes.body.data as { id: number; name: string }[];
    expect(warehouses.length).toBeGreaterThanOrEqual(2);
    const whMain = await mainWarehouseId(token);
    const whB = warehouses.find((w) => w.id !== whMain)?.id ?? warehouses[1].id;

    const clientsRes = await request(app.server)
      .get("/api/test1/clients?page=1&limit=5&search=Asosiy")
      .set("Authorization", `Bearer ${token}`);
    const clientId = clientsRes.body.data[0].id as number;

    /* Oldingi testlar SKU-001 zaxirasini kamaytirishi mumkin — SKU-003 seedda kamroq tortiladi */
    const productsRes = await request(app.server)
      .get("/api/test1/products?page=1&limit=5&search=SKU-003")
      .set("Authorization", `Bearer ${token}`);
    const productId = productsRes.body.data[0].id as number;

    const create = await request(app.server)
      .post("/api/test1/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        client_id: clientId,
        warehouse_id: whMain,
        items: [{ product_id: productId, qty: 1 }]
      });
    expect(create.status).toBe(201);
    const orderId = create.body.id as number;

    const patched = await request(app.server)
      .patch(`/api/test1/orders/${orderId}/meta`)
      .set("Authorization", `Bearer ${token}`)
      .send({ warehouse_id: whB });
    expect(patched.status).toBe(200);
    const metaLogs = (patched.body.change_logs as { action: string }[]).filter(
      (c) => c.action === "meta"
    );
    expect(metaLogs.length).toBe(1);
  });

  it("PATCH orders/:id returns OrderNotEditable when status is picking", async () => {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(loginResponse.status).toBe(200);
    const token = loginResponse.body.accessToken as string;

    const clientsRes = await request(app.server)
      .get("/api/test1/clients?page=1&limit=5&search=Asosiy")
      .set("Authorization", `Bearer ${token}`);
    const clientId = clientsRes.body.data[0].id as number;

    const productsRes = await request(app.server)
      .get("/api/test1/products?page=1&limit=5&search=SKU-001")
      .set("Authorization", `Bearer ${token}`);
    const productId = productsRes.body.data[0].id as number;
    const warehouseId = await mainWarehouseId(token);

    const create = await request(app.server)
      .post("/api/test1/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        client_id: clientId,
        warehouse_id: warehouseId,
        items: [{ product_id: productId, qty: 1 }]
      });
    expect(create.status).toBe(201);

    await request(app.server)
      .patch(`/api/test1/orders/${create.body.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "confirmed" });
    await request(app.server)
      .patch(`/api/test1/orders/${create.body.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "picking" });

    const bad = await request(app.server)
      .patch(`/api/test1/orders/${create.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ product_id: productId, qty: 2 }]
      });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("OrderNotEditable");
  });

  it("operator cannot revert status; admin can", async () => {
    const adminLogin = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(adminLogin.status).toBe(200);
    const adminToken = adminLogin.body.accessToken as string;

    const clientsRes = await request(app.server)
      .get("/api/test1/clients?page=1&limit=5&search=Asosiy")
      .set("Authorization", `Bearer ${adminToken}`);
    const clientId = clientsRes.body.data[0].id as number;

    const productsRes = await request(app.server)
      .get("/api/test1/products?page=1&limit=5&search=SKU-001")
      .set("Authorization", `Bearer ${adminToken}`);
    const productId = productsRes.body.data[0].id as number;
    const warehouseId = await mainWarehouseId(adminToken);

    const create = await request(app.server)
      .post("/api/test1/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        client_id: clientId,
        warehouse_id: warehouseId,
        items: [{ product_id: productId, qty: 1 }]
      });
    expect(create.status).toBe(201);
    const orderId = create.body.id as number;

    await request(app.server)
      .patch(`/api/test1/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "confirmed" });
    await request(app.server)
      .patch(`/api/test1/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "picking" });

    const opLogin = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "operator",
      password: "secret123"
    });
    expect(opLogin.status).toBe(200);
    const opToken = opLogin.body.accessToken as string;

    const detailOp = await request(app.server)
      .get(`/api/test1/orders/${orderId}`)
      .set("Authorization", `Bearer ${opToken}`);
    expect(detailOp.status).toBe(200);
    expect(detailOp.body.allowed_next_statuses).not.toContain("confirmed");
    expect(detailOp.body.allowed_next_statuses).not.toContain("cancelled");

    const opRevert = await request(app.server)
      .patch(`/api/test1/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${opToken}`)
      .send({ status: "confirmed" });
    expect(opRevert.status).toBe(403);
    expect(opRevert.body.error).toBe("ForbiddenRevert");

    const adminRevert = await request(app.server)
      .patch(`/api/test1/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "confirmed" });
    expect(adminRevert.status).toBe(200);
    expect(adminRevert.body.status).toBe("confirmed");
  });

  it("only admin can reopen cancelled order to new", async () => {
    const adminLogin = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(adminLogin.status).toBe(200);
    const adminToken = adminLogin.body.accessToken as string;

    const clientsRes = await request(app.server)
      .get("/api/test1/clients?page=1&limit=5&search=Asosiy")
      .set("Authorization", `Bearer ${adminToken}`);
    const clientId = clientsRes.body.data[0].id as number;

    const productsRes = await request(app.server)
      .get("/api/test1/products?page=1&limit=5&search=SKU-001")
      .set("Authorization", `Bearer ${adminToken}`);
    const productId = productsRes.body.data[0].id as number;
    const warehouseId = await mainWarehouseId(adminToken);

    const create = await request(app.server)
      .post("/api/test1/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        client_id: clientId,
        warehouse_id: warehouseId,
        items: [{ product_id: productId, qty: 1 }]
      });
    expect(create.status).toBe(201);
    const orderId = create.body.id as number;

    await request(app.server)
      .patch(`/api/test1/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "cancelled" });

    const opLogin = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "operator",
      password: "secret123"
    });
    expect(opLogin.status).toBe(200);
    const opToken = opLogin.body.accessToken as string;

    const detailOp = await request(app.server)
      .get(`/api/test1/orders/${orderId}`)
      .set("Authorization", `Bearer ${opToken}`);
    expect(detailOp.status).toBe(200);
    expect(detailOp.body.allowed_next_statuses).toEqual([]);

    const opReopen = await request(app.server)
      .patch(`/api/test1/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${opToken}`)
      .send({ status: "new" });
    expect(opReopen.status).toBe(403);
    expect(opReopen.body.error).toBe("ForbiddenReopenCancelled");

    const detailAdmin = await request(app.server)
      .get(`/api/test1/orders/${orderId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(detailAdmin.status).toBe(200);
    expect(detailAdmin.body.allowed_next_statuses).toContain("new");

    const adminReopen = await request(app.server)
      .patch(`/api/test1/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "new" });
    expect(adminReopen.status).toBe(200);
    expect(adminReopen.body.status).toBe("new");
  });

  it("operator cannot PATCH order payment lines; admin can", async () => {
    const adminLogin = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(adminLogin.status).toBe(200);
    const adminToken = adminLogin.body.accessToken as string;

    const clientsRes = await request(app.server)
      .get("/api/test1/clients?page=1&limit=5&search=Asosiy")
      .set("Authorization", `Bearer ${adminToken}`);
    const clientId = clientsRes.body.data[0].id as number;

    const productsRes = await request(app.server)
      .get("/api/test1/products?page=1&limit=5&search=SKU-001")
      .set("Authorization", `Bearer ${adminToken}`);
    const productId = productsRes.body.data[0].id as number;
    const warehouseId = await mainWarehouseId(adminToken);

    const create = await request(app.server)
      .post("/api/test1/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        client_id: clientId,
        warehouse_id: warehouseId,
        items: [{ product_id: productId, qty: 1 }]
      });
    expect(create.status).toBe(201);
    const orderId = create.body.id as number;

    const opLogin = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "operator",
      password: "secret123"
    });
    expect(opLogin.status).toBe(200);
    const opToken = opLogin.body.accessToken as string;

    const opPatch = await request(app.server)
      .patch(`/api/test1/orders/${orderId}`)
      .set("Authorization", `Bearer ${opToken}`)
      .send({
        items: [{ product_id: productId, qty: 2 }]
      });
    expect(opPatch.status).toBe(403);
    expect(opPatch.body.error).toBe("ForbiddenOperatorOrderLinesEdit");

    const adminPatch = await request(app.server)
      .patch(`/api/test1/orders/${orderId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        items: [{ product_id: productId, qty: 2 }]
      });
    expect(adminPatch.status).toBe(200);
    expect(adminPatch.body.items?.length).toBeGreaterThan(0);
  });

  it("operator cannot cancel from picking/delivering; admin can", async () => {
    const adminLogin = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(adminLogin.status).toBe(200);
    const adminToken = adminLogin.body.accessToken as string;

    const clientsRes = await request(app.server)
      .get("/api/test1/clients?page=1&limit=5&search=Asosiy")
      .set("Authorization", `Bearer ${adminToken}`);
    const clientId = clientsRes.body.data[0].id as number;

    const productsRes = await request(app.server)
      .get("/api/test1/products?page=1&limit=5&search=SKU-001")
      .set("Authorization", `Bearer ${adminToken}`);
    const productId = productsRes.body.data[0].id as number;
    const warehouseId = await mainWarehouseId(adminToken);

    const create = await request(app.server)
      .post("/api/test1/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        client_id: clientId,
        warehouse_id: warehouseId,
        items: [{ product_id: productId, qty: 1 }]
      });
    expect(create.status).toBe(201);
    const orderId = create.body.id as number;

    await request(app.server)
      .patch(`/api/test1/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "confirmed" });
    await request(app.server)
      .patch(`/api/test1/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "picking" });

    const opLogin = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "operator",
      password: "secret123"
    });
    expect(opLogin.status).toBe(200);
    const opToken = opLogin.body.accessToken as string;

    const detailPicking = await request(app.server)
      .get(`/api/test1/orders/${orderId}`)
      .set("Authorization", `Bearer ${opToken}`);
    expect(detailPicking.body.allowed_next_statuses).not.toContain("cancelled");

    const opCancel = await request(app.server)
      .patch(`/api/test1/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${opToken}`)
      .send({ status: "cancelled" });
    expect(opCancel.status).toBe(403);
    expect(opCancel.body.error).toBe("ForbiddenOperatorCancelLate");

    const adminCancel = await request(app.server)
      .patch(`/api/test1/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "cancelled" });
    expect(adminCancel.status).toBe(200);
    expect(adminCancel.body.status).toBe("cancelled");
  });
  });
});
