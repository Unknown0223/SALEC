import PDFDocument from "pdfkit";
import type { TransferDetail } from "./warehouse-transfers.service";

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}.${mm}.${yyyy} ${hh}:${mi}`;
}

function actor(name: string | null, login: string | null, id: number | null): string {
  if (name && login) return `${name} (${login})`;
  if (name) return name;
  if (login) return login;
  if (id != null) return `#${id}`;
  return "—";
}

export async function buildTransferPdf(detail: TransferDetail): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 32,
    compress: true
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  doc.font("Helvetica-Bold").fontSize(13).text(`Перемещение: ${detail.number}`);
  doc.moveDown(0.25);
  doc
    .font("Helvetica")
    .fontSize(9)
    .text(`Holat: ${detail.status}`, { continued: true })
    .text(`    Reja: ${fmtDateTime(detail.planned_date)}`)
    .text(`Manba ombor: ${detail.source_warehouse_name}`)
    .text(`Qabul ombori: ${detail.destination_warehouse_name}`)
    .text(`Yaratilgan: ${fmtDateTime(detail.created_at)}`)
    .text(`Boshlangan: ${fmtDateTime(detail.started_at)}`, { continued: true })
    .text(`    Qabul qilingan: ${fmtDateTime(detail.received_at)}`)
    .text(`Kim yaratgan: ${actor(detail.created_by_name, detail.created_by_login, detail.created_by_user_id)}`)
    .text(`Qabul qilgan: ${actor(detail.received_by_name, detail.received_by_login, detail.received_by_user_id)}`);
  doc.moveDown(0.35);
  doc.text(`Izoh: ${detail.comment?.trim() ? detail.comment : "—"}`);
  doc.moveDown(0.6);

  const yHeader = doc.y;
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("№", 32, yHeader, { width: 24 })
    .text("Kod", 58, yHeader, { width: 70 })
    .text("Nomi", 132, yHeader, { width: 224 })
    .text("Partiya", 360, yHeader, { width: 72 })
    .text("Miqdor", 436, yHeader, { width: 62, align: "right" })
    .text("Qabul", 500, yHeader, { width: 62, align: "right" });
  doc.moveTo(32, yHeader + 13).lineTo(562, yHeader + 13).lineWidth(0.7).strokeColor("#cccccc").stroke();
  let y = yHeader + 16;

  for (let i = 0; i < detail.lines.length; i++) {
    const ln = detail.lines[i]!;
    if (y > 790) {
      doc.addPage();
      y = 42;
    }
    doc
      .font("Helvetica")
      .fontSize(9)
      .text(String(i + 1), 32, y, { width: 24 })
      .text(ln.product_sku, 58, y, { width: 70 })
      .text(ln.product_name, 132, y, { width: 224 })
      .text(ln.batch_no ?? "—", 360, y, { width: 72 })
      .text(ln.qty, 436, y, { width: 62, align: "right" })
      .text(ln.received_qty ?? "—", 500, y, { width: 62, align: "right" });
    y += 14;
  }

  doc.end();
  await new Promise<void>((resolve, reject) => {
    doc.on("end", () => resolve());
    doc.on("error", reject);
  });
  return Buffer.concat(chunks);
}
