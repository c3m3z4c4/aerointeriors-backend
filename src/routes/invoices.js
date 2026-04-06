const express = require('express');
const { z } = require('zod');
const { PrismaClient } = require('@prisma/client');
const { asyncHandler } = require('../middleware/errorHandler');
const path = require('path');
const fs = require('fs');
const { generateInvoicePdf } = require('../lib/pdfGenerator');

const router = express.Router();
const prisma = new PrismaClient();

const PDF_DIR = path.join(__dirname, '../../uploads/invoices');
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

const invoiceSchema = z.object({
  orgId: z.string(),
  clientId: z.string(),
  quoteId: z.string().optional().nullable(),
  invoiceNumber: z.string().optional().nullable(),
  // Bill-to snapshot
  billToName: z.string().min(1),
  billToCompany: z.string().optional().nullable(),
  billToAddress: z.string().optional().nullable(),
  billToCity: z.string().optional().nullable(),
  billToState: z.string().optional().nullable(),
  billToZip: z.string().optional().nullable(),
  billToEmail: z.string().optional().nullable(),
  billToPhone: z.string().optional().nullable(),
  // Line items
  lineItems: z.string().optional().nullable(),
  // Financials
  subtotal: z.number().optional().nullable(),
  taxRate: z.number().optional().nullable(),
  taxAmount: z.number().optional().nullable(),
  discount: z.number().optional().nullable(),
  total: z.number().optional().nullable(),
  amountPaid: z.number().optional(),
  currency: z.string().optional(),
  paymentTerms: z.string().optional().nullable(),
  paymentMethod: z.string().optional().nullable(),
  paymentNotes: z.string().optional().nullable(),
  // Dates
  issueDate: z.string().optional(),
  dueDate: z.string().optional().nullable(),
  paidDate: z.string().optional().nullable(),
  // Meta
  status: z.enum(['draft', 'sent', 'paid', 'overdue', 'cancelled']).optional(),
  poNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  pdfPath: z.string().optional().nullable(),
});

function parseOptDate(s) {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

async function getOrg(orgId) {
  return prisma.siteSettings.findFirst({ where: { orgId } });
}

async function nextInvoiceNumber(orgId) {
  const year = new Date().getFullYear();
  const count = await prisma.invoice.count({ where: { orgId } });
  return `INV-${year}-${String(count + 1).padStart(4, '0')}`;
}

const clientInclude = {
  id: true, name: true, company: true, email: true, phone: true,
  address: true, city: true, state: true, zip: true,
};

// ── List ──────────────────────────────────────────────────────────────────────

router.get('/', asyncHandler(async (req, res) => {
  const { orgId, clientId, status } = req.query;
  if (!orgId) return res.status(400).json({ error: 'orgId required' });
  const invoices = await prisma.invoice.findMany({
    where: {
      orgId,
      ...(clientId ? { clientId } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      client: { select: clientInclude },
      quote: { select: { id: true, quoteNumber: true, title: true } },
    },
    orderBy: { issueDate: 'desc' },
  });
  res.json(invoices);
}));

// ── Single ────────────────────────────────────────────────────────────────────

router.get('/:id', asyncHandler(async (req, res) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: {
      client: { select: clientInclude },
      quote: { select: { id: true, quoteNumber: true, title: true } },
    },
  });
  if (!invoice) return res.status(404).json({ error: 'Not found' });
  res.json(invoice);
}));

// ── Create ────────────────────────────────────────────────────────────────────

router.post('/', asyncHandler(async (req, res) => {
  const { issueDate, dueDate, paidDate, orgId, ...rest } = invoiceSchema.parse(req.body);
  const invoiceNumber = rest.invoiceNumber || await nextInvoiceNumber(orgId);
  const invoice = await prisma.invoice.create({
    data: {
      orgId, invoiceNumber, ...rest,
      issueDate: parseOptDate(issueDate) || new Date(),
      dueDate: parseOptDate(dueDate),
      paidDate: parseOptDate(paidDate),
    },
    include: {
      client: { select: clientInclude },
      quote: { select: { id: true, quoteNumber: true, title: true } },
    },
  });
  res.status(201).json(invoice);
}));

// ── Update ────────────────────────────────────────────────────────────────────

router.put('/:id', asyncHandler(async (req, res) => {
  const { issueDate, dueDate, paidDate, orgId, clientId, ...rest } = invoiceSchema.partial().parse(req.body);
  const invoice = await prisma.invoice.update({
    where: { id: req.params.id },
    data: {
      ...rest,
      ...(issueDate !== undefined ? { issueDate: parseOptDate(issueDate) } : {}),
      ...(dueDate !== undefined ? { dueDate: parseOptDate(dueDate) } : {}),
      ...(paidDate !== undefined ? { paidDate: parseOptDate(paidDate) } : {}),
    },
    include: {
      client: { select: clientInclude },
      quote: { select: { id: true, quoteNumber: true, title: true } },
    },
  });
  res.json(invoice);
}));

// ── Delete ────────────────────────────────────────────────────────────────────

router.delete('/:id', asyncHandler(async (req, res) => {
  const inv = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (inv?.pdfPath) {
    try { fs.unlinkSync(path.join(__dirname, '../..', inv.pdfPath)); } catch {}
  }
  await prisma.invoice.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

// ── Generate PDF ──────────────────────────────────────────────────────────────

router.post('/:id/pdf', asyncHandler(async (req, res) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: {
      client: true,
      quote: { select: { id: true, quoteNumber: true, title: true } },
    },
  });
  if (!invoice) return res.status(404).json({ error: 'Not found' });

  const org = await getOrg(invoice.orgId);

  let pdfBytes;
  try {
    pdfBytes = await generateInvoicePdf(invoice, org);
  } catch (err) {
    console.error('[PDF] generateInvoicePdf failed:', err.message, err.stack);
    return res.status(500).json({ error: `PDF generation failed: ${err.message}` });
  }

  try {
    const filename = `invoice-${invoice.invoiceNumber || invoice.id}.pdf`;
    const filepath = path.join(PDF_DIR, filename);
    fs.writeFileSync(filepath, pdfBytes);
    await prisma.invoice.update({ where: { id: invoice.id }, data: { pdfPath: `/uploads/invoices/${filename}` } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error('[PDF] write/send failed:', err.message);
    return res.status(500).json({ error: `PDF save failed: ${err.message}` });
  }
}));

module.exports = router;
