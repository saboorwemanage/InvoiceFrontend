import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export interface LineItem {
  description: string;
  quantity: number;
  rate: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  fromName: string;
  fromEmail: string;
  fromAddress?: string;
  fromPhone?: string;
  clientName: string;
  clientEmail: string;
  clientCompany?: string;
  clientAddress?: string;
  lineItems: LineItem[];
  taxRate: number;
  notes?: string;
  currency: string;
}

const C = {
  navy:    rgb(0.08, 0.12, 0.25),
  blue:    rgb(0.23, 0.51, 0.96),
  text:    rgb(0.10, 0.10, 0.12),
  muted:   rgb(0.45, 0.47, 0.55),
  border:  rgb(0.87, 0.88, 0.92),
  bg:      rgb(0.97, 0.97, 0.99),
  white:   rgb(1.00, 1.00, 1.00),
};

function fmt(amount: number, currency: string): string {
  const sym: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", CAD: "CA$", AUD: "A$" };
  const s = sym[currency] ?? currency + " ";
  return `${s}${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

export async function generateInvoicePDF(data: InvoiceData): Promise<Uint8Array> {
  const doc   = await PDFDocument.create();
  const page  = doc.addPage([612, 792]);
  const { width, height } = page.getSize();

  const bold    = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const oblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  const M = 50; // margin
  let y = height;

  // ── Header band ────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: C.navy });
  page.drawRectangle({ x: 0, y: height - 84, width, height: 4, color: C.blue });

  page.drawText("INVOICE", { x: M, y: height - 50, font: bold, size: 30, color: C.white });
  page.drawText(`#${data.invoiceNumber}`, { x: M, y: height - 68, font: regular, size: 11, color: rgb(0.65, 0.72, 0.90) });

  // Right side: company name in header
  const nameWidth = bold.widthOfTextAtSize(data.fromName, 13);
  page.drawText(data.fromName, { x: width - M - nameWidth, y: height - 48, font: bold, size: 13, color: C.white });
  const emailWidth = regular.widthOfTextAtSize(data.fromEmail, 9);
  page.drawText(data.fromEmail, { x: width - M - emailWidth, y: height - 63, font: regular, size: 9, color: rgb(0.65, 0.72, 0.90) });

  y = height - 108;

  // ── FROM / BILL TO ─────────────────────────────────────────────────────────
  const col2X = width / 2 + 10;

  page.drawText("FROM", { x: M, y, font: bold, size: 8, color: C.muted });
  page.drawText("BILL TO", { x: col2X, y, font: bold, size: 8, color: C.muted });

  y -= 18;
  page.drawText(data.fromName, { x: M, y, font: bold, size: 13, color: C.text });
  page.drawText(data.clientName, { x: col2X, y, font: bold, size: 13, color: C.text });

  y -= 16;
  page.drawText(data.fromEmail, { x: M, y, font: regular, size: 10, color: C.muted });

  if (data.clientCompany) {
    page.drawText(data.clientCompany, { x: col2X, y, font: bold, size: 10, color: C.text });
    y -= 14;
    page.drawText(data.clientEmail, { x: col2X, y, font: regular, size: 10, color: C.muted });
  } else {
    page.drawText(data.clientEmail, { x: col2X, y, font: regular, size: 10, color: C.muted });
  }

  y -= 14;
  if (data.fromPhone) page.drawText(data.fromPhone, { x: M, y, font: regular, size: 10, color: C.muted });
  if (data.clientAddress) page.drawText(data.clientAddress, { x: col2X, y, font: regular, size: 10, color: C.muted });
  if (data.fromAddress) {
    y -= 14;
    page.drawText(data.fromAddress, { x: M, y, font: regular, size: 10, color: C.muted });
  }

  y -= 28;

  // ── Meta row (date / due / number) ─────────────────────────────────────────
  const meta = [
    { label: "INVOICE DATE", value: data.invoiceDate },
    { label: "DUE DATE",     value: data.dueDate },
    { label: "INVOICE #",    value: data.invoiceNumber },
  ];
  const metaColW = (width - 2 * M) / meta.length;

  page.drawRectangle({ x: M, y: y - 32, width: width - 2 * M, height: 40, color: C.bg });
  page.drawRectangle({ x: M, y: y - 32, width: width - 2 * M, height: 40, borderColor: C.border, borderWidth: 0.75 });

  meta.forEach((m, i) => {
    const cx = M + i * metaColW + 14;
    page.drawText(m.label, { x: cx, y: y - 12, font: bold, size: 7, color: C.muted });
    page.drawText(m.value, { x: cx, y: y - 25, font: bold, size: 11, color: C.text });
    if (i < meta.length - 1)
      page.drawLine({ start: { x: M + (i + 1) * metaColW, y: y - 32 }, end: { x: M + (i + 1) * metaColW, y: y + 8 }, thickness: 0.75, color: C.border });
  });

  y -= 52;

  // ── Table header ───────────────────────────────────────────────────────────
  const TL = M;
  const TR = width - M;
  const TW = TR - TL;
  const qtyX    = TL + TW * 0.60;
  const rateX   = TL + TW * 0.73;
  const amtX    = TL + TW * 0.87;

  page.drawRectangle({ x: TL, y: y - 24, width: TW, height: 28, color: C.navy });
  page.drawText("DESCRIPTION", { x: TL + 12, y: y - 14, font: bold, size: 8, color: C.white });
  page.drawText("QTY",         { x: qtyX,    y: y - 14, font: bold, size: 8, color: C.white });
  page.drawText("RATE",        { x: rateX,   y: y - 14, font: bold, size: 8, color: C.white });
  page.drawText("AMOUNT",      { x: amtX,    y: y - 14, font: bold, size: 8, color: C.white });
  y -= 24;

  // ── Line items ─────────────────────────────────────────────────────────────
  let subtotal = 0;

  data.lineItems.forEach((item, idx) => {
    const amount = item.quantity * item.rate;
    subtotal += amount;
    const rowH = 28;
    const rowBg = idx % 2 === 0 ? C.white : C.bg;

    page.drawRectangle({ x: TL, y: y - rowH, width: TW, height: rowH, color: rowBg });
    page.drawLine({ start: { x: TL, y: y - rowH }, end: { x: TR, y: y - rowH }, thickness: 0.5, color: C.border });

    page.drawText(item.description, { x: TL + 12, y: y - 17, font: regular, size: 10, color: C.text, maxWidth: qtyX - TL - 20 });
    page.drawText(String(item.quantity), { x: qtyX,  y: y - 17, font: regular, size: 10, color: C.text });
    page.drawText(fmt(item.rate, data.currency), { x: rateX, y: y - 17, font: regular, size: 10, color: C.text });
    page.drawText(fmt(amount, data.currency),    { x: amtX,  y: y - 17, font: bold,    size: 10, color: C.text });

    y -= rowH;
  });

  // closing line
  page.drawLine({ start: { x: TL, y }, end: { x: TR, y }, thickness: 1.5, color: C.navy });
  y -= 18;

  // ── Totals ─────────────────────────────────────────────────────────────────
  const tax   = subtotal * (data.taxRate / 100);
  const total = subtotal + tax;
  const tX    = width - M - 200;
  const vXEnd = width - M;

  const drawTotalRow = (label: string, value: string, isBold = false) => {
    const vW = (isBold ? bold : regular).widthOfTextAtSize(value, isBold ? 12 : 10);
    page.drawText(label, { x: tX, y, font: isBold ? bold : regular, size: isBold ? 11 : 10, color: isBold ? C.text : C.muted });
    page.drawText(value, { x: vXEnd - vW, y, font: isBold ? bold : regular, size: isBold ? 12 : 10, color: C.text });
    y -= 18;
  };

  drawTotalRow("Subtotal", fmt(subtotal, data.currency));

  if (data.taxRate > 0) drawTotalRow(`Tax (${data.taxRate}%)`, fmt(tax, data.currency));

  // divider
  page.drawLine({ start: { x: tX - 5, y: y + 8 }, end: { x: vXEnd, y: y + 8 }, thickness: 0.75, color: C.border });
  y -= 6;

  // Total box
  page.drawRectangle({ x: tX - 10, y: y - 30, width: vXEnd - tX + 18, height: 38, color: C.blue });
  page.drawText("TOTAL DUE", { x: tX - 2, y: y - 13, font: bold, size: 8, color: C.white });
  const totalStr = fmt(total, data.currency);
  const totalW = bold.widthOfTextAtSize(totalStr, 15);
  page.drawText(totalStr, { x: vXEnd - totalW, y: y - 16, font: bold, size: 15, color: C.white });
  y -= 52;

  // ── Notes ──────────────────────────────────────────────────────────────────
  if (data.notes) {
    page.drawLine({ start: { x: M, y: y + 5 }, end: { x: width / 2 - 20, y: y + 5 }, thickness: 0.5, color: C.border });
    y -= 14;
    page.drawText("NOTES & PAYMENT TERMS", { x: M, y, font: bold, size: 8, color: C.muted });
    y -= 16;

    const maxW = width / 2 - M - 20;
    const words = data.notes.split(" ");
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (regular.widthOfTextAtSize(test, 10) > maxW && line) {
        page.drawText(line, { x: M, y, font: regular, size: 10, color: C.text });
        y -= 15;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) page.drawText(line, { x: M, y, font: regular, size: 10, color: C.text });
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width, height: 36, color: C.bg });
  page.drawLine({ start: { x: 0, y: 36 }, end: { x: width, y: 36 }, thickness: 0.5, color: C.border });
  page.drawText("Thank you for your business!", { x: M, y: 14, font: oblique, size: 10, color: C.muted });
  const gen = "Invoice Automator";
  page.drawText(gen, { x: width - M - regular.widthOfTextAtSize(gen, 8), y: 14, font: regular, size: 8, color: C.border });

  return await doc.save();
}
