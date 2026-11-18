import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  formatReceiptAmount,
  receiptFooter,
  receiptRows,
  toWinAnsi,
  type ReceiptData,
} from "./receipt";

// A5 portrait, in points (design board pedidos-8c: 520×736 px).
const W = 419.53;
const H = 595.28;
const PAD_X = 37;
const PAD_TOP = 36;
const PAD_BOTTOM = 32;

const hex = (h: string) =>
  rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const INK = hex("#15231C");
const MUTED = hex("#5C6B62");
const GREEN = hex("#186B41");
const LINE = hex("#E7EEE6");
const ROW_LINE = hex("#EEF3EA");

/** Greedy word wrap; a single word wider than the box is hard-broken. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    let rest = word;
    while (font.widthOfTextAtSize(rest, size) > maxWidth) {
      let i = rest.length - 1;
      while (i > 1 && font.widthOfTextAtSize(rest.slice(0, i), size) > maxWidth) i--;
      lines.push(rest.slice(0, i));
      rest = rest.slice(i);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines;
}

function hr(page: PDFPage, y: number, color = LINE, thickness = 0.8) {
  page.drawLine({ start: { x: PAD_X, y }, end: { x: W - PAD_X, y }, thickness, color });
}

/** Renders the receipt (design pedidos-8c) to PDF bytes. */
export async function renderReceiptPdf(data: ReceiptData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Recibo · Pedido #${data.orderCode}`);
  doc.setCreator("Selet");
  doc.setProducer("Selet");
  doc.setCreationDate(data.generatedAt);
  const page = doc.addPage([W, H]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Header: brand line, title, subtitle; order code on the right.
  let y = H - PAD_TOP - 9;
  page.drawText(toWinAnsi(`SELET · ${data.storeName}`.toUpperCase()), { x: PAD_X, y, size: 9, font: bold, color: GREEN });
  y -= 26;
  page.drawText("Recibo", { x: PAD_X, y, size: 21, font: bold, color: INK });
  y -= 15;
  page.drawText("Pagamento via Pix", { x: PAD_X, y, size: 9.7, font: regular, color: MUTED });
  const code = toWinAnsi(`Pedido #${data.orderCode}`);
  page.drawText(code, { x: W - PAD_X - regular.widthOfTextAtSize(code, 9), y, size: 9, font: regular, color: MUTED });
  y -= 13;
  hr(page, y, GREEN, 1.6);

  // Amount.
  y -= 28;
  page.drawText("VALOR", { x: PAD_X, y, size: 9, font: bold, color: MUTED });
  y -= 30;
  page.drawText(toWinAnsi(formatReceiptAmount(data.amount)), { x: PAD_X, y, size: 27, font: bold, color: INK });
  y -= 16;
  hr(page, y);

  // Label/value rows.
  const labelW = 97;
  const size = 11;
  const lineH = 14;
  const rows = receiptRows(data);
  rows.forEach(([label, value], i) => {
    const lines = wrap(toWinAnsi(value), bold, size, W - PAD_X * 2 - labelW);
    const top = y;
    y -= 10 + size;
    page.drawText(label, { x: PAD_X, y, size, font: regular, color: MUTED });
    lines.forEach((line, j) => {
      page.drawText(line, { x: PAD_X + labelW, y: y - j * lineH, size, font: bold, color: INK });
    });
    y = top - (20 + size + (lines.length - 1) * lineH);
    if (i < rows.length - 1) hr(page, y, ROW_LINE);
  });

  // Footer.
  hr(page, PAD_BOTTOM + 18);
  page.drawText(toWinAnsi(receiptFooter(data)), { x: PAD_X, y: PAD_BOTTOM, size: 8.5, font: regular, color: MUTED });

  return doc.save();
}
