import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import { generateInvoicePDF } from "./lib/pdf-generator.js";
import { InvoiceSchema, buildEmailBody } from "./invoice-helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// ── POST /api/send-invoice ────────────────────────────────────────────────────
app.post("/api/send-invoice", async (req, res) => {
  try {
    const parsed = InvoiceSchema.safeParse(req.body.invoice);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.message });
      return;
    }
    const invoice = parsed.data;

    // Generate PDF
    const pdfBytes = await generateInvoicePDF(invoice);

    // Calculate total for email body
    const subtotal = invoice.lineItems.reduce((s, i) => s + i.quantity * i.rate, 0);
    const total    = subtotal + subtotal * (invoice.taxRate / 100);

    // Send via Gmail
    console.log(`[smtp] connecting to smtp.gmail.com:587 as ${process.env.GMAIL_USER}`);
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
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

    console.log(`[invoice] Sent #${invoice.invoiceNumber} to ${invoice.clientEmail}`);
    res.json({
      success: true,
      message: "Invoice sent successfully!",
    });
  } catch (err: unknown) {
    console.error("[send-invoice]", err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`\n  Invoice Automator running at http://localhost:${PORT}\n`);
});
