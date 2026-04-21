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
  fio: ["ф.и.о", "фио", "пользователь", "имя пользователя"],
  product: ["продукт"],
  agentType: ["тип агента"],
  code: ["код", "код агента", "код пользователя"],
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
  fio: ["ф.и.о", "фио", "пользователь", "имя пользователя"],
  authShort: ["авторизоваться"],
  phone: ["телефон"],
  code: ["код", "код экспедитора", "код пользователя"],
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
  fio: ["ф.и.о", "фио", "супервайзер", "сотрудник", "фио сотрудника", "полное имя"],
  /** SVR qatori: vergul bilan bir nechta agent FIO yoki kod («тип агента» bilan aralashmasin — substring qat’iy chegarada) */
  agentsCol: [
    "агенты супервайзера",
    "подчиненные агенты",
    "назначенные агенты",
    "список агентов",
    "фио агентов",
    "агент (фио)",
    "агенты",
    "агентов",
    "агент"
  ],
  code: ["код", "код супервайзера", "код пользователя"],
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
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/ё/g, "е")
    .replace(/\.+$/g, "");
}

/** So‘zning ichidagi harf (агент ⊂ тип агента) noto‘g‘ri moslashmasin. */
function isWordChar(c: string): boolean {
  return /[0-9a-zа-яёії]/i.test(c);
}

/** Qat’iy tenglik yoki substring faqat «so‘z chegarasi» bilan (тип агента ≠ агент ustuni). */
function headerMatchesField(cellNorm: string, aliasRaw: string): boolean {
  const a = normHeader(aliasRaw);
  if (!cellNorm || !a) return false;
  if (cellNorm === a) return true;
  if (a.length <= 3) return false;
  if (cellNorm.startsWith(`${a} `) || cellNorm.startsWith(`${a}(`) || cellNorm.startsWith(`${a},`)) return true;
  if (cellNorm.includes(` ${a} `) || cellNorm.endsWith(` ${a}`)) return true;
  const idx = cellNorm.indexOf(a);
  if (idx === -1) return false;
  const before = idx === 0 ? " " : cellNorm[idx - 1]!;
  const after = idx + a.length >= cellNorm.length ? " " : cellNorm[idx + a.length]!;
  if (isWordChar(before) || isWordChar(after)) return false;
  return true;
}

function buildHeaderMap(
  headerRow: unknown[],
  aliases: Record<string, string[]>
): Record<string, number> {
  const map: Record<string, number> = {};
  const cells = headerRow.map((c) => (c == null ? "" : String(c)));
  for (let i = 0; i < cells.length; i++) {
    const cellNorm = normHeader(cells[i]);
    if (!cellNorm) continue;
    for (const [field, als] of Object.entries(aliases)) {
      if (map[field] !== undefined) continue;
      for (const alias of als) {
        if (headerMatchesField(cellNorm, alias)) {
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
  return String(v)
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .trim();
}

/** FIO / kod taqqoslash: bo‘shliq, registr, yashirin belgilar. */
function normPersonKey(s: string): string {
  return s
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
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

export type StaffImportXlsxKind = "agent" | "expeditor" | "supervisor";

const STAFF_KIND_TO_ALIASES: Record<StaffImportXlsxKind, Record<string, string[]>> = {
  agent: AGENT_HEADER_ALIASES,
  expeditor: EXPEDITOR_HEADER_ALIASES,
  supervisor: SUPERVISOR_HEADER_ALIASES
};

/** CLI / tahlil: 1-qator ustunlari import bilan qanday maylonga tushishini ko‘rsatadi */
export function debugStaffImportHeaderMap(
  headerRow: unknown[],
  kind: StaffImportXlsxKind
): { fieldToColumnIndex: Record<string, number>; normalizedCells: string[] } {
  const fieldToColumnIndex = buildHeaderMap(headerRow, STAFF_KIND_TO_ALIASES[kind]);
  const normalizedCells = (headerRow as unknown[]).map((c) => normHeader(c == null ? "" : String(c)));
  return { fieldToColumnIndex, normalizedCells };
}

// ─── resolve path helpers ─────────────────────────────────────────

export type AgentsXlsxResolvedPath =
  | { ok: true; path: string }
  | { ok: false; reason: "none" }
  | { ok: false; reason: "missing_env_file"; detail: string };

function downloadsDir(): string | null {
  const d = (process.env.USERPROFILE || process.env.HOME || "").trim();
  return d ? path.join(d, "Downloads") : null;
}

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

function withDownloadsFallback(names: string[]): string[] {
  const dl = downloadsDir();
  if (!dl) return names;
  const extra = names.flatMap((p) => {
    const base = path.basename(p);
    return [p, path.join(dl, base)];
  });
  /** scripts/data ustun, keyin Downloads */
  return extra;
}

/** AGENTS_XLSX_PATH yoki scripts/data / Downloads dagi standart nomlar */
export function resolveAgentsXlsxPath(cwdBackend: string, envPath: string | undefined): AgentsXlsxResolvedPath {
  return resolveXlsxPath(
    cwdBackend,
    envPath,
    withDownloadsFallback([
      path.join(cwdBackend, "scripts/data/staff-agents.xlsx"),
      path.join(cwdBackend, "scripts/data/active-agents.xlsx"),
      path.join(cwdBackend, "scripts/data/Активные агенты (3).xlsx"),
      path.join(cwdBackend, "scripts/data/Активные агенты (2).xlsx"),
      path.join(cwdBackend, "scripts/data/Активные агенты (1).xlsx"),
      path.join(cwdBackend, "scripts/data/Активные агенты.xlsx")
    ])
  );
}

export function resolveExpeditorsXlsxPath(
  cwdBackend: string,
  envPath: string | undefined
): AgentsXlsxResolvedPath {
  return resolveXlsxPath(
    cwdBackend,
    envPath,
    withDownloadsFallback([
      path.join(cwdBackend, "scripts/data/staff-expeditors.xlsx"),
      path.join(cwdBackend, "scripts/data/active-expeditors.xlsx"),
      path.join(cwdBackend, "scripts/data/Активные Активные экспедиторы (3).xlsx"),
      path.join(cwdBackend, "scripts/data/Активные Активные экспедиторы (1).xlsx"),
      path.join(cwdBackend, "scripts/data/Активные Активные экспедиторы (2).xlsx"),
      path.join(cwdBackend, "scripts/data/Активные экспедиторы (1).xlsx"),
      path.join(cwdBackend, "scripts/data/Активные экспедиторы (2).xlsx"),
      path.join(cwdBackend, "scripts/data/Активные экспедиторы.xlsx")
    ])
  );
}

export function resolveSupervisorsXlsxPath(
  cwdBackend: string,
  envPath: string | undefined
): AgentsXlsxResolvedPath {
  return resolveXlsxPath(
    cwdBackend,
    envPath,
    withDownloadsFallback([
      path.join(cwdBackend, "scripts/data/staff-supervisors.xlsx"),
      path.join(cwdBackend, "scripts/data/active-supervisors.xlsx"),
      path.join(cwdBackend, "scripts/data/Супервайзеры (4).xlsx"),
      path.join(cwdBackend, "scripts/data/Супервайзеры (3).xlsx"),
      path.join(cwdBackend, "scripts/data/Супервайзеры (1).xlsx"),
      path.join(cwdBackend, "scripts/data/Супервайзеры (2).xlsx"),
      path.join(cwdBackend, "scripts/data/Супервайзеры.xlsx")
    ])
  );
}

type TenantAgentLookup = {
  byCodeNorm: Map<string, number>;
  byNameNorm: Map<string, number>;
  byLoginNorm: Map<string, number>;
  agents: Array<{
    id: number;
    code: string | null;
    name: string | null;
    login: string;
    first_name: string | null;
    last_name: string | null;
  }>;
};

async function loadTenantAgentLookup(prisma: PrismaClient, tenantId: number): Promise<TenantAgentLookup> {
  const agents = await prisma.user.findMany({
    where: { tenant_id: tenantId, role: "agent" },
    select: { id: true, code: true, name: true, login: true, first_name: true, last_name: true }
  });
  const byCodeNorm = new Map<string, number>();
  const byNameNorm = new Map<string, number>();
  const byLoginNorm = new Map<string, number>();
  const putName = (raw: string | null | undefined, id: number) => {
    const k = normPersonKey(raw ?? "");
    if (k.length > 0) byNameNorm.set(k, id);
  };
  for (const a of agents) {
    if (a.code) {
      const c = a.code.toUpperCase().replace(/\s+/g, "").trim();
      if (c) byCodeNorm.set(c, a.id);
    }
    const lg = normPersonKey(a.login.replace(/\s+/g, ""));
    if (lg) byLoginNorm.set(lg, a.id);
    putName(a.name, a.id);
    putName([a.first_name, a.last_name].filter(Boolean).join(" "), a.id);
    const bracket = (a.name ?? "").match(/\[([^\]]+)\]/);
    if (bracket) putName(bracket[1], a.id);
  }
  return { byCodeNorm, byNameNorm, byLoginNorm, agents };
}

function resolveAgentIdFromLookup(lookup: TenantAgentLookup, token: string): number | null {
  const raw = token.replace(/\u00a0/g, " ").replace(/[\u200b-\u200d\ufeff]/g, "").trim();
  if (!raw) return null;
  const { displayName } = parseNameFromFio(raw);
  const nameKey = normPersonKey(displayName || raw);
  if (nameKey && lookup.byNameNorm.has(nameKey)) {
    return lookup.byNameNorm.get(nameKey) ?? null;
  }
  const codeCompact = raw.toUpperCase().replace(/\s+/g, "").trim();
  if (codeCompact.length >= 2 && codeCompact.length <= 48 && lookup.byCodeNorm.has(codeCompact)) {
    return lookup.byCodeNorm.get(codeCompact) ?? null;
  }
  const loginKey = normPersonKey(raw.replace(/\s+/g, ""));
  if (loginKey && lookup.byLoginNorm.has(loginKey)) {
    return lookup.byLoginNorm.get(loginKey) ?? null;
  }

  if (nameKey.length >= 4) {
    for (const a of lookup.agents) {
      const an = normPersonKey(a.name ?? "");
      if (!an) continue;
      if (an === nameKey || an.includes(nameKey) || nameKey.includes(an)) return a.id;
    }
  }
  return null;
}

/**
 * SVR «агент» ustuni: rasmiy ajratuvchi — **vergul**; `;` `|` tab/yangi qator noto‘g‘ri bo‘lsa vergulga almashtiriladi, keyin `,` bo‘yicha bo‘linadi.
 */
function normalizeSupervisorAgentsCellForCommaSplit(raw: string): string {
  return raw
    .replace(/\u00a0/g, " ")
    .replace(/\uff0c/g, ",")
    .replace(/[;|]/g, ",")
    .replace(/\t+/g, ",")
    .replace(/\r?\n+/g, ",")
    .replace(/\s+,/g, ",")
    .replace(/,\s+/g, ",")
    .replace(/,{2,}/g, ",");
}

/** Tahlil skriptlari va import bir xil qoidada agent tokenlarini ajratadi. */
export function splitSupervisorAgentsCell(raw: string): string[] {
  return normalizeSupervisorAgentsCellForCommaSplit(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function linkSupervisorAgentsForRow(opts: {
  prisma: PrismaClient;
  tenantId: number;
  supervisorUserId: number;
  agentsCell: string;
  lookup: TenantAgentLookup;
  dry: boolean;
}): Promise<{ applied: number; unmatched: string[]; resolvedCount: number }> {
  const { prisma, tenantId, supervisorUserId, agentsCell, lookup, dry } = opts;
  const parts = splitSupervisorAgentsCell(agentsCell);
  const unmatched: string[] = [];
  const ids = new Set<number>();
  for (const p of parts) {
    const id = resolveAgentIdFromLookup(lookup, p);
    if (id == null) unmatched.push(p);
    else ids.add(id);
  }
  const idArr = [...ids];
  if (idArr.length === 0) {
    return { applied: 0, unmatched, resolvedCount: 0 };
  }
  if (dry) {
    return { applied: 0, unmatched, resolvedCount: idArr.length };
  }
  await prisma.user.updateMany({
    where: { tenant_id: tenantId, id: { in: idArr }, role: "agent" },
    data: { supervisor_user_id: supervisorUserId }
  });
  return { applied: idArr.length, unmatched, resolvedCount: idArr.length };
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

  const headerDebug = Object.entries(h)
    .map(([k, i]) => `${k}→${i}`)
    .join(", ");
  console.log(`  Ustun indekslari: ${headerDebug}`);

  console.log(
    `\n════════════  QO‘SHIMCHA: supervayzerlar (Excel)  ════════════\n` +
      `Fayl: ${abs}\nList: ${sheetName}\nTenant: ${tenantSlug}\nDRY_RUN=${dry}\n`
  );

  const hasAgentsCol = h.agentsCol !== undefined;
  if (!hasAgentsCol) {
    console.warn(
      "! «Агент» ustuni (vergul bilan bir nechta FIO/kod) topilmadi — SVR qatorlaridagi agentlar bazada bog‘lanmaydi. Sarlavhani tekshiring."
    );
  }
  const agentLookup = await loadTenantAgentLookup(prisma, tenantId);

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

    if (hasAgentsCol) {
      const sup = await prisma.user.findFirst({
        where: { tenant_id: tenantId, login, role: "supervisor" },
        select: { id: true }
      });
      const agentsCell = cell(row, h.agentsCol);
      /** DRY: bazada SVR yo‘q bo‘lsa ham agent tokenlarini tekshirish (updateMany chaqirilmaydi). */
      const canResolveAgents = agentsCell.trim() && (sup != null || dry);
      if (canResolveAgents) {
        const link = await linkSupervisorAgentsForRow({
          prisma,
          tenantId,
          supervisorUserId: sup?.id ?? 0,
          agentsCell,
          lookup: agentLookup,
          dry
        });
        if (link.unmatched.length > 0) {
          const prev = link.unmatched.slice(0, 6).join("; ");
          const more = link.unmatched.length > 6 ? ` … (+${link.unmatched.length - 6})` : "";
          console.warn(`! ${login}: agent topilmadi: ${prev}${more}`);
        }
        if (dry && link.resolvedCount > 0) {
          console.log(`  [dry] SVR→agent: ${link.resolvedCount} ta mos keldi (bazaga yozilmadi)`);
        } else if (!dry && link.applied > 0) {
          console.log(`  ↔ SVR→agent: ${link.applied} ta supervisor_user_id yangilandi`);
        }
      }
    }
  }

  console.log(`── Supervayzerlar Excel: yangi=${created}, yangilangan=${updated}, o‘tkazilgan=${skipped}\n`);
}

/** Eski nom bilan moslik */
export type RunActiveAgentsXlsxImportOpts = RunStaffXlsxImportOpts;
