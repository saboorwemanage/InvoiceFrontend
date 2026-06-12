import "dotenv/config";
import { schemaTask, logger, AbortTaskRunError } from "@trigger.dev/sdk";
import { z } from "zod";
import nodemailer from "nodemailer";
import { generateInvoicePDF } from "../lib/pdf-generator.js";

// ── Schemas ──────────────────────────────────────────────────────────────────

const LineItemSchema = z.object({
  description: z.string().min(1),
  quantity:    z.number().positive(),
  rate:        z.number().positive(),
});

export const InvoiceSchema = z.object({
  invoiceNumber: z.string().min(1),
  invoiceDate:   z.string().min(1),
  dueDate:       z.string().min(1),
  fromName:      z.string().min(1),
  fromEmail:     z.string().email(),
  fromAddress:   z.string().optional(),
  fromPhone:     z.string().optional(),
  clientName:    z.string().min(1),
  clientEmail:   z.string().email(),
  clientCompany: z.string().optional(),
  clientAddress: z.string().optional(),
  lineItems:     z.array(LineItemSchema).min(1),
  taxRate:       z.number().min(0).max(100).default(0),
  notes:         z.string().optional(),
  currency:      z.string().default("USD"),
});

export type InvoiceData = z.infer<typeof InvoiceSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildEmailBody(inv: InvoiceData, total: number): string {
  const sym: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", CAD: "CA$", AUD: "A$" };
  const s = sym[inv.currency] ?? inv.currency + " ";
  const fmtAmt = (n: number) => `${s}${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1e293b; margin: 0; padding: 0; background: #f8fafc; }
    .wrapper { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.07); }
    .header  { background: #0f172a; padding: 28px 32px; }
    .header h1 { color: #fff; margin: 0; font-size: 22px; }
    .header p  { color: #94a3b8; margin: 4px 0 0; font-size: 13px; }
    .body    { padding: 28px 32px; }
    .amount  { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px 20px; border-radius: 6px; margin: 20px 0; }
    .amount .label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    .amount .value { font-size: 28px; font-weight: 700; color: #1e40af; margin-top: 2px; }
    .meta    { display: flex; gap: 24px; margin: 20px 0; }
    .meta-item .label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
    .meta-item .value { font-size: 14px; font-weight: 600; color: #1e293b; margin-top: 3px; }
    .note    { font-size: 13px; color: #64748b; margin-top: 20px; line-height: 1.6; }
    .footer  { background: #f8fafc; padding: 16px 32px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Invoice from ${inv.fromName}</h1>
      <p>Invoice #${inv.invoiceNumber} · Due ${inv.dueDate}</p>
    </div>
    <div class="body">
      <p>Hi ${inv.clientName},</p>
      <p>Please find attached your invoice. Here's a summary:</p>

      <div class="amount">
        <div class="label">Total Due</div>
        <div class="value">${fmtAmt(total)}</div>
      </div>

      <div class="meta">
        <div class="meta-item">
          <div class="label">Invoice #</div>
          <div class="value">${inv.invoiceNumber}</div>
        </div>
        <div class="meta-item">
          <div class="label">Invoice Date</div>
          <div class="value">${inv.invoiceDate}</div>
        </div>
        <div class="meta-item">
          <div class="label">Due Date</div>
          <div class="value">${inv.dueDate}</div>
        </div>
      </div>

      ${inv.notes ? `<div class="note"><strong>Notes:</strong><br>${inv.notes}</div>` : ""}

      <p class="note">The full invoice PDF is attached to this email. Please don't hesitate to reach out if you have any questions.</p>
      <p style="margin-top: 24px;">Best regards,<br><strong>${inv.fromName}</strong><br>${inv.fromEmail}</p>
    </div>
    <div class="footer">
      This invoice was sent via Invoice Automator.
    </div>
  </div>
</body>
</html>`.trim();
}

// ── Task ──────────────────────────────────────────────────────────────────────

export const sendInvoiceTask = schemaTask({
  id: "send-invoice",
  schema: z.object({
    invoice: InvoiceSchema,
  }),
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 3000,
    maxTimeoutInMs: 30000,
    factor: 2,
    randomize: true,
  },
  run: async (payload) => {
    const { invoice } = payload;

    // ── Step 1: Generate PDF ────────────────────────────────────────────────
    logger.info("Generating invoice PDF", {
      invoiceNumber: invoice.invoiceNumber,
      client: invoice.clientEmail,
      items: invoice.lineItems.length,
    });

    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await generateInvoicePDF(invoice);
    } catch (err) {
      throw new AbortTaskRunError(`PDF generation failed: ${String(err)}`);
    }

    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");
    logger.info("PDF generated", { sizeBytes: pdfBytes.length });

    // ── Step 2: Calculate totals for email body ─────────────────────────────
    const subtotal = invoice.lineItems.reduce((s, i) => s + i.quantity * i.rate, 0);
    const tax      = subtotal * (invoice.taxRate / 100);
    const total    = subtotal + tax;

    // ── Step 3: Send via Gmail (nodemailer + App Password) ─────────────────
    logger.info("Sending invoice via Gmail", { to: invoice.clientEmail });

    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      throw new AbortTaskRunError("GMAIL_USER or GMAIL_APP_PASSWORD is not set in .env");
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    await transporter.sendMail({
      from:        `"${invoice.fromName}" <${process.env.GMAIL_USER}>`,
      to:          invoice.clientEmail,
      subject:     `Invoice #${invoice.invoiceNumber} from ${invoice.fromName} — Due ${invoice.dueDate}`,
      html:        buildEmailBody(invoice, total),
      attachments: [{
        filename:    `invoice-${invoice.invoiceNumber}.pdf`,
        content:     Buffer.from(pdfBytes),
        contentType: "application/pdf",
      }],
    });

    logger.info("Invoice sent successfully", {
      invoiceNumber: invoice.invoiceNumber,
      sentTo:        invoice.clientEmail,
      total,
    });

    return {
      success:       true,
      invoiceNumber: invoice.invoiceNumber,
      sentTo:        invoice.clientEmail,
      total,
      currency:      invoice.currency,
    };
  },
});
