/**
 * «Категория продукта» Excel: name + (ixtiyoriy) parent nomi, kod, tartib.
 */

import type { PrismaClient } from "@prisma/client";
import { cellNum, cellStr, colIndex, loadFirstSheet, sheetHeaderRow } from "./excel-import-helpers";

export type CategoriesExcelOptions = {
  prisma: PrismaClient;
  tenantId: number;
  tenantSlug: string;
  filePath: string;
  dry: boolean;
};

export async function runCategoriesExcelImport(opts: CategoriesExcelOptions): Promise<void> {
  const { prisma, tenantId, tenantSlug, filePath, dry } = opts;
  const ws = await loadFirstSheet(filePath);
  const headers = sheetHeaderRow(ws);

  const h = {
    name: colIndex(headers, [
      "категория",
      "название",
      "названия",
      "name",
      "группа",
      "наименование",
      "тип"
    ]),
    parent: colIndex(headers, ["родитель", "parent", "родительская", "верхний", "уровень 1", "группа в"]),
    code: colIndex(headers, ["код", "code", "артикул кат"]),
    sort: colIndex(headers, ["сортировка", "порядок", "sort", "№", "номер"]),
    defaultUnit: colIndex(headers, ["единицы измерения", "единица", "unit", "бирлик"]),
    comment: colIndex(headers, ["комментарий", "comment", "примечание", "изоҳ"])
  };

  if (h.name < 0) {
    throw new Error(
      `Excel categories (${filePath}): nom ustuni yo‘q (категория / название / названия …). Sarlavhalar: ${headers.join(" | ")}`
    );
  }

  type Row = {
    name: string;
    parent: string | null;
    code: string | null;
    sort: number | null;
    defaultUnit: string | null;
    comment: string | null;
  };
  const rows: Row[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const name = cellStr(ws, r, h.name);
    if (!name) continue;
    const parent = h.parent >= 0 ? cellStr(ws, r, h.parent) || null : null;
    const code = h.code >= 0 ? cellStr(ws, r, h.code) || null : null;
    const sort = h.sort >= 0 ? cellNum(ws, r, h.sort) : null;
    const defaultUnit = h.defaultUnit >= 0 ? cellStr(ws, r, h.defaultUnit) || null : null;
    const comment = h.comment >= 0 ? cellStr(ws, r, h.comment) || null : null;
    rows.push({ name, parent, code, sort, defaultUnit, comment });
  }

  console.log(`\n── Excel kategoriyalar — ${tenantSlug}, qatorlar: ${rows.length}, dry=${dry} ──`);

  const findCat = async (name: string, parentId: number | null) => {
    return prisma.productCategory.findFirst({
      where: {
        tenant_id: tenantId,
        parent_id: parentId,
        name: { equals: name.trim(), mode: "insensitive" }
      }
    });
  };

  for (let pass = 0; pass < 12; pass++) {
    let progressed = false;
    for (const row of rows) {
      const parentId: number | null = row.parent
        ? (await findCat(row.parent, null))?.id ??
          (await prisma.productCategory.findFirst({
            where: {
              tenant_id: tenantId,
              name: { equals: row.parent.trim(), mode: "insensitive" }
            }
          }))?.id ??
          null
        : null;

      if (row.parent && parentId == null) {
        continue;
      }

      const existing = await findCat(row.name, parentId);
      if (existing) {
        if (
          !dry &&
          (row.code != null ||
            row.sort != null ||
            row.defaultUnit != null ||
            row.comment != null)
        ) {
          await prisma.productCategory.update({
            where: { id: existing.id },
            data: {
              ...(row.code != null ? { code: row.code.slice(0, 24) } : {}),
              ...(row.sort != null ? { sort_order: Math.round(row.sort) } : {}),
              ...(row.defaultUnit != null
                ? { default_unit: row.defaultUnit.trim().slice(0, 64) }
                : {}),
              ...(row.comment != null ? { comment: row.comment.trim() || null } : {})
            }
          });
        }
        continue;
      }

      if (dry) {
        console.log(`[dry] category ${row.name} parent=${row.parent ?? ""}`);
        progressed = true;
        continue;
      }

      await prisma.productCategory.create({
        data: {
          tenant_id: tenantId,
          name: row.name.trim(),
          parent_id: parentId,
          code: row.code?.trim()?.slice(0, 24) || null,
          sort_order: row.sort != null ? Math.round(row.sort) : null,
          default_unit: row.defaultUnit?.trim()?.slice(0, 64) || null,
          comment: row.comment?.trim() || null,
          is_active: true
        }
      });
      console.log(`+ category «${row.name}»${parentId != null ? ` (parent id ${parentId})` : ""}`);
      progressed = true;
    }
    if (!progressed) break;
  }
}
