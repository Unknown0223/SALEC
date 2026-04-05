/**
 * Mahsulotlar: JSON massiv, `sku` bo‘yicha idempotent upsert.
 * Shakl: [{ "sku": "...", "name": "...", "unit"?: "dona", "barcode"?: "..." }]
 */

import * as fs from "node:fs";
import type { PrismaClient } from "@prisma/client";

export type ProductJsonRow = {
  sku: string;
  name: string;
  unit?: string;
  barcode?: string | null;
};

export async function runProductsImportFromJson(
  prisma: PrismaClient,
  opts: { tenantId: number; filePath: string; dry: boolean }
): Promise<void> {
  const { tenantId, filePath, dry } = opts;
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw) as unknown;
  if (!Array.isArray(data)) {
    throw new Error("JSON: kutilgan format — massiv [{ sku, name, ... }]");
  }

  let n = 0;
  for (const item of data) {
    if (item == null || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const sku = typeof row.sku === "string" ? row.sku.trim() : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!sku || !name) continue;
    const unit = typeof row.unit === "string" && row.unit.trim() ? row.unit.trim() : "dona";
    const barcode =
      typeof row.barcode === "string" && row.barcode.trim() ? row.barcode.trim() : null;

    if (dry) {
      console.log(`[dry] product ${sku}`);
      n++;
      continue;
    }

    await prisma.product.upsert({
      where: { tenant_id_sku: { tenant_id: tenantId, sku } },
      create: {
        tenant_id: tenantId,
        sku,
        name,
        unit,
        barcode,
        is_active: true
      },
      update: { name, unit, ...(barcode != null ? { barcode } : {}) }
    });
    console.log(`• ${sku}`);
    n++;
  }
  console.log(`Mahsulotlar: ${n} qator ishlatildi (${filePath}).`);
}
