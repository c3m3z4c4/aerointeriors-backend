const express = require('express');
const { z } = require('zod');
const { PrismaClient } = require('@prisma/client');
const { asyncHandler } = require('../middleware/errorHandler');
const path = require('path');
const fs = require('fs');
const { generateQuotePdf } = require('../lib/pdfGenerator');

const router = express.Router();
const prisma = new PrismaClient();

const PDF_DIR = path.join(__dirname, '../../uploads/quotes');
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

const clientSchema = z.object({
  orgId: z.string(),
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  zip: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(['prospect', 'active', 'inactive']).optional(),
});

const quoteSchema = z.object({
  orgId: z.string(),
  clientId: z.string(),
  quoteNumber: z.string().optional().nullable(),
  title: z.string().min(1),
  // Aircraft
  aircraftMake: z.string().optional().nullable(),
  aircraftModel: z.string().optional().nullable(),
  aircraftYear: z.number().int().optional().nullable(),
  tailNumber: z.string().optional().nullable(),
  // Project
  description: z.string().optional().nullable(),
  lineItems: z.string().optional().nullable(),   // JSON string
  estimatedStart: z.string().optional().nullable(),
  estimatedEnd: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  // Financials
  subtotal: z.number().optional().nullable(),
  taxRate: z.number().optional().nullable(),
  taxAmount: z.number().optional().nullable(),
  discount: z.number().optional().nullable(),
  total: z.number().optional().nullable(),
  depositRequired: z.number().optional().nullable(),
  currency: z.string().optional(),
  paymentTerms: z.string().optional().nullable(),
  // Meta
  status: z.enum(['draft', 'sent', 'approved', 'rejected', 'expired']).optional(),
  validUntil: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  pdfPath: z.string().optional().nullable(),
  date: z.string().optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseOptDate(s) {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

async function getOrg(orgId) {
  const settings = await prisma.siteSettings.findFirst({ where: { orgId } });
  return settings;
}

async function nextQuoteNumber(orgId) {
  const year = new Date().getFullYear();
  const count = await prisma.quote.count({ where: { orgId } });
  return `QT-${year}-${String(count + 1).padStart(4, '0')}`;
}

// ── Clients ───────────────────────────────────────────────────────────────────

router.get('/clients', asyncHandler(async (req, res) => {
  const { orgId } = req.query;
  if (!orgId) return res.status(400).json({ error: 'orgId required' });
  const clients = await prisma.client.findMany({
    where: { orgId },
    include: { _count: { select: { quotes: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(clients);
}));

router.get('/clients/:id', asyncHandler(async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: { quotes: { orderBy: { date: 'desc' } } },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json(client);
}));

router.post('/clients', asyncHandler(async (req, res) => {
  const data = clientSchema.parse(req.body);
  const client = await prisma.client.create({ data });
  res.status(201).json(client);
}));

router.put('/clients/:id', asyncHandler(async (req, res) => {
  const { orgId, ...data } = clientSchema.partial().parse(req.body);
  const client = await prisma.client.update({ where: { id: req.params.id }, data });
  res.json(client);
}));

router.delete('/clients/:id', asyncHandler(async (req, res) => {
  await prisma.client.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

// ── Quotes ────────────────────────────────────────────────────────────────────

router.get('/quotes', asyncHandler(async (req, res) => {
  const { orgId, clientId } = req.query;
  if (!orgId) return res.status(400).json({ error: 'orgId required' });
  const quotes = await prisma.quote.findMany({
    where: { orgId, ...(clientId ? { clientId } : {}) },
    include: { client: { select: { id: true, name: true, company: true } } },
    orderBy: { date: 'desc' },
  });
  res.json(quotes);
}));

router.post('/quotes', asyncHandler(async (req, res) => {
  const { date, estimatedStart, estimatedEnd, validUntil, orgId, ...rest } = quoteSchema.parse(req.body);
  const quoteNumber = rest.quoteNumber || await nextQuoteNumber(orgId);
  const quote = await prisma.quote.create({
    data: {
      orgId, quoteNumber, ...rest,
      date: parseOptDate(date) || new Date(),
      estimatedStart: parseOptDate(estimatedStart),
      estimatedEnd: parseOptDate(estimatedEnd),
      validUntil: parseOptDate(validUntil),
    },
    include: { client: { select: { id: true, name: true, company: true, email: true, phone: true, address: true, city: true, state: true, zip: true } } },
  });
  res.status(201).json(quote);
}));

router.put('/quotes/:id', asyncHandler(async (req, res) => {
  const { date, estimatedStart, estimatedEnd, validUntil, orgId, clientId, ...rest } = quoteSchema.partial().parse(req.body);
  const quote = await prisma.quote.update({
    where: { id: req.params.id },
    data: {
      ...rest,
      ...(date ? { date: new Date(date) } : {}),
      ...(estimatedStart !== undefined ? { estimatedStart: parseOptDate(estimatedStart) } : {}),
      ...(estimatedEnd !== undefined ? { estimatedEnd: parseOptDate(estimatedEnd) } : {}),
      ...(validUntil !== undefined ? { validUntil: parseOptDate(validUntil) } : {}),
    },
    include: { client: { select: { id: true, name: true, company: true, email: true, phone: true, address: true, city: true, state: true, zip: true } } },
  });
  res.json(quote);
}));

router.delete('/quotes/:id', asyncHandler(async (req, res) => {
  const q = await prisma.quote.findUnique({ where: { id: req.params.id } });
  if (q?.pdfPath) {
    try { fs.unlinkSync(path.join(__dirname, '../..', q.pdfPath)); } catch {}
  }
  await prisma.quote.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

// ── Quote PDF ─────────────────────────────────────────────────────────────────

router.post('/quotes/:id/pdf', asyncHandler(async (req, res) => {
  const quote = await prisma.quote.findUnique({
    where: { id: req.params.id },
    include: { client: true },
  });
  if (!quote) return res.status(404).json({ error: 'Quote not found' });

  const org = await getOrg(quote.orgId);

  let pdfBytes;
  try {
    pdfBytes = await generateQuotePdf(quote, org);
  } catch (err) {
    console.error('[PDF] generateQuotePdf failed:', err.message, err.stack);
    return res.status(500).json({ error: `PDF generation failed: ${err.message}` });
  }

  try {
    const filename = `quote-${quote.quoteNumber || quote.id}.pdf`;
    const filepath = path.join(PDF_DIR, filename);
    fs.writeFileSync(filepath, pdfBytes);
    await prisma.quote.update({ where: { id: quote.id }, data: { pdfPath: `/uploads/quotes/${filename}` } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error('[PDF] write/send failed:', err.message);
    return res.status(500).json({ error: `PDF save failed: ${err.message}` });
  }
}));

module.exports = router;
