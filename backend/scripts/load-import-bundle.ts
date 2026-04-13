/**
 * Bir martalik JSON dan tenant, admin, ombor, xodimlar, mijozlar, mahsulotlar (sodda maydonlar).
 *
 * Fayl: scripts/data/import-bundle.example.json ni nusxalab to‘ldiring, keyin:
 *
 *   $env:IMPORT_BUNDLE_PATH="scripts/data/mening-bandle.json"
 *   $env:CONFIRM_IMPORT_BUNDLE="yes"
 *   $env:IMPORT_TENANT_SLUG="mycompany"   # JSON dagi tenant.slug bilan bir xil bo‘lsin
 *   npx tsx scripts/load-import-bundle.ts
 *
 * Sinash (bazaga yozmaydi): IMPORT_BUNDLE_DRY_RUN=1
 * Production: ALLOW_PROD_BUNDLE_IMPORT=true
 *
 * Eslatma: murakkab spravochniklar, Excel agent/prays, zakazlar — hali `npm run import:once`
 * va `npm run import:excel-bundle` orqali; bu skript «minimal boshlang‘ich qatlam».
 */

import * as fs from "node:fs";
import * as path from "node:path";
import "dotenv/config";
import bcrypt from "bcryptjs";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

const StaffRow = z.object({
  login: z.string().min(1),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(["admin", "operator", "agent", "supervisor", "cashier", "expeditor"]),
  code: z.string().nullable().optional(),
  branch: z.string().nullable().optional()
});

const ClientRow = z.object({
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  inn: z.string().nullable().optional(),
  legal_name: z.string().nullable().optional(),
  client_code: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  credit_limit: z.string().optional().default("0")
});

const ProductRow = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  unit: z.string().min(1),
  retail_price: z.string().min(1),
  initial_stock_qty: z.string().optional().default("0")
});

const BundleSchema = z.object({
  version: z.literal(1),
  tenant: z.object({
    slug: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/i, "slug: lotin, raqam, defis"),
    name: z.string().min(1),
    phone: z.string().nullable().optional(),
    address: z.string().nullable().optional()
  }),
  admin: z.object({
    login: z.string().min(1),
    password: z.string().min(6),
    display_name: z.string().min(1)
  }),
  warehouse: z
    .object({
      name: z.string().min(1),
      type: z.string().nullable().optional()
    })
    .optional(),
  staff: z.array(StaffRow).default([]),
  clients: z.array(ClientRow).default([]),
  products: z.array(ProductRow).default([])
});

function truthy(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}

async function main() {
  if (process.env.CONFIRM_IMPORT_BUNDLE !== "yes") {
    console.error("CONFIRM_IMPORT_BUNDLE=yes qo‘ying.");
    process.exit(1);
  }

  if (process.env.NODE_ENV === "production" && !truthy(process.env.ALLOW_PROD_BUNDLE_IMPORT)) {
    console.error("Production: ALLOW_PROD_BUNDLE_IMPORT=true");
    process.exit(1);
  }

  const rawPath = (process.env.IMPORT_BUNDLE_PATH || "").trim();
  if (!rawPath) {
    console.error("IMPORT_BUNDLE_PATH=... (masalan scripts/data/mening-bandle.json)");
    process.exit(1);
  }

  const cwd = process.cwd();
  const abs = path.isAbsolute(rawPath) ? rawPath : path.join(cwd, rawPath);
  if (!fs.existsSync(abs)) {
    console.error(`Fayl yo‘q: ${abs}`);
    process.exit(1);
  }

  const dry = truthy(process.env.IMPORT_BUNDLE_DRY_RUN);
  const json = JSON.parse(fs.readFileSync(abs, "utf8"));
  const bundle = BundleSchema.parse(json);

  const envSlug = (process.env.IMPORT_TENANT_SLUG || "").trim();
  if (envSlug && envSlug !== bundle.tenant.slug) {
    console.error(
      `IMPORT_TENANT_SLUG (${envSlug}) va JSON tenant.slug (${bundle.tenant.slug}) mos emas.`
    );
    process.exit(1);
  }

  console.log(`Bundle: ${abs}\nTenant slug: ${bundle.tenant.slug}\nDRY_RUN: ${dry}\n`);

  if (dry) {
    console.log("Dry run — yozuvlar qilinmadi.");
    return;
  }

  const tenant = await prisma.tenant.upsert({
    where: { slug: bundle.tenant.slug },
    update: {
      name: bundle.tenant.name,
      phone: bundle.tenant.phone ?? undefined,
      address: bundle.tenant.address ?? undefined,
      is_active: true
    },
    create: {
      slug: bundle.tenant.slug,
      name: bundle.tenant.name,
      phone: bundle.tenant.phone ?? null,
      address: bundle.tenant.address ?? null,
      plan: "basic",
      is_active: true
    }
  });

  const adminHash = await bcrypt.hash(bundle.admin.password, 10);
  await prisma.user.upsert({
    where: { tenant_id_login: { tenant_id: tenant.id, login: bundle.admin.login } },
    update: {
      password_hash: adminHash,
      name: bundle.admin.display_name,
      role: "admin",
      is_active: true,
      can_authorize: true,
      app_access: true
    },
    create: {
      tenant_id: tenant.id,
      name: bundle.admin.display_name,
      login: bundle.admin.login,
      password_hash: adminHash,
      role: "admin",
      is_active: true,
      can_authorize: true,
      app_access: true
    }
  });

  let whId: number | null = null;
  if (bundle.warehouse) {
    const existingWh = await prisma.warehouse.findFirst({
      where: { tenant_id: tenant.id, name: bundle.warehouse.name }
    });
    const wh =
      existingWh ??
      (await prisma.warehouse.create({
        data: {
          tenant_id: tenant.id,
          name: bundle.warehouse.name,
          type: bundle.warehouse.type ?? "main",
          is_active: true
        }
      }));
    if (existingWh && bundle.warehouse.type != null) {
      await prisma.warehouse.update({
        where: { id: wh.id },
        data: { type: bundle.warehouse.type, is_active: true }
      });
    }
    whId = wh.id;
  }

  let importCategory = await prisma.productCategory.findFirst({
    where: { tenant_id: tenant.id, name: "Import (bundle)" }
  });
  if (!importCategory) {
    importCategory = await prisma.productCategory.create({
      data: { tenant_id: tenant.id, name: "Import (bundle)" }
    });
  }

  const defPass = (process.env.IMPORT_DEFAULT_PASSWORD || "Parol123!").trim();
  for (const s of bundle.staff) {
    const hash = await bcrypt.hash(s.password || defPass, 10);
    await prisma.user.upsert({
      where: { tenant_id_login: { tenant_id: tenant.id, login: s.login } },
      update: {
        password_hash: hash,
        name: s.name,
        role: s.role,
        code: s.code ?? null,
        branch: s.branch ?? null,
        is_active: true,
        can_authorize: true,
        app_access: true
      },
      create: {
        tenant_id: tenant.id,
        name: s.name,
        login: s.login,
        password_hash: hash,
        role: s.role,
        code: s.code ?? null,
        branch: s.branch ?? null,
        is_active: true,
        can_authorize: true,
        app_access: true
      }
    });
  }

  for (const c of bundle.clients) {
    const credit = new Prisma.Decimal(c.credit_limit || "0");
    const code = c.client_code?.trim() || null;
    const existing =
      code != null
        ? await prisma.client.findFirst({ where: { tenant_id: tenant.id, client_code: code } })
        : null;
    if (existing) {
      await prisma.client.update({
        where: { id: existing.id },
        data: {
          name: c.name,
          phone: c.phone ?? undefined,
          inn: c.inn ?? undefined,
          legal_name: c.legal_name ?? undefined,
          category: c.category ?? undefined,
          credit_limit: credit
        }
      });
      const norm = (c.phone ?? "").replace(/\D/g, "");
      if (norm) {
        await prisma.$executeRaw(Prisma.sql`
          UPDATE "clients" SET "phone_normalized" = ${norm} WHERE "id" = ${existing.id}
        `);
      }
      continue;
    }
    const created = await prisma.client.create({
      data: {
        tenant_id: tenant.id,
        name: c.name,
        phone: c.phone ?? null,
        inn: c.inn ?? null,
        legal_name: c.legal_name ?? null,
        client_code: code,
        category: c.category ?? "retail",
        credit_limit: credit
      }
    });
    const norm = (c.phone ?? "").replace(/\D/g, "");
    if (norm) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE "clients" SET "phone_normalized" = ${norm} WHERE "id" = ${created.id}
      `);
    }
  }

  for (const p of bundle.products) {
    const product = await prisma.product.upsert({
      where: { tenant_id_sku: { tenant_id: tenant.id, sku: p.sku } },
      update: {
        name: p.name,
        unit: p.unit,
        category_id: importCategory.id,
        is_active: true
      },
      create: {
        tenant_id: tenant.id,
        sku: p.sku,
        name: p.name,
        unit: p.unit,
        category_id: importCategory.id,
        is_active: true
      }
    });

    const retail = new Prisma.Decimal(p.retail_price);
    await prisma.productPrice.upsert({
      where: {
        tenant_id_product_id_price_type: {
          tenant_id: tenant.id,
          product_id: product.id,
          price_type: "retail"
        }
      },
      update: { price: retail },
      create: {
        tenant_id: tenant.id,
        product_id: product.id,
        price_type: "retail",
        price: retail
      }
    });

    if (whId != null) {
      const qty = new Prisma.Decimal(p.initial_stock_qty || "0");
      if (qty.gt(0)) {
        await prisma.stock.upsert({
          where: {
            tenant_id_warehouse_id_product_id: {
              tenant_id: tenant.id,
              warehouse_id: whId,
              product_id: product.id
            }
          },
          update: { qty },
          create: {
            tenant_id: tenant.id,
            warehouse_id: whId,
            product_id: product.id,
            qty,
            reserved_qty: new Prisma.Decimal(0)
          }
        });
      }
    }
  }

  console.log(
    `OK: tenant id=${tenant.id} slug=${tenant.slug}\n` +
      `  Admin: ${bundle.admin.login}\n` +
      `  Xodimlar: ${bundle.staff.length}, mijozlar: ${bundle.clients.length}, mahsulotlar: ${bundle.products.length}\n` +
      "Keyin: npm run import:once (spravochniklar) va kerak bo‘lsa import:excel-bundle.\n"
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
