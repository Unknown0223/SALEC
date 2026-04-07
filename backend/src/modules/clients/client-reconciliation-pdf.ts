import PDFDocument from "pdfkit";

export type ReconciliationPdfOrderRow = {
  number: string;
  created_at: string;
  total_sum: string;
  status: string;
  order_type: string;
};

export type ReconciliationPdfPaymentRow = {
  id: number;
  created_at: string;
  amount: string;
  payment_type: string;
  note: string | null;
  order_number: string | null;
};

export type ReconciliationPdfMovementRow = {
  created_at: string;
  delta: string;
  note: string | null;
};

export type ReconciliationPdfPayload = {
  tenantName: string;
  clientName: string;
  clientLegalName: string | null;
  clientId: number;
  clientCode: string | null;
  dateFromLabel: string;
  dateToLabel: string;
  generatedAtLabel: string;
  accountBalance: string;
  outstandingOrdersTotal: string;
  creditLimit: string;
  openingAccountBalance: string;
  closingAccountBalanceAtPeriodEnd: string;
  sumOrdersInPeriod: string;
  sumPaymentsInPeriod: string;
  sumMovementDeltasInPeriod: string;
  ordersInPeriod: ReconciliationPdfOrderRow[];
  paymentsInPeriod: ReconciliationPdfPaymentRow[];
  movementsInPeriod: ReconciliationPdfMovementRow[];
};

function money(n: number): string {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(n);
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}.${mm}.${yyyy} ${hh}:${mi}`;
}

function clip(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function ensureSpace(doc: PDFKit.PDFDocument, y: number, need = 24): number {
  if (y + need <= 790) return y;
  doc.addPage();
  return 48;
}

export async function buildClientReconciliationPdf(payload: ReconciliationPdfPayload): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 36, compress: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  let y = 36;
  doc.font("Helvetica-Bold").fontSize(13).text("Akt-sverka (mijoz bo‘yicha)", 36, y);
  y += 18;
  doc
    .font("Helvetica")
    .fontSize(9)
    .text(`Kompaniya: ${payload.tenantName}`, 36, y)
    .text(`Davr: ${payload.dateFromLabel} — ${payload.dateToLabel}`, 36, y + 12)
    .text(`Hujjat sanasi: ${payload.generatedAtLabel}`, 36, y + 24);
  y += 40;

  doc.font("Helvetica-Bold").fontSize(10).text("Mijoz", 36, y);
  y += 14;
  doc.font("Helvetica").fontSize(9);
  doc.text(`Nomi: ${payload.clientName}`, 36, y);
  y += 12;
  if (payload.clientLegalName) {
    doc.text(`Yuridik nomi: ${payload.clientLegalName}`, 36, y);
    y += 12;
  }
  doc.text(`ID: ${payload.clientId}${payload.clientCode ? `    Kod: ${payload.clientCode}` : ""}`, 36, y);
  y += 16;

  doc.font("Helvetica-Bold").text("Qisqacha yig‘ma", 36, y);
  y += 12;
  doc.font("Helvetica");
  const lines = [
    `Hisob saldosi (joriy, tizimda): ${money(Number.parseFloat(payload.accountBalance) || 0)}`,
    `Ochiq zakazlar jami (bekor/qaytarilgandan tashqari): ${money(Number.parseFloat(payload.outstandingOrdersTotal) || 0)}`,
    `Kredit limiti: ${money(Number.parseFloat(payload.creditLimit) || 0)}`,
    `Hisob harakatlari — davr boshidagi qoldiq: ${money(Number.parseFloat(payload.openingAccountBalance) || 0)}`,
    `Hisob harakatlari — davr ichida (yig‘ma): ${money(Number.parseFloat(payload.sumMovementDeltasInPeriod) || 0)}`,
    `Hisob harakatlari — davr oxirigacha qoldiq: ${money(Number.parseFloat(payload.closingAccountBalanceAtPeriodEnd) || 0)}`,
    `Davr ichida zakazlar summasi: ${money(Number.parseFloat(payload.sumOrdersInPeriod) || 0)}`,
    `Davr ichida to‘lovlar summasi: ${money(Number.parseFloat(payload.sumPaymentsInPeriod) || 0)}`
  ];
  for (const ln of lines) {
    y = ensureSpace(doc, y, 14);
    doc.text(ln, 36, y, { width: 520 });
    y += 12;
  }
  y += 8;

  const section = (title: string) => {
    y = ensureSpace(doc, y, 22);
    doc.font("Helvetica-Bold").fontSize(10).text(title, 36, y);
    y += 14;
    doc.font("Helvetica").fontSize(9);
  };

  section(`Zakazlar (${payload.ordersInPeriod.length})`);
  if (payload.ordersInPeriod.length === 0) {
    y = ensureSpace(doc, y, 14);
    doc.text("—", 36, y);
    y += 12;
  } else {
    const h = y;
    doc
      .font("Helvetica-Bold")
      .text("№", 36, h, { width: 22 })
      .text("Sana", 60, h, { width: 108 })
      .text("Holat", 172, h, { width: 72 })
      .text("Tur", 248, h, { width: 52 })
      .text("Summa", 420, h, { width: 96, align: "right" });
    y = h + 13;
    doc.moveTo(36, y).lineTo(558, y).lineWidth(0.5).strokeColor("#cccccc").stroke();
    y += 4;
    doc.font("Helvetica");
    for (const o of payload.ordersInPeriod) {
      y = ensureSpace(doc, y, 16);
      doc
        .text(o.number, 36, y, { width: 22 })
        .text(fmtDateTime(o.created_at), 60, y, { width: 108 })
        .text(clip(o.status, 20), 172, y, { width: 72 })
        .text(clip(o.order_type, 12), 248, y, { width: 52 })
        .text(money(Number.parseFloat(o.total_sum) || 0), 420, y, { width: 96, align: "right" });
      y += 13;
    }
  }
  y += 6;

  section(`To‘lovlar (${payload.paymentsInPeriod.length})`);
  if (payload.paymentsInPeriod.length === 0) {
    y = ensureSpace(doc, y, 14);
    doc.text("—", 36, y);
    y += 12;
  } else {
    const h = y;
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .text("ID", 36, h, { width: 28 })
      .text("Sana", 64, h, { width: 100 })
      .text("Tur", 168, h, { width: 72 })
      .text("Z.", 244, h, { width: 36 })
      .text("Summa", 400, h, { width: 96, align: "right" });
    y = h + 13;
    doc.moveTo(36, y).lineTo(558, y).lineWidth(0.5).strokeColor("#cccccc").stroke();
    y += 4;
    doc.font("Helvetica");
    for (const p of payload.paymentsInPeriod) {
      y = ensureSpace(doc, y, 28);
      doc.font("Helvetica").fontSize(8);
      doc
        .text(String(p.id), 36, y, { width: 28 })
        .text(fmtDateTime(p.created_at), 64, y, { width: 100 })
        .text(clip(p.payment_type, 18), 168, y, { width: 72 })
        .text(p.order_number ?? "—", 244, y, { width: 36 })
        .text(money(Number.parseFloat(p.amount) || 0), 400, y, { width: 96, align: "right" });
      y += 11;
      doc.text(clip(p.note ?? "—", 100), 36, y, { width: 500 });
      y += 12;
      doc.fontSize(9);
    }
  }
  y += 6;

  section(`Hisob balansi harakatlari (${payload.movementsInPeriod.length})`);
  if (payload.movementsInPeriod.length === 0) {
    y = ensureSpace(doc, y, 14);
    doc.text("—", 36, y);
    y += 12;
  } else {
    const h = y;
    doc
      .font("Helvetica-Bold")
      .text("Sana", 36, h, { width: 120 })
      .text("Delta", 400, h, { width: 96, align: "right" })
      .text("Izoh", 36, h + 12, { width: 460 });
    y = h + 26;
    doc.moveTo(36, y).lineTo(558, y).lineWidth(0.5).strokeColor("#cccccc").stroke();
    y += 4;
    doc.font("Helvetica");
    for (const m of payload.movementsInPeriod) {
      y = ensureSpace(doc, y, 26);
      doc.text(fmtDateTime(m.created_at), 36, y, { width: 120 });
      doc.text(money(Number.parseFloat(m.delta) || 0), 400, y, { width: 96, align: "right" });
      y += 12;
      doc.text(clip(m.note ?? "—", 140), 36, y, { width: 500 });
      y += 13;
    }
  }

  y = ensureSpace(doc, y, 36);
  doc
    .font("Helvetica-Oblique")
    .fontSize(8)
    .fillColor("#555555")
    .text(
      "Eslatma: ochiq zakazlar summasi kredit yukini ifodalaydi; hisob saldosi esa to‘lov va qo‘lda harakatlar yig‘indisi.",
      36,
      y,
      { width: 520 }
    );

  doc.end();
  await new Promise<void>((resolve, reject) => {
    doc.on("end", () => resolve());
    doc.on("error", reject);
  });
  return Buffer.concat(chunks);
}
