import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";

/** ExcelJS uchun yuklangan zakaz (faqat shablon chizish). */
export type NakladnoyLine = {
  productId: number;
  sku: string;
  /** Bo‘sh bo‘lsa SKU chiqadi */
  barcode: string | null;
  name: string;
  qty: number;
  bonusQty: number;
  price: number;
  sum: number;
  groupTitle: string;
  qtyPerBlock: number | null;
};

export type NakladnoyOrderPayload = {
  id: number;
  number: string;
  createdAt: Date;
  /** Bir nechta zakaz birlashtirilganda «Дата по» */
  dateTo?: Date | null;
  tenantName: string;
  tenantPhone: string | null;
  clientName: string;
  clientBalanceNum: Prisma.Decimal | null;
  clientAddress: string;
  currencyLabel: string;
  agentLine: string;
  expeditorLine: string;
  territory: string;
  warehouseName: string | null;
  agentId: number | null;
  expeditorUserId: number | null;
  lines: NakladnoyLine[];
  paidLines: NakladnoyLine[];
  bonusLines: NakladnoyLine[];
};

export type NakladnoyCodeColumn = "sku" | "barcode";
export type NakladnoyGroupBy = "territory" | "agent" | "expeditor";

export type NakladnoyBuildOptions = {
  codeColumn: NakladnoyCodeColumn;
  /** true: agent / ekspeditor / hudud bo‘yicha alohida varaqlar (Загрузочный лист) */
  separateSheets: boolean;
  /** separateSheets true bo‘lganda */
  groupBy: NakladnoyGroupBy;
};

export const DEFAULT_NAKLADNOY_BUILD_OPTIONS: NakladnoyBuildOptions = {
  codeColumn: "sku",
  separateSheets: false,
  groupBy: "agent"
};

function lineCodeDisplay(ln: NakladnoyLine, codeColumn: NakladnoyCodeColumn): string {
  if (codeColumn === "barcode") {
    const b = ln.barcode?.trim();
    if (b) return b;
  }
  return ln.sku;
}

const BORDER_THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF000000" } },
  left: { style: "thin", color: { argb: "FF000000" } },
  bottom: { style: "thin", color: { argb: "FF000000" } },
  right: { style: "thin", color: { argb: "FF000000" } }
};

const FILL_GROUP: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE6E0F5" }
};

const FILL_HEADER_GREY: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFD9D9D9" }
};

function fmtDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function fmtDateTime(d: Date): string {
  const t = fmtDate(d);
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${t} ${hh}:${mi}:${ss}`;
}

function fmtMoneyInt(n: number): string {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Math.round(n));
}

function fmtMoney2(n: number): string {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(n);
}

function blockCount(line: NakladnoyLine): number | string {
  const qpb = line.qtyPerBlock;
  if (qpb != null && qpb > 0) {
    const b = line.qty / qpb;
    if (Number.isFinite(b)) return Math.round(b * 1000) / 1000;
  }
  return "—";
}

function sanitizeSheetName(raw: string): string {
  const s = raw.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31);
  return s || "Zakaz";
}

function applyBorderRange(
  sheet: ExcelJS.Worksheet,
  r1: number,
  c1: number,
  r2: number,
  c2: number
) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      sheet.getCell(r, c).border = BORDER_THIN as ExcelJS.Borders;
    }
  }
}

/** Bir xil mahsulot+qator guruhi bo‘yicha yig‘indilar (bir nechta zakazdan). */
function mergeLoadingLines(lines: NakladnoyLine[]): NakladnoyLine[] {
  const m = new Map<string, NakladnoyLine>();
  for (const ln of lines) {
    const k = `${ln.groupTitle}\0${ln.productId}`;
    const ex = m.get(k);
    if (!ex) {
      m.set(k, { ...ln });
      continue;
    }
    ex.qty += ln.qty;
    ex.bonusQty += ln.bonusQty;
    ex.sum += ln.sum;
    ex.price = ex.qty > 0 ? ex.sum / ex.qty : 0;
  }
  return [...m.values()];
}

/** Bir nechta zakaz/sodiqnik qiymatlari — vergul bilan (etalon shablon). */
function uniqJoin(values: string[], sep = ", "): string {
  const u = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  if (u.length === 0) return "—";
  if (u.length === 1) return u[0]!;
  return u.join(sep);
}

function buildMergedLoadingPayload(
  orders: NakladnoyOrderPayload[],
  sheetNumberLabel: string
): NakladnoyOrderPayload {
  const first = orders[0]!;
  const mergedLines = mergeLoadingLines(orders.flatMap((o) => o.lines));
  const times = orders.map((o) => o.createdAt.getTime());
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const dateTo = maxT > minT ? new Date(maxT) : null;

  return {
    ...first,
    number: sheetNumberLabel,
    createdAt: new Date(minT),
    dateTo,
    agentLine: uniqJoin(orders.map((o) => o.agentLine)),
    expeditorLine: uniqJoin(orders.map((o) => o.expeditorLine)),
    territory: uniqJoin(orders.map((o) => o.territory)),
    warehouseName: (() => {
      const names = orders
        .map((o) => o.warehouseName)
        .filter((n): n is string => Boolean(n?.trim()));
      const u = [...new Set(names)];
      if (u.length === 0) return null;
      if (u.length === 1) return u[0]!;
      return u.join(", ");
    })(),
    lines: mergedLines,
    paidLines: [],
    bonusLines: []
  };
}

function groupKeyForOrder(o: NakladnoyOrderPayload, by: NakladnoyGroupBy): string {
  switch (by) {
    case "agent":
      return o.agentId != null ? `a:${o.agentId}` : "a:none";
    case "expeditor":
      return o.expeditorUserId != null ? `e:${o.expeditorUserId}` : "e:none";
    case "territory":
    default:
      return `t:${o.territory || "—"}`;
  }
}

function sheetNameForGroup(by: NakladnoyGroupBy, orders: NakladnoyOrderPayload[]): string {
  const o = orders[0]!;
  const n = orders.length;
  if (n === 1) return o.number;
  const short = (s: string) => sanitizeSheetName(s.replace(/[:\\/?*[\]]/g, " ").slice(0, 18));
  switch (by) {
    case "agent":
      return short((o.agentId != null ? o.agentLine : "no_agent") + `_${n}`);
    case "expeditor":
      return short((o.expeditorUserId != null ? o.expeditorLine : "no_exp") + `_${n}`);
    case "territory":
    default:
      return short(`${o.territory || "no_ter"}_${n}`);
  }
}

function expandLoadingSheetPayloads(
  orders: NakladnoyOrderPayload[],
  options: NakladnoyBuildOptions
): NakladnoyOrderPayload[] {
  if (orders.length === 0) return [];
  if (!options.separateSheets) {
    if (orders.length === 1) return [orders[0]!];
    return [buildMergedLoadingPayload(orders, `Все_${orders.length}`)];
  }
  const buckets = new Map<string, NakladnoyOrderPayload[]>();
  for (const o of orders) {
    const k = groupKeyForOrder(o, options.groupBy);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(o);
  }
  return [...buckets.values()].map((group) => {
    if (group.length === 1) return group[0]!;
    return buildMergedLoadingPayload(group, sheetNameForGroup(options.groupBy, group));
  });
}

/** «Накладные 2.1.0»: zakazlarni birlashtirmasdan, varaq(lar)da ustma-ust. */
function expandConsignmentSheetGroups(
  orders: NakladnoyOrderPayload[],
  options: NakladnoyBuildOptions
): NakladnoyOrderPayload[][] {
  if (orders.length === 0) return [];
  if (!options.separateSheets) return [orders];
  const buckets = new Map<string, NakladnoyOrderPayload[]>();
  for (const o of orders) {
    const k = groupKeyForOrder(o, options.groupBy);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(o);
  }
  return [...buckets.values()];
}

/** «Загруз зав.склада» etalon: A–H, B:C kod, meta A:C + D:H, chop uchun keng. */
function addLoadingSheetWorksheet(
  wb: ExcelJS.Workbook,
  order: NakladnoyOrderPayload,
  options: NakladnoyBuildOptions
) {
  const sheet = wb.addWorksheet(sanitizeSheetName(order.number), {
    views: [{ showGridLines: true }]
  });
  const wCode = options.codeColumn === "barcode" ? 12 : 10;
  sheet.getColumn(1).width = 6;
  sheet.getColumn(2).width = wCode;
  sheet.getColumn(3).width = wCode;
  sheet.getColumn(4).width = 46;
  sheet.getColumn(5).width = 11;
  sheet.getColumn(6).width = 11;
  sheet.getColumn(7).width = 13;
  sheet.getColumn(8).width = 15;
  sheet.properties.defaultRowHeight = 18;

  const mergedLines = mergeLoadingLines(order.lines);

  let row = 1;
  sheet.mergeCells(row, 1, row, 8);
  const t = sheet.getCell(row, 1);
  t.value = `Загруз зав.склада 5.1.8 (Время печати: ${fmtDateTime(new Date())})`;
  t.font = { bold: true, size: 12 };
  t.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  applyBorderRange(sheet, row, 1, row, 8);
  row++;

  const dateShip = order.dateTo ? fmtDate(order.dateTo) : "—";
  const meta: [string, string][] = [
    ["Дата заявки", fmtDate(order.createdAt)],
    ["Дата отгрузки", dateShip],
    ["Агенты", order.agentLine],
    ["Территория", order.territory || "—"],
    ["Экспедитор", order.expeditorLine],
    ["Валюта", order.currencyLabel],
    ["Склад", order.warehouseName ?? "—"]
  ];
  for (const [label, val] of meta) {
    sheet.mergeCells(row, 1, row, 3);
    const lc = sheet.getCell(row, 1);
    lc.value = label;
    lc.font = { bold: true };
    lc.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    sheet.mergeCells(row, 4, row, 8);
    const vc = sheet.getCell(row, 4);
    vc.value = val;
    vc.alignment = { vertical: "middle", horizontal: "right", wrapText: true };
    applyBorderRange(sheet, row, 1, row, 8);
    row++;
  }

  row++;
  const codeHeader = options.codeColumn === "barcode" ? "Штрих-код" : "Код";
  sheet.getCell(row, 1).value = "№";
  sheet.getCell(row, 1).font = { bold: true };
  sheet.getCell(row, 1).fill = FILL_HEADER_GREY;
  sheet.mergeCells(row, 2, row, 3);
  const ch = sheet.getCell(row, 2);
  ch.value = codeHeader;
  ch.font = { bold: true };
  ch.fill = FILL_HEADER_GREY;
  ch.alignment = { horizontal: "center", vertical: "middle" };
  const hdrRest: [number, string][] = [
    [4, "Продукт"],
    [5, "Кол-во"],
    [6, "Бонус"],
    [7, "Цена"],
    [8, "Сумма"]
  ];
  for (const [col, text] of hdrRest) {
    const c = sheet.getCell(row, col);
    c.value = text;
    c.font = { bold: true };
    c.fill = FILL_HEADER_GREY;
    c.alignment = { horizontal: col === 4 ? "left" : "right", vertical: "middle" };
  }
  applyBorderRange(sheet, row, 1, row, 8);
  row++;

  const byGroup = new Map<string, NakladnoyLine[]>();
  for (const ln of mergedLines) {
    const k = ln.groupTitle || "Прочее";
    if (!byGroup.has(k)) byGroup.set(k, []);
    byGroup.get(k)!.push(ln);
  }
  const groupKeys = [...byGroup.keys()].sort((a, b) => a.localeCompare(b, "ru"));

  let idx = 1;
  let grandQty = 0;
  let grandBonus = 0;
  let grandSum = 0;

  for (const gk of groupKeys) {
    const groupLines = byGroup.get(gk)!;
    let gQty = 0;
    let gBonus = 0;
    let gSum = 0;
    for (const ln of groupLines) {
      gQty += ln.qty;
      gBonus += ln.bonusQty;
      gSum += ln.sum;
    }
    sheet.mergeCells(row, 1, row, 3);
    for (let c = 1; c <= 3; c++) {
      sheet.getCell(row, c).fill = FILL_GROUP;
    }
    const gn = sheet.getCell(row, 4);
    gn.value = gk;
    gn.font = { bold: true };
    gn.fill = FILL_GROUP;
    gn.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    sheet.getCell(row, 5).value = gQty;
    sheet.getCell(row, 6).value = gBonus;
    sheet.getCell(row, 7).value = "";
    sheet.getCell(row, 8).value = fmtMoneyInt(gSum);
    for (let c = 5; c <= 8; c++) {
      const cell = sheet.getCell(row, c);
      cell.fill = FILL_GROUP;
      cell.font = { bold: true };
      cell.alignment = { horizontal: "right", vertical: "middle" };
    }
    applyBorderRange(sheet, row, 1, row, 8);
    row++;

    for (const ln of groupLines) {
      sheet.getCell(row, 1).value = idx++;
      sheet.mergeCells(row, 2, row, 3);
      const codeCell = sheet.getCell(row, 2);
      codeCell.value = lineCodeDisplay(ln, options.codeColumn);
      codeCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      const nameCell = sheet.getCell(row, 4);
      nameCell.value = ln.name;
      nameCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      sheet.getCell(row, 5).value = ln.qty;
      sheet.getCell(row, 6).value = ln.bonusQty;
      sheet.getCell(row, 7).value = fmtMoneyInt(ln.price);
      sheet.getCell(row, 8).value = fmtMoneyInt(ln.sum);
      for (const c of [5, 6, 7, 8]) {
        sheet.getCell(row, c).alignment = { horizontal: "right", vertical: "middle" };
      }
      applyBorderRange(sheet, row, 1, row, 8);
      grandQty += ln.qty;
      grandBonus += ln.bonusQty;
      grandSum += ln.sum;
      row++;
    }
  }

  sheet.mergeCells(row, 1, row, 4);
  const tot = sheet.getCell(row, 1);
  tot.value = "Итого";
  tot.font = { bold: true };
  tot.fill = FILL_HEADER_GREY;
  tot.alignment = { horizontal: "left", vertical: "middle" };
  sheet.getCell(row, 5).value = grandQty;
  sheet.getCell(row, 6).value = grandBonus;
  sheet.getCell(row, 7).value = fmtMoneyInt(grandSum);
  sheet.getCell(row, 8).value = "";
  for (let c = 5; c <= 8; c++) {
    sheet.getCell(row, c).font = { bold: true };
    sheet.getCell(row, c).fill = FILL_HEADER_GREY;
    sheet.getCell(row, c).alignment = { horizontal: "right", vertical: "middle" };
  }
  applyBorderRange(sheet, row, 1, row, 8);
  row += 2;

  sheet.mergeCells(row, 1, row, 3);
  sheet.getCell(row, 1).value = "___________________________";
  sheet.mergeCells(row, 6, row, 8);
  sheet.getCell(row, 6).value = "___________________________";
  applyBorderRange(sheet, row, 1, row, 8);
  row++;

  sheet.mergeCells(row, 1, row, 3);
  sheet.getCell(row, 1).value = "Складчик";
  sheet.getCell(row, 1).font = { bold: true };
  sheet.mergeCells(row, 6, row, 8);
  sheet.getCell(row, 6).value = "Доставщик";
  sheet.getCell(row, 6).font = { bold: true };
  applyBorderRange(sheet, row, 1, row, 8);

  sheet.pageSetup = {
    orientation: "portrait",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }
  };
}

/** Загрузочный лист — sozlamalar: bitta varaq / guruhlar, SKU yoki shtrix-kod. */
export async function buildLoadingSheetWorkbook(
  orders: NakladnoyOrderPayload[],
  options: NakladnoyBuildOptions
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SALESDOC";
  wb.created = new Date();

  const payloads = expandLoadingSheetPayloads(orders, options);
  for (const p of payloads) {
    addLoadingSheetWorksheet(wb, p, options);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** «Накладные 2.1.0»: 6 ustun ichida chapda texnik nom, o‘ngda qiymat; sarlavha 2.1.0. */
function writeConsignmentBlock(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  startCol: number,
  order: NakladnoyOrderPayload,
  printAt: Date
): number {
  const c0 = startCol;
  let r = startRow;
  const cEnd = startCol + 5;
  const labelEnd = c0 + 1;
  const valueStart = c0 + 2;

  const rowLabelValue = (label: string, value: string) => {
    sheet.mergeCells(r, c0, r, labelEnd);
    const lc = sheet.getCell(r, c0);
    lc.value = label;
    lc.font = { bold: true, size: 10 };
    lc.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    sheet.mergeCells(r, valueStart, r, cEnd);
    const vc = sheet.getCell(r, valueStart);
    vc.value = value;
    vc.font = { size: 10 };
    vc.alignment = { vertical: "middle", horizontal: "right", wrapText: true };
    applyBorderRange(sheet, r, c0, r, cEnd);
    r++;
  };

  const bal =
    order.clientBalanceNum != null
      ? `${fmtMoney2(Number(order.clientBalanceNum.toString()))} UZS`
      : "0,00 UZS";
  const tel = order.tenantPhone?.trim() || "—";

  rowLabelValue("Клиент:", order.clientName);
  rowLabelValue("Баланс клиента:", bal);
  rowLabelValue("Адрес:", order.clientAddress || "—");
  rowLabelValue("Агент:", order.agentLine || "—");
  rowLabelValue("Экспедитор:", order.expeditorLine || "—");
  rowLabelValue("Дата накладной / тел:", `${fmtDate(printAt)} / ${tel}`);

  sheet.mergeCells(r, c0, r, cEnd);
  const h1 = sheet.getCell(r, c0);
  h1.value = "2.1.0";
  h1.font = { bold: true, size: 12 };
  h1.alignment = { horizontal: "center", vertical: "middle" };
  applyBorderRange(sheet, r, c0, r, cEnd);
  r++;

  sheet.mergeCells(r, c0, r, cEnd);
  const h2 = sheet.getCell(r, c0);
  h2.value = `Заказ (№${order.number})`;
  h2.font = { bold: true, size: 11 };
  h2.alignment = { horizontal: "left", vertical: "middle" };
  applyBorderRange(sheet, r, c0, r, cEnd);
  r++;

  const hdr = ["№", "Наименование", "Блок", "Кол-во", "Цена", "Сумма"];
  hdr.forEach((h, i) => {
    const cell = sheet.getCell(r, c0 + i);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = FILL_HEADER_GREY;
    cell.alignment = { horizontal: i === 1 ? "left" : "right", vertical: "middle" };
  });
  applyBorderRange(sheet, r, c0, r, cEnd);
  r++;

  let n = 1;
  let tBlock = 0;
  let tQty = 0;
  let tSum = 0;
  for (const ln of order.paidLines) {
    const b = blockCount(ln);
    if (typeof b === "number") tBlock += b;
    sheet.getCell(r, c0).value = n++;
    sheet.getCell(r, c0 + 1).value = ln.name;
    sheet.getCell(r, c0 + 2).value = typeof b === "number" ? b : b;
    sheet.getCell(r, c0 + 3).value = ln.qty;
    sheet.getCell(r, c0 + 4).value = fmtMoneyInt(ln.price);
    sheet.getCell(r, c0 + 5).value = fmtMoneyInt(ln.sum);
    for (let i = 0; i < 6; i++) {
      sheet.getCell(r, c0 + i).alignment = {
        horizontal: i === 1 ? "left" : "right",
        vertical: "middle",
        wrapText: i === 1
      };
    }
    applyBorderRange(sheet, r, c0, r, cEnd);
    tQty += ln.qty;
    tSum += ln.sum;
    r++;
  }

  sheet.getCell(r, c0).value = "";
  sheet.getCell(r, c0 + 1).value = "Итог:";
  sheet.getCell(r, c0 + 2).value = tBlock > 0 ? Math.round(tBlock * 1000) / 1000 : "—";
  sheet.getCell(r, c0 + 3).value = tQty;
  sheet.getCell(r, c0 + 4).value = "";
  sheet.getCell(r, c0 + 5).value = fmtMoneyInt(tSum);
  for (let i = 0; i < 6; i++) {
    const cell = sheet.getCell(r, c0 + i);
    cell.fill = FILL_HEADER_GREY;
    cell.font = { bold: true };
    cell.alignment = {
      horizontal: i === 1 ? "left" : "right",
      vertical: "middle"
    };
  }
  applyBorderRange(sheet, r, c0, r, cEnd);
  r += 2;

  sheet.mergeCells(r, c0, r, cEnd);
  sheet.getCell(r, c0).value = `Бонус(№${order.number})`;
  sheet.getCell(r, c0).font = { bold: true };
  applyBorderRange(sheet, r, c0, r, cEnd);
  r++;

  hdr.forEach((h, i) => {
    const cell = sheet.getCell(r, c0 + i);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = FILL_HEADER_GREY;
    cell.alignment = { horizontal: i === 1 ? "left" : "right", vertical: "middle" };
  });
  applyBorderRange(sheet, r, c0, r, cEnd);
  r++;

  let bn = 1;
  let bBlock = 0;
  let bQ = 0;
  for (const ln of order.bonusLines) {
    const b = blockCount(ln);
    if (typeof b === "number") bBlock += b;
    sheet.getCell(r, c0).value = bn++;
    sheet.getCell(r, c0 + 1).value = ln.name;
    sheet.getCell(r, c0 + 2).value = typeof b === "number" ? b : b;
    sheet.getCell(r, c0 + 3).value = ln.qty;
    sheet.getCell(r, c0 + 4).value = "";
    sheet.getCell(r, c0 + 5).value = "";
    for (let i = 0; i < 6; i++) {
      sheet.getCell(r, c0 + i).alignment = {
        horizontal: i === 1 ? "left" : "right",
        vertical: "middle",
        wrapText: i === 1
      };
    }
    applyBorderRange(sheet, r, c0, r, cEnd);
    bQ += ln.qty;
    r++;
  }

  sheet.getCell(r, c0).value = "";
  sheet.getCell(r, c0 + 1).value = "Итог:";
  sheet.getCell(r, c0 + 2).value =
    order.bonusLines.length === 0 ? "—" : bBlock > 0 ? Math.round(bBlock * 1000) / 1000 : "—";
  sheet.getCell(r, c0 + 3).value = bQ;
  sheet.getCell(r, c0 + 4).value = "";
  sheet.getCell(r, c0 + 5).value = "";
  for (let i = 0; i < 6; i++) {
    sheet.getCell(r, c0 + i).fill = FILL_HEADER_GREY;
    sheet.getCell(r, c0 + i).font = { bold: true };
    sheet.getCell(r, c0 + i).alignment = {
      horizontal: i === 1 ? "left" : "right",
      vertical: "middle"
    };
  }
  applyBorderRange(sheet, r, c0, r, cEnd);
  r += 2;

  sheet.mergeCells(r, c0, r, c0 + 2);
  sheet.getCell(r, c0).value = "Отпустил: _______________";
  sheet.mergeCells(r, c0 + 3, r, cEnd);
  sheet.getCell(r, c0 + 3).value = "Принял: _________________";
  sheet.getCell(r, c0).font = { bold: true };
  sheet.getCell(r, c0 + 3).font = { bold: true };
  applyBorderRange(sheet, r, c0, r, cEnd);
  r++;
  return r;
}

const CONSIGNMENT_STACK_GAP = 2;

/** «Накладные 2.1.0»: har zakaz — chap/o‘ng 2 nusxa; zakazlar tepadan pastga. */
export async function buildConsignmentWorkbook(
  orders: NakladnoyOrderPayload[],
  options: NakladnoyBuildOptions
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SALESDOC";
  const printAt = new Date();

  const groups = expandConsignmentSheetGroups(orders, options);
  const usedSheetNames = new Set<string>();
  const uniqueSheetName = (base: string): string => {
    let name = sanitizeSheetName(base).slice(0, 31);
    if (!name) name = "N2_1_0";
    let candidate = name;
    let n = 2;
    while (usedSheetNames.has(candidate)) {
      const suffix = `_${n++}`;
      candidate = sanitizeSheetName(name.slice(0, Math.max(1, 31 - suffix.length)) + suffix);
    }
    usedSheetNames.add(candidate);
    return candidate;
  };

  /** Jami kenglik ~portrait A4 ga mos (2 forma + tor oraliq). */
  const formColW = [5, 21, 7, 8, 9, 10];

  for (const group of groups) {
    if (group.length === 0) continue;
    const baseName = options.separateSheets
      ? sheetNameForGroup(options.groupBy, group)
      : group.length === 1
        ? `K-${group[0]!.number}`
        : `N210_${group.length}`;
    const sheet = wb.addWorksheet(uniqueSheetName(baseName), {
      views: [{ showGridLines: true }]
    });

    for (let i = 0; i < 6; i++) {
      sheet.getColumn(i + 1).width = formColW[i]!;
      sheet.getColumn(i + 8).width = formColW[i]!;
    }
    sheet.getColumn(7).width = 1.2;
    sheet.properties.defaultRowHeight = 15;

    let row = 1;
    for (const order of group) {
      const endL = writeConsignmentBlock(sheet, row, 1, order, printAt);
      const endR = writeConsignmentBlock(sheet, row, 8, order, printAt);
      row = Math.max(endL, endR) + CONSIGNMENT_STACK_GAP;
    }

    sheet.pageSetup = {
      paperSize: 9,
      orientation: "portrait",
      margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0
    };
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function buildNakladnoyXlsx(
  template: "nakladnoy_warehouse" | "nakladnoy_expeditor",
  orders: NakladnoyOrderPayload[],
  options: NakladnoyBuildOptions = DEFAULT_NAKLADNOY_BUILD_OPTIONS
): Promise<Buffer> {
  if (template === "nakladnoy_warehouse") {
    return buildLoadingSheetWorkbook(orders, options);
  }
  return buildConsignmentWorkbook(orders, options);
}
