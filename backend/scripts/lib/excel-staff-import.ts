/**
 * Bitta Excel fayldan bitta rol (agent / expeditor / supervisor) bo‘yicha xodimlar.
 * Ustunlar RU/EN — sinonimlar `excel-import-helpers` orqali.
 */

import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import * as path from "node:path";
import {
  cellNum,
  cellStr,
  colIndex,
  loadFirstSheet,
  sheetHeaderRow
} from "./excel-import-helpers";
import {
  loadWarehouseAliasesFile,
  resolveWarehouseIdFromList,
  type WarehouseRow
} from "./warehouse-resolve-import";

export type StaffExcelRole = "agent" | "expeditor" | "supervisor";

export type StaffExcelOptions = {
  prisma: PrismaClient;
  tenantId: number;
  tenantSlug: string;
  filePath: string;
  role: StaffExcelRole;
  defaultPassword: string;
  dry: boolean;
};

function suggestLogin(role: StaffExcelRole, code: string, fio: string): string {
  const c = code.replace(/\s+/g, "").replace(/[^\w.-]/g, "_").toLowerCase();
  if (c) {
    const p = role === "supervisor" ? "sup" : role === "expeditor" ? "exp" : "agt";
    return `${p}_${c}`.slice(0, 64);
  }
  const parts = fio.split(/\s+/).filter(Boolean);
  const slug = parts
    .slice(0, 2)
    .join("_")
    .replace(/[^\wа-яёА-ЯЁa-zA-Z0-9_]/g, "")
    .toLowerCase();
  return `${role === "supervisor" ? "sup" : role === "expeditor" ? "exp" : "agt"}_${slug || "user"}`.slice(0, 64);
}

async function ensureTerritoryLink(
  prisma: PrismaClient,
  tenantId: number,
  territoryName: string | null,
  userId: number,
  dry: boolean
): Promise<void> {
  const name = territoryName?.trim();
  if (!name) return;

  if (dry) return;

  let t = await prisma.territory.findFirst({
    where: { tenant_id: tenantId, name: { equals: name, mode: "insensitive" } }
  });
  if (!t) {
    const codeBase = name
      .replace(/[^\p{L}\p{N}]+/gu, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48);
    const code = `${tenantId}_${codeBase || "T"}`.slice(0, 64);
    t = await prisma.territory.create({
      data: {
        tenant_id: tenantId,
        name,
        code,
        is_active: true
      }
    });
    console.log(`  + territory «${name}»`);
  }

  const exists = await prisma.territoryUserLink.findFirst({
    where: { territory_id: t.id, user_id: userId }
  });
  if (!exists) {
    await prisma.territoryUserLink.create({
      data: { territory_id: t.id, user_id: userId }
    });
    console.log(`  ↳ territory link «${name}» → user ${userId}`);
  }
}

export async function runStaffExcelImport(opts: StaffExcelOptions): Promise<Map<string, number>> {
  const { prisma, tenantId, tenantSlug, filePath, role, defaultPassword, dry } = opts;
  const codeToUserId = new Map<string, number>();

  const ws = await loadFirstSheet(filePath);
  const headers = sheetHeaderRow(ws);
  if (headers.length === 0) throw new Error("Excel: bo‘sh sarlavha");

  const h = {
    fio: colIndex(headers, [
      "фио",
      "сотрудник",
      "ф.и.о.",
      "имя",
      "агент",
      "экспедитор",
      "супервайзер",
      "name",
      "fio",
      "сотрудник сети"
    ]),
    code: colIndex(headers, ["код", "табельный", "код сотрудника", "code", "id"]),
    phone: colIndex(headers, ["телефон", "тел.", "мобильный", "phone", "тел"]),
    branch: colIndex(headers, ["филиал", "branch"]),
    territory: colIndex(headers, ["территория", "зона", "territory", "район"]),
    warehouse: colIndex(headers, ["склад", "омбор", "warehouse"]),
    trade_direction: colIndex(headers, ["направление", "канал", "trade_direction", "giga", "торговое направление"]),
    supervisor_code: colIndex(headers, [
      "код супервайзера",
      "супервайзер",
      "supervisor_code",
      "руководитель",
      "код рук"
    ]),
    login: colIndex(headers, ["логин", "login"])
  };

  if (h.fio < 0) {
    throw new Error(
      `Excel (${filePath}): «ФИО» / «Сотрудник» ustuni topilmadi. Sarlavhalar: ${headers.join(" | ")}`
    );
  }

  type RowRec = {
    fio: string;
    login: string;
    password: string;
    code: string | null;
    phone: string | null;
    branch: string | null;
    territory: string | null;
    warehouse: string | null;
    trade_direction: string | null;
    supervisor_code: string | null;
  };

  const rows: RowRec[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const fio = cellStr(ws, r, h.fio);
    if (!fio) continue;
    const codeRaw = h.code >= 0 ? cellStr(ws, r, h.code) : "";
    const code = codeRaw || null;
    let login = h.login >= 0 ? cellStr(ws, r, h.login).toLowerCase() : "";
    if (!login) login = suggestLogin(role, code || fio, fio);
    login = login.toLowerCase().replace(/\s/g, "");
    if (!login) continue;

    rows.push({
      fio,
      login,
      password: defaultPassword,
      code,
      phone: h.phone >= 0 ? cellStr(ws, r, h.phone) || null : null,
      branch: h.branch >= 0 ? cellStr(ws, r, h.branch) || null : null,
      territory: h.territory >= 0 ? cellStr(ws, r, h.territory) || null : null,
      warehouse: h.warehouse >= 0 ? cellStr(ws, r, h.warehouse) || null : null,
      trade_direction: h.trade_direction >= 0 ? cellStr(ws, r, h.trade_direction) || null : null,
      supervisor_code: h.supervisor_code >= 0 ? cellStr(ws, r, h.supervisor_code) || null : null
    });
  }

  console.log(`\n── Excel xodimlar (${role}) — ${tenantSlug}, qatorlar: ${rows.length}, dry=${dry} ──`);

  const refreshCodeMap = async () => {
    const users = await prisma.user.findMany({
      where: { tenant_id: tenantId, code: { not: null } },
      select: { id: true, code: true }
    });
    for (const u of users) {
      if (u.code) codeToUserId.set(u.code.trim().toUpperCase(), u.id);
    }
  };

  await refreshCodeMap();

  const warehouseRows: WarehouseRow[] = await prisma.warehouse.findMany({
    where: { tenant_id: tenantId },
    select: { id: true, name: true }
  });
  const aliasEnv = process.env.IMPORT_WAREHOUSE_ALIASES_JSON?.trim();
  const aliasPath = aliasEnv
    ? path.isAbsolute(aliasEnv)
      ? aliasEnv
      : path.join(process.cwd(), aliasEnv)
    : path.join(process.cwd(), "scripts/data/excel/warehouse-aliases.json");
  const warehouseAliases = loadWarehouseAliasesFile(aliasPath);

  const roleStr = role;

  for (const row of rows) {
    if (row.password.length < 6) {
      console.warn(`? parol qisqa — ${row.login}`);
      continue;
    }

    const existsLogin = await prisma.user.findFirst({
      where: { tenant_id: tenantId, login: row.login }
    });
    if (existsLogin) {
      if (row.code) codeToUserId.set(row.code.trim().toUpperCase(), existsLogin.id);
      if (!dry && row.warehouse?.trim()) {
        const whIdSync = resolveWarehouseIdFromList(row.warehouse, warehouseRows, warehouseAliases);
        if (whIdSync != null && existsLogin.warehouse_id !== whIdSync) {
          await prisma.user.update({
            where: { id: existsLogin.id },
            data: { warehouse_id: whIdSync }
          });
          console.log(`~ warehouse «${row.warehouse.trim()}» ← ${row.login}`);
        }
      }
      if (!dry && row.territory && role === "agent") {
        await ensureTerritoryLink(prisma, tenantId, row.territory, existsLogin.id, dry);
      }
      console.log(`= skip login ${row.login}`);
      continue;
    }

    if (row.code) {
      const dupCode = await prisma.user.findFirst({
        where: { tenant_id: tenantId, code: row.code.trim() }
      });
      if (dupCode) {
        codeToUserId.set(row.code.trim().toUpperCase(), dupCode.id);
        console.log(`= skip code ${row.code}`);
        continue;
      }
    }

    const whId = resolveWarehouseIdFromList(row.warehouse, warehouseRows, warehouseAliases);
    if (row.warehouse && whId == null) {
      console.warn(`! ombor topilmadi «${row.warehouse}» — ${row.login}`);
    }

    const parts = row.fio.split(/\s+/).filter(Boolean);
    const first_name = parts[0] || row.fio;
    const last_name = parts.length > 1 ? parts.slice(1).join(" ") : null;

    if (dry) {
      console.log(`[dry] ${roleStr} ${row.login} code=${row.code ?? ""}`);
      continue;
    }

    const password_hash = await bcrypt.hash(row.password, 10);
    const created = await prisma.user.create({
      data: {
        tenant_id: tenantId,
        name: row.fio,
        first_name,
        last_name,
        middle_name: null,
        login: row.login,
        password_hash,
        role: roleStr,
        phone: row.phone,
        code: row.code?.trim() || null,
        branch: row.branch,
        territory: row.territory,
        warehouse_id: whId,
        trade_direction: row.trade_direction,
        supervisor_user_id: null,
        app_access: true,
        max_sessions: roleStr === "expeditor" ? 4 : 2,
        is_active: true,
        can_authorize: true
      }
    });
    if (row.code) codeToUserId.set(row.code.trim().toUpperCase(), created.id);
    console.log(`+ ${roleStr} ${row.login}`);

    if (role === "agent" && row.territory) {
      await ensureTerritoryLink(prisma, tenantId, row.territory, created.id, dry);
    }
  }

  if (!dry) {
    await refreshCodeMap();
    for (const row of rows) {
      if (role !== "agent" || !row.supervisor_code) continue;
      const agent = await prisma.user.findFirst({
        where: { tenant_id: tenantId, login: row.login }
      });
      if (!agent || agent.role !== "agent") continue;
      const sid = codeToUserId.get(row.supervisor_code.trim().toUpperCase());
      if (!sid) {
        console.warn(`! supervisor_code «${row.supervisor_code}» — ${row.login}`);
        continue;
      }
      const sup = await prisma.user.findFirst({
        where: { id: sid, tenant_id: tenantId, role: "supervisor", is_active: true }
      });
      if (!sup) {
        console.warn(`! supervayzer emas id=${sid} — ${row.login}`);
        continue;
      }
      await prisma.user.update({
        where: { id: agent.id },
        data: { supervisor_user_id: sid }
      });
      console.log(`↳ supervisor ${row.supervisor_code} → ${row.login}`);
    }
  }

  return codeToUserId;
}
