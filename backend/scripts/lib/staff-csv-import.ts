/**
 * Xodimlar CSV import (side-effect yo‘q — faqat export).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";

type Row = {
  role: number;
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

export type StaffImportOptions = {
  prisma: PrismaClient;
  tenantId: number;
  tenantSlug: string;
  csvPath: string;
  cwdForRelativePath: string;
  delim: string;
  defaultPassword: string;
  dry: boolean;
};

function roleFromNum(n: number): "agent" | "expeditor" | "supervisor" | "operator" | null {
  if (n === 1) return "agent";
  if (n === 2) return "expeditor";
  if (n === 3) return "supervisor";
  if (n === 4) return "operator";
  return null;
}

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      q = !q;
      continue;
    }
    if (!q && c === delim) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

function parseCsv(text: string, delim: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  return lines.map((l) => splitCsvLine(l, delim));
}

function headerIndex(header: string[], names: string[]): Record<string, number> {
  const lower = header.map((h) => h.trim().toLowerCase());
  const m: Record<string, number> = {};
  for (const n of names) {
    const i = lower.indexOf(n.toLowerCase());
    if (i >= 0) m[n] = i;
  }
  return m;
}

function pick(cells: string[], idx: number | undefined): string {
  if (idx === undefined || idx < 0 || idx >= cells.length) return "";
  return cells[idx]?.trim() ?? "";
}

async function resolveWarehouseId(
  prisma: PrismaClient,
  tenantId: number,
  name: string | null
): Promise<number | null> {
  if (!name) return null;
  const t = name.trim();
  const wh = await prisma.warehouse.findFirst({
    where: { tenant_id: tenantId, name: { equals: t, mode: "insensitive" } }
  });
  return wh?.id ?? null;
}

export async function runStaffImportFromCsv(opts: StaffImportOptions): Promise<void> {
  const {
    prisma,
    tenantId,
    tenantSlug,
    csvPath,
    cwdForRelativePath,
    delim,
    defaultPassword,
    dry
  } = opts;

  const abs = path.isAbsolute(csvPath) ? csvPath : path.join(cwdForRelativePath, csvPath);
  if (!fs.existsSync(abs)) {
    throw new Error(
      `Fayl yo‘q: ${abs}\nNamuna: backend/scripts/sample-staff.csv — IMPORT_STAFF_CSV='scripts/sample-staff.csv'`
    );
  }

  const raw = fs.readFileSync(abs, "utf8");
  const table = parseCsv(raw, delim);
  if (table.length < 2) throw new Error("CSV: kamida sarlavha + 1 qator");

  const h = headerIndex(table[0], [
    "role",
    "fio",
    "login",
    "password",
    "code",
    "phone",
    "branch",
    "territory",
    "warehouse",
    "trade_direction",
    "supervisor_code"
  ]);
  if (h.role === undefined || h.fio === undefined || h.login === undefined) {
    throw new Error("CSV: role, fio, login ustunlari majburiy");
  }

  const rows: Row[] = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const roleNum = Number(pick(cells, h.role));
    const fio = pick(cells, h.fio);
    const login = pick(cells, h.login).toLowerCase();
    if (!login || !fio || !Number.isInteger(roleNum)) continue;
    rows.push({
      role: roleNum,
      fio,
      login,
      password: pick(cells, h.password) || defaultPassword,
      code: pick(cells, h.code) || null,
      phone: pick(cells, h.phone) || null,
      branch: pick(cells, h.branch) || null,
      territory: pick(cells, h.territory) || null,
      warehouse: pick(cells, h.warehouse) || null,
      trade_direction: pick(cells, h.trade_direction) || null,
      supervisor_code: pick(cells, h.supervisor_code) || null
    });
  }

  const order = (role: number) => (role === 3 ? 0 : role === 4 ? 1 : role === 2 ? 2 : 3);
  rows.sort((a, b) => order(a.role) - order(b.role));

  console.log(`\n── Xodimlar (CSV) — tenant ${tenantSlug}, qatorlar: ${rows.length}, dry=${dry} ──`);

  const codeToUserId = new Map<string, number>();

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

  for (const row of rows) {
    const role = roleFromNum(row.role);
    if (!role) {
      console.warn(`? role ${row.role} — ${row.login}`);
      continue;
    }
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
        const whIdSync = await resolveWarehouseId(prisma, tenantId, row.warehouse);
        if (whIdSync != null) {
          if (existsLogin.warehouse_id !== whIdSync) {
            await prisma.user.update({
              where: { id: existsLogin.id },
              data: { warehouse_id: whIdSync }
            });
            console.log(`~ warehouse «${row.warehouse.trim()}» ← ${row.login}`);
          }
        } else {
          console.warn(`! ombor topilmadi «${row.warehouse}» — ${row.login}`);
        }
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

    const whId = await resolveWarehouseId(prisma, tenantId, row.warehouse);
    if (row.warehouse && whId == null) {
      console.warn(`! ombor topilmadi «${row.warehouse}» — ${row.login}`);
    }

    const parts = row.fio.split(/\s+/).filter(Boolean);
    const first_name = parts[0] || row.fio;
    const last_name = parts.length > 1 ? parts.slice(1).join(" ") : null;

    if (dry) {
      console.log(`[dry] ${role} ${row.login} code=${row.code ?? ""}`);
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
        role,
        phone: row.phone,
        code: row.code?.trim() || null,
        branch: row.branch,
        territory: row.territory,
        warehouse_id: whId,
        trade_direction: row.trade_direction,
        supervisor_user_id: null,
        app_access: true,
        max_sessions: role === "operator" ? 4 : 2,
        is_active: true,
        can_authorize: true
      }
    });
    if (row.code) codeToUserId.set(row.code.trim().toUpperCase(), created.id);
    console.log(`+ ${role} ${row.login}`);
  }

  if (!dry) {
    await refreshCodeMap();
    for (const row of rows) {
      if (row.role !== 1 || !row.supervisor_code) continue;
      const agent = await prisma.user.findFirst({
        where: { tenant_id: tenantId, login: row.login.toLowerCase() }
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
}
