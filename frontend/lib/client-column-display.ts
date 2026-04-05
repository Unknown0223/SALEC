/**
 * Jadval ustunlari ↔ `Client` / API maydonlari (Prisma).
 *
 * - Наименование → `name`
 * - Юридическое название → hozircha alohida maydon yo‘q → kelajakda `legal_name` API; bo‘sh → —
 * - Адрес → `address`, bo‘sh bo‘lsa manzil qismlaridan yig‘iladi
 * - Телефон → `phone`
 * - Контактное лицо → `responsible_person`
 * - Ориентир → `landmark`
 * - ИНН → `inn`
 * - ПИНФЛ → `pdl` (jismoniy shaxs identifikatori)
 * - Торговый канал (код) → `logistics_service`
 * - Категория клиента (код) → `category`
 * - Тип клиента (код) → `client_type_code`
 * - Формат (код) → `client_format`
 * - Город (код) → `city` / `district` / `region`
 * - Широта / Долгота → `gps_text` dan parse yoki kelajakda alohida maydonlar
 * - Агент 1 → `agent_name` (User)
 * - Агент 2…10 → hozircha birovchi agent yo‘q → —
 * - Агент N день → tashrif sanasi: faqat `visit_date` ni «Агент 1 день» ga qisqa ko‘rinishda (boshqalari —)
 * - Экспедитор N → `contact_persons[N-1].phone` (kontakt telefoni)
 */

import type { ClientRow } from "@/lib/client-types";

function nonEmpty(s: string | null | undefined): string | null {
  const t = s?.trim();
  return t ? t : null;
}

/** To‘liq manzil: avvalo `address`, bo‘sh bo‘lsa qismlardan. */
export function displayAddress(row: ClientRow): string | null {
  const direct = nonEmpty(row.address);
  if (direct) return direct;
  const parts = [
    nonEmpty(row.street),
    nonEmpty(row.house_number) ? `д.${row.house_number}` : null,
    nonEmpty(row.apartment) ? `кв.${row.apartment}` : null,
    nonEmpty(row.neighborhood),
    nonEmpty(row.district),
    nonEmpty(row.city),
    nonEmpty(row.region)
  ].filter(Boolean) as string[];
  return parts.length ? parts.join(", ") : null;
}

/** Shahar / hudud: shahar, tuman, viloyat */
export function displayCityCode(row: ClientRow): string | null {
  const c = nonEmpty(row.city);
  const d = nonEmpty(row.district);
  const r = nonEmpty(row.region);
  const parts = [c, d, r].filter(Boolean) as string[];
  return parts.length ? parts.join(", ") : null;
}

export function parseGpsText(gps: string | null): { lat: string | null; lng: string | null } {
  const s = nonEmpty(gps);
  if (!s) return { lat: null, lng: null };
  const m = s.match(/(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (m) return { lat: m[1], lng: m[2] };
  return { lat: null, lng: null };
}

/** Qisqa sana (DD.MM.YYYY) — «день» ustuni uchun */
export function displayVisitDateShort(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}.${mm}.${yy}`;
}

/** Agent N — `agent_assignments` yoki (slot 1) `agent_name` */
export function displayAgentName(row: ClientRow, slot: number): string | null {
  if (slot < 1 || slot > 10) return null;
  const list = row.agent_assignments;
  if (Array.isArray(list)) {
    const a = list.find((x) => x.slot === slot);
    const n = nonEmpty(a?.agent_name);
    if (n) return n;
  }
  if (slot === 1) return nonEmpty(row.agent_name);
  return null;
}

const WD_LABEL = ["", "Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];

/** Slot bo‘yicha tanlangan hafta kunlari (1..7) */
export function getVisitWeekdaysForSlot(row: ClientRow, slot: number): number[] {
  if (slot < 1 || slot > 10) return [];
  const list = row.agent_assignments;
  if (!Array.isArray(list)) return [];
  const a = list.find((x) => x.slot === slot);
  if (!a?.visit_weekdays || !Array.isArray(a.visit_weekdays)) return [];
  return Array.from(new Set(a.visit_weekdays.filter((x) => x >= 1 && x <= 7))).sort((x, y) => x - y);
}

/** «День» — avvalo hafta kunlari (teglar uchun matn), keyin `visit_date` */
export function displayAgentDay(row: ClientRow, slot: number): string | null {
  if (slot < 1 || slot > 10) return null;
  const wd = getVisitWeekdaysForSlot(row, slot);
  if (wd.length > 0) {
    const shown = wd.slice(0, 4).map((k) => WD_LABEL[k] ?? String(k));
    const more = wd.length > 4 ? ` +${wd.length - 4}` : "";
    return `${shown.join(", ")}${more}`;
  }
  const list = row.agent_assignments;
  if (Array.isArray(list)) {
    const a = list.find((x) => x.slot === slot);
    if (a?.visit_date) return displayVisitDateShort(a.visit_date);
  }
  if (slot === 1) return displayVisitDateShort(row.visit_date);
  return null;
}

/** Экспедитор N — avvalo `agent_assignments[N].expeditor_phone`, keyin kontakt */
export function displayExpeditorPhone(row: ClientRow, slot: number): string | null {
  if (slot < 1 || slot > 10) return null;
  const list = row.agent_assignments;
  if (Array.isArray(list)) {
    const a = list.find((x) => x.slot === slot);
    const ex = nonEmpty(a?.expeditor_phone);
    if (ex) return ex;
    const en = nonEmpty(a?.expeditor_name);
    if (en) return en;
  }
  const p = row.contact_persons[slot - 1]?.phone;
  return nonEmpty(p);
}

export function displayLegalName(row: ClientRow): string | null {
  return nonEmpty(row.legal_name as string | null | undefined);
}

export function displayPinfl(row: ClientRow): string | null {
  return nonEmpty(row.client_pinfl) ?? nonEmpty(row.pdl);
}

export function displayTradeChannel(row: ClientRow): string | null {
  return nonEmpty(row.sales_channel) ?? nonEmpty(row.logistics_service);
}

export function displayClientCategory(row: ClientRow): string | null {
  return nonEmpty(row.category);
}

export function displayClientType(row: ClientRow): string | null {
  /* DB da alohida «тип» yo‘q — keyin `client_type_code` API qo‘shilgacha — */
  return nonEmpty(row.client_type_code as string | null | undefined);
}

export function displayFormatCode(row: ClientRow): string | null {
  return nonEmpty(row.client_format);
}

/** Slot bo‘yicha jadvalda «mazmun» bormi (agent / kun / eks.) — bo‘sh ustunlarni yashirish uchun */
export function clientSlotHasAnyDisplayData(row: ClientRow, slot: number): boolean {
  if (slot < 1 || slot > 10) return false;
  if (getVisitWeekdaysForSlot(row, slot).length > 0) return true;
  if (displayAgentName(row, slot)) return true;
  if (displayAgentDay(row, slot)) return true;
  if (displayExpeditorPhone(row, slot)) return true;
  return false;
}

/** Joriy qatorlar ro‘yxatida qaysi slotlar kamida bitta maydonda maʼlumotga ega */
export function getClientSlotsWithDataInRows(rows: ClientRow[]): Set<number> {
  const s = new Set<number>();
  for (const row of rows) {
    for (let slot = 1; slot <= 10; slot++) {
      if (clientSlotHasAnyDisplayData(row, slot)) s.add(slot);
    }
  }
  return s;
}
