/**
 * Excel eksportlari → User: agent | expeditor | supervisor.
 * import-once va alohida skriptlar chaqiradi.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import bcrypt from "bcryptjs";
import { Prisma, type PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const AGENT_HEADER_ALIASES: Record<string, string[]> = {
  fio: ["ф.и.о", "фио"],
  product: ["продукт"],
  agentType: ["тип агента"],
  code: ["код"],
  pinfl: ["пинфл"],
  consignment: ["консигнация"],
  apk: ["версия apk"],
  device: ["название устройства"],
  lastSync: ["последняя синхронизация"],
  phone: ["телефон"],
  authShort: ["авторизоваться"],
  priceType: ["тип цены"],
  warehouse: ["склад"],
  tradeDirection: ["направление торговли"],
  branch: ["филиал"],
  position: ["должность"],
  created: ["дата создания"],
  appAccess: ["доступ к приложение", "доступ к приложению"],
  activeSessions: ["количество активных сессий"],
  maxSessions: ["максимальное количество сессий"]
};

const EXPEDITOR_HEADER_ALIASES: Record<string, string[]> = {
  fio: ["ф.и.о", "фио"],
  authShort: ["авторизоваться"],
  phone: ["телефон"],
  code: ["код"],
  warehouse: ["склад"],
  apk: ["версия apk"],
  pinfl: ["пинфл"],
  territory: ["территория"],
  device: ["название устройства"],
  lastSync: ["последняя синхронизация"],
  branch: ["филиал"],
  position: ["должность"],
  appAccess: ["доступ к приложение", "доступ к приложению"],
  activeSessions: ["количество активных сессий"],
  maxSessions: ["максимальное количество сессий"]
};

const SUPERVISOR_HEADER_ALIASES: Record<string, string[]> = {
  fio: ["ф.и.о", "фио"],
  agentsCol: ["агент"],
  code: ["код"],
  login: ["логин"],
  pinfl: ["пинфл"],
  branch: ["филиал"],
  position: ["должность"],
  apk: ["версия apk"],
  appAccess: ["доступ к приложение", "доступ к приложению"],
  activeSessions: ["количество активных сессий"],
  maxSessions: ["максимальное количество сессий"]
};

function normHeader(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/ё/g, "е");
}

function buildHeaderMap(
  headerRow: unknown[],
  aliases: Record<string, string[]>
): Record<string, number> {
  const map: Record<string, number> = {};
  const cells = headerRow.map((c) => (c == null ? "" : String(c)));
  for (let i = 0; i < cells.length; i++) {
    const key = normHeader(cells[i]);
    if (!key) continue;
    for (const [field, als] of Object.entries(aliases)) {
      for (const a of als) {
        if (key === normHeader(a)) {
          map[field] = i;
          break;
        }
      }
    }
  }
  return map;
}

function cell(row: unknown[], idx: number | undefined): string {
  if (idx === undefined || idx < 0 || idx >= row.length) return "";
  const v = row[idx];
  if (v == null) return "";
  return String(v).replace(/\u00a0/g, " ").trim();
}

/** Agent / eksportdagi FIO — [...] ichida odam nomi */
function parseNameFromFio(raw: string): { displayName: string; first_name: string; last_name: string | null } {
  const t = raw.replace(/\u00a0/g, " ").trim();
  const m = t.match(/\[([^\]]+)\]/);
  const core = (m ? m[1] : t).trim();
  const parts = core.split(/\s+/).filter(Boolean);
  const first_name = parts[0] || core;
  const last_name = parts.length > 1 ? parts.slice(1).join(" ") : null;
  return { displayName: core || t, first_name, last_name };
}

/** Supervayzer: qavslar va sana kalta qoldiq — ko‘rinish nomi */
function parseSupervisorDisplayName(raw: string): {
  displayName: string;
  first_name: string;
  last_name: string | null;
} {
  const t = raw.replace(/\u00a0/g, " ").trim();
  const withoutBrackets = t.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
  const parts = withoutBrackets.split(/\s+/).filter(Boolean);
  const displayName = withoutBrackets || t;
  const first_name = parts[0] || displayName;
  const last_name = parts.length > 1 ? parts.slice(1).join(" ") : null;
  return { displayName, first_name, last_name };
}

function yesRu(v: string): boolean {
  const s = v.trim().toLowerCase();
  return s === "да" || s === "yes" || s === "true" || s === "1" || s === "ha";
}

function fromExcelSerial(n: unknown): Date | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 20000) return null;
  const whole = Math.floor(n);
  const frac = n - whole;
  const msDay = (whole - 25569) * 86400 * 1000;
  const msFrac = frac * 86400 * 1000;
  const d = new Date(msDay + msFrac);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDateCell(v: unknown): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === "number") return fromExcelSerial(v);
  if (typeof v === "string" && v.trim()) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

async function resolveFirstWarehouseId(
  prisma: PrismaClient,
  tenantId: number,
  raw: string
): Promise<{ id: number | null; tried: string[] }> {
  const tried: string[] = [];
  if (!raw.trim()) return { id: null, tried };
  for (const part of raw.split(",")) {
    const name = part.trim();
    if (!name) continue;
    tried.push(name);
    const wh = await prisma.warehouse.findFirst({
      where: { tenant_id: tenantId, name: { equals: name, mode: "insensitive" } }
    });
    if (wh) return { id: wh.id, tried };
  }
  return { id: null, tried };
}

function pickPriceType(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  return t.length > 512 ? t.slice(0, 512) : t;
}

function normPinfl(raw: string | null | undefined): string | null {
  if (raw == null || raw === "") return null;
  const d = String(raw).replace(/\D/g, "");
  if (!d) return null;
  return d.length >= 10 ? d.slice(0, 20) : null;
}

type StaffRole = "agent" | "expeditor" | "supervisor";

type StaffRowData = {
  name: string;
  first_name: string;
  last_name: string | null;
  code: string | null;
  phone: string | null;
  pinfl: string | null;
  consignment: boolean;
  apk_version: string | null;
  device_name: string | null;
  last_sync_at: Date | null;
  price_type: string | null;
  warehouse_id: number | null;
  disconnectWarehouse: boolean;
  trade_direction: string | null;
  territory: string | null;
  branch: string | null;
  position: string | null;
  app_access: boolean;
  max_sessions: number;
  role: StaffRole;
};

async function upsertStaffUser(
  prisma: PrismaClient,
  tenantId: number,
  login: string,
  dry: boolean,
  resetPassword: boolean,
  defaultPassword: string,
  row: StaffRowData
): Promise<{ created: boolean; updated: boolean; dryLine?: string }> {
  const existing =
    (await prisma.user.findFirst({
      where: { tenant_id: tenantId, login }
    })) ||
    (row.code
      ? await prisma.user.findFirst({
          where: { tenant_id: tenantId, code: row.code }
        })
      : null);

  if (dry) {
    return { created: false, updated: false, dryLine: `[dry] ${login} ${row.code ?? ""} | ${row.name}` };
  }

  const warehouseConnect =
    row.warehouse_id != null
      ? { connect: { id: row.warehouse_id } }
      : row.disconnectWarehouse
        ? { disconnect: true }
        : undefined;

  if (existing) {
    const updatePayload: Prisma.UserUpdateInput = {
      name: row.name,
      first_name: row.first_name,
      last_name: row.last_name,
      code: row.code,
      phone: row.phone,
      pinfl: row.pinfl,
      consignment: row.consignment,
      apk_version: row.apk_version,
      device_name: row.device_name,
      last_sync_at: row.last_sync_at,
      price_type: row.price_type,
      trade_direction: row.trade_direction,
      territory: row.territory,
      branch: row.branch,
      position: row.position,
      app_access: row.app_access,
      max_sessions: row.max_sessions,
      role: row.role,
      is_active: true,
      can_authorize: true
    };
    if (warehouseConnect !== undefined) updatePayload.warehouse = warehouseConnect;
    if (existing.login !== login) updatePayload.login = login;
    if (resetPassword) updatePayload.password_hash = await bcrypt.hash(defaultPassword, 10);
    await prisma.user.update({
      where: { id: existing.id },
      data: updatePayload
    });
    return { created: false, updated: true };
  }

  const password_hash = await bcrypt.hash(defaultPassword, 10);
  await prisma.user.create({
    data: {
      tenant_id: tenantId,
      login,
      password_hash,
      name: row.name,
      first_name: row.first_name,
      last_name: row.last_name,
      code: row.code,
      phone: row.phone,
      pinfl: row.pinfl,
      consignment: row.consignment,
      apk_version: row.apk_version,
      device_name: row.device_name,
      last_sync_at: row.last_sync_at,
      price_type: row.price_type,
      warehouse_id: row.warehouse_id ?? undefined,
      trade_direction: row.trade_direction,
      territory: row.territory,
      branch: row.branch,
      position: row.position,
      app_access: row.app_access,
      max_sessions: row.max_sessions,
      role: row.role,
      is_active: true,
      can_authorize: true
    }
  });
  return { created: true, updated: false };
}

function readMatrix(abs: string): { sheetName: string; matrix: unknown[][] } {
  const wb = XLSX.readFile(abs, { cellDates: true, raw: true });
  const sheetName = wb.SheetNames[0] || "Sheet1";
  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  return { sheetName, matrix };
}

// ─── resolve path helpers ─────────────────────────────────────────

export type AgentsXlsxResolvedPath =
  | { ok: true; path: string }
  | { ok: false; reason: "none" }
  | { ok: false; reason: "missing_env_file"; detail: string };

function resolveXlsxPath(
  cwdBackend: string,
  envPath: string | undefined,
  defaultCandidates: string[]
): AgentsXlsxResolvedPath {
  const trimmed = (envPath ?? "").trim();
  if (trimmed) {
    const abs = path.isAbsolute(trimmed) ? trimmed : path.join(cwdBackend, trimmed);
    if (!fs.existsSync(abs)) return { ok: false, reason: "missing_env_file", detail: abs };
    return { ok: true, path: abs };
  }
  for (const p of defaultCandidates) {
    if (fs.existsSync(p)) return { ok: true, path: p };
  }
  return { ok: false, reason: "none" };
}

/** AGENTS_XLSX_PATH yoki scripts/data/ dagi standart nomlar */
export function resolveAgentsXlsxPath(cwdBackend: string, envPath: string | undefined): AgentsXlsxResolvedPath {
  return resolveXlsxPath(cwdBackend, envPath, [
    path.join(cwdBackend, "scripts/data/active-agents.xlsx"),
    path.join(cwdBackend, "scripts/data/Активные агенты.xlsx"),
    path.join(cwdBackend, "scripts/data/Активные агенты (2).xlsx")
  ]);
}

export function resolveExpeditorsXlsxPath(
  cwdBackend: string,
  envPath: string | undefined
): AgentsXlsxResolvedPath {
  return resolveXlsxPath(cwdBackend, envPath, [
    path.join(cwdBackend, "scripts/data/active-expeditors.xlsx"),
    path.join(cwdBackend, "scripts/data/Активные экспедиторы.xlsx"),
    path.join(cwdBackend, "scripts/data/Активные Активные экспедиторы (2).xlsx")
  ]);
}

export function resolveSupervisorsXlsxPath(
  cwdBackend: string,
  envPath: string | undefined
): AgentsXlsxResolvedPath {
  return resolveXlsxPath(cwdBackend, envPath, [
    path.join(cwdBackend, "scripts/data/active-supervisors.xlsx"),
    path.join(cwdBackend, "scripts/data/Супервайзеры.xlsx"),
    path.join(cwdBackend, "scripts/data/Супервайзеры (1).xlsx")
  ]);
}

// ─── public runners ───────────────────────────────────────────────

export type RunStaffXlsxImportOpts = {
  prisma: PrismaClient;
  tenantId: number;
  tenantSlug: string;
  xlsxPath: string;
  dry: boolean;
  defaultPassword: string;
  resetPassword: boolean;
};

export async function runActiveAgentsXlsxImport(opts: RunStaffXlsxImportOpts): Promise<void> {
  const { prisma, tenantId, tenantSlug, xlsxPath: abs, dry, defaultPassword, resetPassword } = opts;

  if (defaultPassword.length < 6) {
    throw new Error("Agentlar: parol kamida 6 belgi.");
  }
  if (!fs.existsSync(abs)) throw new Error(`Agentlar Excel yo‘q: ${abs}`);

  const { sheetName, matrix } = readMatrix(abs);
  if (matrix.length < 2) throw new Error("Agentlar Excel: kamida sarlavha + 1 qator.");

  const h = buildHeaderMap(matrix[0] as unknown[], AGENT_HEADER_ALIASES);
  if (h.code === undefined || h.fio === undefined) {
    throw new Error("Agentlar Excel: «Код» va «Ф.И.О» topilmadi.");
  }

  console.log(
    `\n════════════  QO‘SHIMCHA: faol agentlar (Excel)  ════════════\n` +
      `Fayl: ${abs}\nList: ${sheetName}\nTenant: ${tenantSlug} (id=${tenantId})\nDRY_RUN=${dry}\n`
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] as unknown[];
    if (!row || row.every((c) => c === "" || c == null)) continue;

    const codeRaw = cell(row, h.code).toUpperCase().replace(/\s+/g, "");
    if (!codeRaw) {
      console.warn(`! qator ${r + 1}: kod bo‘sh — o‘tkazildi`);
      skipped++;
      continue;
    }

    const login = codeRaw.toLowerCase();
    const { displayName, first_name, last_name } = parseNameFromFio(cell(row, h.fio));
    const name = displayName || codeRaw;

    const pinfl = normPinfl(h.pinfl !== undefined ? cell(row, h.pinfl) : null);
    const consignmentFinal = yesRu(h.consignment !== undefined ? cell(row, h.consignment) : "");

    const apk_version = h.apk !== undefined ? cell(row, h.apk) || null : null;
    const device_name = h.device !== undefined ? cell(row, h.device) || null : null;
    const last_sync_at = parseDateCell(h.lastSync !== undefined ? row[h.lastSync] : undefined);

    const phone = h.phone !== undefined ? cell(row, h.phone) || null : null;
    const price_type = h.priceType !== undefined ? pickPriceType(cell(row, h.priceType)) : null;

    const warehouseRaw = h.warehouse !== undefined ? cell(row, h.warehouse) : "";
    const trade_direction = h.tradeDirection !== undefined ? cell(row, h.tradeDirection) || null : null;
    const branch = h.branch !== undefined ? cell(row, h.branch) || null : null;
    const position = h.position !== undefined ? cell(row, h.position) || null : null;

    const appRaw = h.appAccess !== undefined ? cell(row, h.appAccess) : "";
    const app_access = appRaw.trim() === "" ? true : yesRu(appRaw);

    let max_sessions = 2;
    if (h.maxSessions !== undefined) {
      const n = Number(cell(row, h.maxSessions));
      if (Number.isFinite(n) && n >= 1 && n <= 99) max_sessions = Math.floor(n);
    }

    const { id: warehouse_id, tried: whTried } = await resolveFirstWarehouseId(
      prisma,
      tenantId,
      warehouseRaw
    );
    if (warehouseRaw.trim() && warehouse_id == null) {
      console.warn(`! ${login}: ombor topilmadi (sinangan: ${whTried[0] ?? "—"})`);
    }

    const rowData: StaffRowData = {
      name,
      first_name,
      last_name,
      code: codeRaw,
      phone,
      pinfl,
      consignment: consignmentFinal,
      apk_version,
      device_name,
      last_sync_at,
      price_type,
      warehouse_id,
      disconnectWarehouse: warehouseRaw.trim() !== "" && warehouse_id == null,
      trade_direction,
      territory: null,
      branch,
      position,
      app_access,
      max_sessions,
      role: "agent"
    };

    const res = await upsertStaffUser(
      prisma,
      tenantId,
      login,
      dry,
      resetPassword,
      defaultPassword,
      rowData
    );
    if (res.dryLine) console.log(res.dryLine);
    else if (res.created) {
      created++;
      console.log(`+ yaratildi ${login} (${codeRaw})`);
    } else if (res.updated) {
      updated++;
      console.log(`~ yangilandi ${login} (${codeRaw})`);
    }
  }

  console.log(`── Agentlar Excel: yangi=${created}, yangilangan=${updated}, o‘tkazilgan=${skipped}\n`);
}

export async function runExpeditorsXlsxImport(opts: RunStaffXlsxImportOpts): Promise<void> {
  const { prisma, tenantId, tenantSlug, xlsxPath: abs, dry, defaultPassword, resetPassword } = opts;

  if (defaultPassword.length < 6) throw new Error("Eksportlar: parol kamida 6 belgi.");
  if (!fs.existsSync(abs)) throw new Error(`Eksportlar Excel yo‘q: ${abs}`);

  const { sheetName, matrix } = readMatrix(abs);
  if (matrix.length < 2) throw new Error("Eksportlar Excel: kamida sarlavha + 1 qator.");

  const h = buildHeaderMap(matrix[0] as unknown[], EXPEDITOR_HEADER_ALIASES);
  if (h.code === undefined || h.fio === undefined) {
    throw new Error("Eksportlar Excel: «Код» va «Ф.И.О» topilmadi.");
  }

  console.log(
    `\n════════════  QO‘SHIMCHA: faol eksportlar (Excel)  ════════════\n` +
      `Fayl: ${abs}\nList: ${sheetName}\nTenant: ${tenantSlug}\nDRY_RUN=${dry}\n`
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] as unknown[];
    if (!row || row.every((c) => c === "" || c == null)) continue;

    const codeRaw = cell(row, h.code).toUpperCase().replace(/\s+/g, "");
    if (!codeRaw) {
      console.warn(`! qator ${r + 1}: kod bo‘sh — o‘tkazildi`);
      skipped++;
      continue;
    }

    const login = codeRaw.toLowerCase();
    const { displayName, first_name, last_name } = parseNameFromFio(cell(row, h.fio));
    const name = displayName || codeRaw;

    const pinfl = normPinfl(h.pinfl !== undefined ? cell(row, h.pinfl) : null);
    const apk_version = h.apk !== undefined ? cell(row, h.apk) || null : null;
    const device_name = h.device !== undefined ? cell(row, h.device) || null : null;
    const last_sync_at = parseDateCell(h.lastSync !== undefined ? row[h.lastSync] : undefined);
    const phone = h.phone !== undefined ? cell(row, h.phone) || null : null;
    const territoryRaw = h.territory !== undefined ? cell(row, h.territory) : "";
    const territory =
      territoryRaw.trim().length > 2000 ? territoryRaw.trim().slice(0, 2000) : territoryRaw.trim() || null;

    const warehouseRaw = h.warehouse !== undefined ? cell(row, h.warehouse) : "";
    const branch = h.branch !== undefined ? cell(row, h.branch) || null : null;
    const position = h.position !== undefined ? cell(row, h.position) || null : null;

    const appRaw = h.appAccess !== undefined ? cell(row, h.appAccess) : "";
    const app_access = appRaw.trim() === "" ? true : yesRu(appRaw);

    let max_sessions = 2;
    if (h.maxSessions !== undefined) {
      const n = Number(cell(row, h.maxSessions));
      if (Number.isFinite(n) && n >= 1 && n <= 99) max_sessions = Math.floor(n);
    }

    const { id: warehouse_id, tried: whTried } = await resolveFirstWarehouseId(
      prisma,
      tenantId,
      warehouseRaw
    );
    if (warehouseRaw.trim() && warehouse_id == null) {
      console.warn(`! ${login}: ombor topilmadi (sinangan: ${whTried[0] ?? "—"})`);
    }

    const rowData: StaffRowData = {
      name,
      first_name,
      last_name,
      code: codeRaw,
      phone,
      pinfl,
      consignment: false,
      apk_version,
      device_name,
      last_sync_at,
      price_type: null,
      warehouse_id,
      disconnectWarehouse: warehouseRaw.trim() !== "" && warehouse_id == null,
      trade_direction: null,
      territory,
      branch,
      position,
      app_access,
      max_sessions,
      role: "expeditor"
    };

    const res = await upsertStaffUser(
      prisma,
      tenantId,
      login,
      dry,
      resetPassword,
      defaultPassword,
      rowData
    );
    if (res.dryLine) console.log(res.dryLine);
    else if (res.created) {
      created++;
      console.log(`+ yaratildi eksport ${login}`);
    } else if (res.updated) {
      updated++;
      console.log(`~ yangilandi eksport ${login}`);
    }
  }

  console.log(`── Eksportlar Excel: yangi=${created}, yangilangan=${updated}, o‘tkazilgan=${skipped}\n`);
}

export async function runSupervisorsXlsxImport(opts: RunStaffXlsxImportOpts): Promise<void> {
  const { prisma, tenantId, tenantSlug, xlsxPath: abs, dry, defaultPassword, resetPassword } = opts;

  if (defaultPassword.length < 6) throw new Error("Supervayzerlar: parol kamida 6 belgi.");
  if (!fs.existsSync(abs)) throw new Error(`Supervayzerlar Excel yo‘q: ${abs}`);

  const { sheetName, matrix } = readMatrix(abs);
  if (matrix.length < 2) throw new Error("Supervayzerlar Excel: kamida sarlavha + 1 qator.");

  const h = buildHeaderMap(matrix[0] as unknown[], SUPERVISOR_HEADER_ALIASES);
  if (h.fio === undefined) {
    throw new Error("Supervayzerlar Excel: «Ф.И.О» topilmadi.");
  }

  console.log(
    `\n════════════  QO‘SHIMCHA: supervayzerlar (Excel)  ════════════\n` +
      `Fayl: ${abs}\nList: ${sheetName}\nTenant: ${tenantSlug}\nDRY_RUN=${dry}\n`
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] as unknown[];
    if (!row || row.every((c) => c === "" || c == null)) continue;

    const codeRaw = h.code !== undefined ? cell(row, h.code).toUpperCase().replace(/\s+/g, "") : "";
    const loginCol = h.login !== undefined ? cell(row, h.login).toLowerCase().replace(/\s+/g, "") : "";
    const login = loginCol || codeRaw.toLowerCase();
    if (!login) {
      console.warn(`! qator ${r + 1}: login/kod bo‘sh — o‘tkazildi`);
      skipped++;
      continue;
    }

    const codeForDb = codeRaw || login.toUpperCase();

    const { displayName, first_name, last_name } = parseSupervisorDisplayName(cell(row, h.fio));
    const name = displayName || login;

    const pinfl = normPinfl(h.pinfl !== undefined ? cell(row, h.pinfl) : null);
    const apk_version = h.apk !== undefined ? cell(row, h.apk) || null : null;
    const branch = h.branch !== undefined ? cell(row, h.branch) || null : null;
    const position = h.position !== undefined ? cell(row, h.position) || null : null;

    const appRaw = h.appAccess !== undefined ? cell(row, h.appAccess) : "";
    const app_access = appRaw.trim() === "" ? true : yesRu(appRaw);

    let max_sessions = 2;
    if (h.maxSessions !== undefined) {
      const n = Number(cell(row, h.maxSessions));
      if (Number.isFinite(n) && n >= 1 && n <= 99) max_sessions = Math.floor(n);
    }

    const rowData: StaffRowData = {
      name,
      first_name,
      last_name,
      code: codeForDb || null,
      phone: null,
      pinfl,
      consignment: false,
      apk_version,
      device_name: null,
      last_sync_at: null,
      price_type: null,
      warehouse_id: null,
      disconnectWarehouse: false,
      trade_direction: null,
      territory: null,
      branch,
      position,
      app_access,
      max_sessions,
      role: "supervisor"
    };

    const res = await upsertStaffUser(
      prisma,
      tenantId,
      login,
      dry,
      resetPassword,
      defaultPassword,
      rowData
    );
    if (res.dryLine) console.log(res.dryLine);
    else if (res.created) {
      created++;
      console.log(`+ yaratildi supervayzer ${login}`);
    } else if (res.updated) {
      updated++;
      console.log(`~ yangilandi supervayzer ${login}`);
    }
  }

  console.log(`── Supervayzerlar Excel: yangi=${created}, yangilangan=${updated}, o‘tkazilgan=${skipped}\n`);
}

/** Eski nom bilan moslik */
export type RunActiveAgentsXlsxImportOpts = RunStaffXlsxImportOpts;
