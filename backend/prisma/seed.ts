import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Seed ma’lumotlari — `docs/PHASE_PROGRESS.md` dagi test/reja bo‘limlari bilan mos.
 * Ishlatish: `npx prisma db seed`
 */

async function ensureWarehouse(tenantId: number, name: string, type: string) {
  const found = await prisma.warehouse.findFirst({
    where: { tenant_id: tenantId, name }
  });
  if (found) return found;
  return prisma.warehouse.create({
    data: { tenant_id: tenantId, name, type }
  });
}

async function ensureCategory(tenantId: number, name: string, parentId: number | null = null) {
  const found = await prisma.productCategory.findFirst({
    where: { tenant_id: tenantId, name }
  });
  if (found) return found;
  return prisma.productCategory.create({
    data: { tenant_id: tenantId, name, parent_id: parentId }
  });
}

async function ensureClient(
  tenantId: number,
  name: string,
  phone: string,
  extra?: { category?: string; address?: string; credit_limit?: Prisma.Decimal }
) {
  const existing = await prisma.client.findFirst({
    where: { tenant_id: tenantId, name }
  });
  const norm = phone.replace(/\D/g, "") || "";
  if (existing) {
    if (norm) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE "clients" SET "phone_normalized" = ${norm}
        WHERE "id" = ${existing.id}
          AND ("phone_normalized" IS NULL OR "phone_normalized" = '')
      `);
    }
    return existing;
  }
  const c = await prisma.client.create({
    data: {
      tenant_id: tenantId,
      name,
      phone,
      address: extra?.address ?? null,
      category: extra?.category ?? "retail",
      credit_limit: extra?.credit_limit ?? new Prisma.Decimal(0)
    }
  });
  if (norm) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "clients" SET "phone_normalized" = ${norm} WHERE "id" = ${c.id}
    `);
  }
  return c;
}

async function main() {
  const password_hash = await bcrypt.hash("secret123", 10);

  const test1 = await prisma.tenant.upsert({
    where: { slug: "test1" },
    update: {},
    create: {
      slug: "test1",
      name: "Test Tenant 1",
      plan: "basic",
      is_active: true
    }
  });

  const demo = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      slug: "demo",
      name: "Demo Kompaniya",
      plan: "pro",
      is_active: true
    }
  });

  for (const tenant of [test1, demo]) {
    await prisma.user.upsert({
      where: { tenant_id_login: { tenant_id: tenant.id, login: "admin" } },
      update: { password_hash },
      create: {
        tenant_id: tenant.id,
        name: "Admin",
        login: "admin",
        password_hash,
        role: "admin",
        is_active: true
      }
    });
  }

  await prisma.user.upsert({
    where: { tenant_id_login: { tenant_id: test1.id, login: "operator" } },
    update: { password_hash },
    create: {
      tenant_id: test1.id,
      name: "Operator (seed)",
      login: "operator",
      password_hash,
      role: "operator",
      is_active: true
    }
  });

  const whMain = await ensureWarehouse(test1.id, "Asosiy ombor", "main");
  await ensureWarehouse(test1.id, "Filial ombor", "branch");

  const catDrinks = await ensureCategory(test1.id, "Ichimliklar");
  const catFood = await ensureCategory(test1.id, "Oziq-ovqat");

  const productDefs = [
    { sku: "SKU-001", name: "Mahsulot 1", unit: "quti", categoryId: catDrinks.id },
    { sku: "SKU-002", name: "Mahsulot 2", unit: "quti", categoryId: catDrinks.id },
    { sku: "SKU-003", name: "Mahsulot 3", unit: "dona", categoryId: catFood.id },
    { sku: "SKU-004", name: "Mahsulot 4", unit: "litr", categoryId: catFood.id },
    { sku: "SKU-005", name: "Mahsulot 5", unit: "kg", categoryId: catFood.id }
  ];

  for (const p of productDefs) {
    await prisma.product.upsert({
      where: { tenant_id_sku: { tenant_id: test1.id, sku: p.sku } },
      update: { name: p.name, unit: p.unit, category_id: p.categoryId },
      create: {
        tenant_id: test1.id,
        sku: p.sku,
        name: p.name,
        unit: p.unit,
        category_id: p.categoryId,
        is_active: true
      }
    });
  }

  const products = await prisma.product.findMany({
    where: { tenant_id: test1.id },
    orderBy: { sku: "asc" }
  });

  for (const product of products) {
    await prisma.stock.upsert({
      where: {
        tenant_id_warehouse_id_product_id: {
          tenant_id: test1.id,
          warehouse_id: whMain.id,
          product_id: product.id
        }
      },
      update: { qty: 100, reserved_qty: 0 },
      create: {
        tenant_id: test1.id,
        warehouse_id: whMain.id,
        product_id: product.id,
        qty: 100,
        reserved_qty: 0
      }
    });
  }

  const retailBySku: Record<string, number> = {
    "SKU-001": 25000,
    "SKU-002": 60000,
    "SKU-003": 15000,
    "SKU-004": 8000,
    "SKU-005": 45000
  };
  for (const product of products) {
    const retail = retailBySku[product.sku] ?? 10000;
    const wholesale = Math.round(retail * 0.88 * 100) / 100;
    for (const [priceType, amount] of [
      ["retail", retail],
      ["wholesale", wholesale]
    ] as const) {
      await prisma.productPrice.upsert({
        where: {
          tenant_id_product_id_price_type: {
            tenant_id: test1.id,
            product_id: product.id,
            price_type: priceType
          }
        },
        create: {
          tenant_id: test1.id,
          product_id: product.id,
          price_type: priceType,
          price: new Prisma.Decimal(amount)
        },
        update: { price: new Prisma.Decimal(amount) }
      });
    }
  }

  await ensureClient(test1.id, "Asosiy mijoz (seed)", "+998901000001", {
    category: "retail",
    address: "Toshkent",
    /** 0 = zakazda kredit tekshiruvi o‘chiq; >0 bo‘lsa ochiq zakazlar + yangi summa limitdan oshmasin */
    credit_limit: new Prisma.Decimal(0)
  });
  await prisma.client.updateMany({
    where: { tenant_id: test1.id, name: "Asosiy mijoz (seed)" },
    data: { credit_limit: new Prisma.Decimal(0) }
  });
  await ensureClient(test1.id, "Optom mijoz (seed)", "+998901000002", {
    category: "wholesale",
    credit_limit: new Prisma.Decimal("20000000")
  });

  const dupPhone = "+998901112233";
  const dupNorm = dupPhone.replace(/\D/g, "");
  for (const name of ["Mijoz A (dublikat)", "Mijoz B (dublikat)"]) {
    const ex = await prisma.client.findFirst({
      where: { tenant_id: test1.id, name }
    });
    if (!ex) {
      const c = await prisma.client.create({
        data: {
          tenant_id: test1.id,
          name,
          phone: dupPhone,
          category: "retail"
        }
      });
      await prisma.$executeRaw(Prisma.sql`
        UPDATE "clients" SET "phone_normalized" = ${dupNorm} WHERE "id" = ${c.id}
      `);
    } else {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE "clients"
        SET "phone_normalized" = ${dupNorm}
        WHERE "id" = ${ex.id} AND ("phone_normalized" IS NULL OR "phone_normalized" = '')
      `);
    }
  }

  const existingBonus = await prisma.bonusRule.findFirst({
    where: { tenant_id: test1.id, name: "6+1 aksiya" }
  });
  if (!existingBonus) {
    await prisma.bonusRule.create({
      data: {
        tenant_id: test1.id,
        name: "6+1 aksiya",
        type: "qty",
        buy_qty: 6,
        free_qty: 1,
        priority: 10,
        is_active: true
      }
    });
  }

  if (
    !(await prisma.bonusRule.findFirst({
      where: { tenant_id: test1.id, name: "[seed] Min summa 500 000" }
    }))
  ) {
    await prisma.bonusRule.create({
      data: {
        tenant_id: test1.id,
        name: "[seed] Min summa 500 000",
        type: "sum",
        min_sum: new Prisma.Decimal("500000"),
        priority: 8,
        is_active: true,
        client_category: null
      }
    });
  }

  if (
    !(await prisma.bonusRule.findFirst({
      where: { tenant_id: test1.id, name: "[seed] Chegirma 10%" }
    }))
  ) {
    await prisma.bonusRule.create({
      data: {
        tenant_id: test1.id,
        name: "[seed] Chegirma 10%",
        type: "discount",
        discount_pct: new Prisma.Decimal("10"),
        priority: 5,
        is_active: true
      }
    });
  }

  if (
    !(await prisma.bonusRule.findFirst({
      where: { tenant_id: test1.id, name: "[seed] Oraliq 10–30 dona (qadam + cheklov)" }
    }))
  ) {
    await prisma.bonusRule.create({
      data: {
        tenant_id: test1.id,
        name: "[seed] Oraliq 10–30 dona (qadam + cheklov)",
        type: "qty",
        priority: 7,
        is_active: true,
        in_blocks: true,
        conditions: {
          create: [
            {
              min_qty: new Prisma.Decimal(10),
              max_qty: new Prisma.Decimal(30),
              step_qty: new Prisma.Decimal(10),
              bonus_qty: new Prisma.Decimal(1),
              max_bonus_qty: new Prisma.Decimal(2),
              sort_order: 0
            }
          ]
        }
      }
    });
  }

  const p2ForDisc = await prisma.product.findFirst({
    where: { tenant_id: test1.id, sku: "SKU-002" }
  });
  const p3ForSum = await prisma.product.findFirst({
    where: { tenant_id: test1.id, sku: "SKU-003" }
  });
  if (p2ForDisc) {
    await prisma.bonusRule.updateMany({
      where: { tenant_id: test1.id, name: "[seed] Chegirma 10%" },
      data: { product_ids: [p2ForDisc.id] }
    });
  }
  if (p3ForSum) {
    await prisma.bonusRule.updateMany({
      where: { tenant_id: test1.id, name: "[seed] Min summa 500 000" },
      data: { free_qty: 1, bonus_product_ids: [p3ForSum.id] }
    });
  }

  const mainClient = await prisma.client.findFirst({
    where: { tenant_id: test1.id, name: "Asosiy mijoz (seed)" }
  });
  const p1 = await prisma.product.findFirst({
    where: { tenant_id: test1.id, sku: "SKU-001" }
  });
  const p2 = await prisma.product.findFirst({
    where: { tenant_id: test1.id, sku: "SKU-002" }
  });

  if (mainClient && p1 && p2) {
    const ord = await prisma.order.findFirst({
      where: { tenant_id: test1.id, number: "ORD-SEED-001" }
    });
    if (!ord) {
      await prisma.order.create({
        data: {
          tenant_id: test1.id,
          number: "ORD-SEED-001",
          client_id: mainClient.id,
          warehouse_id: whMain.id,
          status: "new",
          total_sum: new Prisma.Decimal("550000.00"),
          bonus_sum: new Prisma.Decimal("0"),
          items: {
            create: [
              {
                product_id: p1.id,
                qty: new Prisma.Decimal(10),
                price: new Prisma.Decimal("25000"),
                total: new Prisma.Decimal("250000"),
                is_bonus: false
              },
              {
                product_id: p2.id,
                qty: new Prisma.Decimal(5),
                price: new Prisma.Decimal("60000"),
                total: new Prisma.Decimal("300000"),
                is_bonus: false
              }
            ]
          }
        }
      });
    }
  }

  const demoWh = await ensureWarehouse(demo.id, "Demo ombor", "main");
  if (!(await prisma.product.findFirst({ where: { tenant_id: demo.id, sku: "DEMO-001" } }))) {
    await prisma.product.create({
      data: {
        tenant_id: demo.id,
        sku: "DEMO-001",
        name: "Demo mahsulot A",
        unit: "dona",
        is_active: true
      }
    });
  }
  const demoProd = await prisma.product.findFirst({
    where: { tenant_id: demo.id, sku: "DEMO-001" }
  });
  if (demoProd) {
    await prisma.stock.upsert({
      where: {
        tenant_id_warehouse_id_product_id: {
          tenant_id: demo.id,
          warehouse_id: demoWh.id,
          product_id: demoProd.id
        }
      },
      update: { qty: 50 },
      create: {
        tenant_id: demo.id,
        warehouse_id: demoWh.id,
        product_id: demoProd.id,
        qty: 50,
        reserved_qty: 0
      }
    });
    await prisma.productPrice.upsert({
      where: {
        tenant_id_product_id_price_type: {
          tenant_id: demo.id,
          product_id: demoProd.id,
          price_type: "retail"
        }
      },
      create: {
        tenant_id: demo.id,
        product_id: demoProd.id,
        price_type: "retail",
        price: new Prisma.Decimal(12000)
      },
      update: { price: new Prisma.Decimal(12000) }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
