import PDFDocument from "pdfkit";
import type { NakladnoyOrderPayload } from "./order-nakladnoy-xlsx";

type NakladnoyTemplateId = "nakladnoy_warehouse" | "nakladnoy_expeditor";

type PdfFormat = "a4";

function money(n: number): string {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(n);
}

function dateTime(v: Date): string {
  const dd = String(v.getDate()).padStart(2, "0");
  const mm = String(v.getMonth() + 1).padStart(2, "0");
  const yyyy = v.getFullYear();
  const hh = String(v.getHours()).padStart(2, "0");
  const mi = String(v.getMinutes()).padStart(2, "0");
  return `${dd}.${mm}.${yyyy} ${hh}:${mi}`;
}

function tableHeader(doc: PDFKit.PDFDocument, y: number): number {
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("№", 36, y, { width: 18 })
    .text("Kod", 58, y, { width: 70 })
    .text("Nomi", 132, y, { width: 240 })
    .text("Miqdor", 376, y, { width: 58, align: "right" })
    .text("Narx", 438, y, { width: 62, align: "right" })
    .text("Summa", 504, y, { width: 62, align: "right" });
  return y + 14;
}

function ensureSpace(doc: PDFKit.PDFDocument, y: number, need = 20): number {
  if (y + need <= 790) return y;
  doc.addPage();
  return 48;
}

function renderOrderBlock(
  doc: PDFKit.PDFDocument,
  order: NakladnoyOrderPayload,
  template: NakladnoyTemplateId,
  startY: number
): number {
  let y = startY;
  y = ensureSpace(doc, y, 88);
  const title =
    template === "nakladnoy_warehouse"
      ? "Загруз зав.склада 5.1.8 (PDF)"
      : "Накладные 2.1.0 (PDF)";
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(`${title} — Zakaz #${order.number}`, 36, y);
  y += 16;

  doc
    .font("Helvetica")
    .fontSize(9)
    .text(`Sana: ${dateTime(order.createdAt)}`, 36, y)
    .text(`Mijoz: ${order.clientName}`, 196, y, { width: 260 })
    .text(`Hudud: ${order.territory || "—"}`, 460, y, { width: 106, align: "right" });
  y += 13;

  doc
    .text(`Agent: ${order.agentLine || "—"}`, 36, y, { width: 340 })
    .text(`Ekspeditor: ${order.expeditorLine || "—"}`, 380, y, { width: 186, align: "right" });
  y += 13;

  doc
    .text(`Manzil: ${order.clientAddress || "—"}`, 36, y, { width: 530 });
  y += 16;

  y = tableHeader(doc, y);

  let idx = 1;
  let totalQty = 0;
  let totalSum = 0;
  for (const ln of order.lines) {
    y = ensureSpace(doc, y, 16);
    const qty = ln.qty + ln.bonusQty;
    const lineSum = ln.sum;
    totalQty += qty;
    totalSum += lineSum;
    doc
      .font("Helvetica")
      .fontSize(9)
      .text(String(idx++), 36, y, { width: 18 })
      .text(ln.sku, 58, y, { width: 70 })
      .text(ln.name, 132, y, { width: 240 })
      .text(money(qty), 376, y, { width: 58, align: "right" })
      .text(money(ln.price), 438, y, { width: 62, align: "right" })
      .text(money(lineSum), 504, y, { width: 62, align: "right" });
    y += 14;
  }

  y = ensureSpace(doc, y, 24);
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("Jami:", 300, y, { width: 70, align: "right" })
    .text(money(totalQty), 376, y, { width: 58, align: "right" })
    .text("", 438, y, { width: 62, align: "right" })
    .text(money(totalSum), 504, y, { width: 62, align: "right" });
  y += 22;

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#666666")
    .text("Imzo: ____________________", 36, y)
    .text("Qabul qildi: ____________________", 380, y, { width: 186, align: "right" })
    .fillColor("black");
  y += 20;
  doc
    .moveTo(36, y)
    .lineTo(566, y)
    .lineWidth(0.7)
    .strokeColor("#d0d0d0")
    .stroke()
    .strokeColor("black");
  return y + 12;
}

export async function buildNakladnoyPdf(
  template: NakladnoyTemplateId,
  orders: NakladnoyOrderPayload[],
  pageFormat: PdfFormat = "a4"
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: pageFormat.toUpperCase(),
    margin: 32,
    compress: true
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  let y = 42;
  for (let i = 0; i < orders.length; i++) {
    y = renderOrderBlock(doc, orders[i]!, template, y);
    if (i < orders.length - 1 && y > 760) {
      doc.addPage();
      y = 42;
    }
  }

  doc.end();
  await new Promise<void>((resolve, reject) => {
    doc.on("end", () => resolve());
    doc.on("error", reject);
  });
  return Buffer.concat(chunks);
}
