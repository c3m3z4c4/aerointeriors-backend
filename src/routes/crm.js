const express = require('express');
const { z } = require('zod');
const { PrismaClient } = require('@prisma/client');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
const prisma = new PrismaClient();

const clientSchema = z.object({
  orgId: z.string(),
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(['prospect', 'active', 'inactive']).optional(),
});

const quoteSchema = z.object({
  orgId: z.string(),
  clientId: z.string(),
  title: z.string().min(1),
  amount: z.number().optional().nullable(),
  currency: z.string().optional(),
  status: z.enum(['draft', 'sent', 'approved', 'rejected']).optional(),
  pdfPath: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  date: z.string().optional(),
});

// Clients
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

// Quotes
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
  const { date, ...rest } = quoteSchema.parse(req.body);
  const quote = await prisma.quote.create({
    data: { ...rest, date: date ? new Date(date) : new Date() },
    include: { client: { select: { id: true, name: true, company: true } } },
  });
  res.status(201).json(quote);
}));

router.put('/quotes/:id', asyncHandler(async (req, res) => {
  const { date, orgId, clientId, ...rest } = quoteSchema.partial().parse(req.body);
  const quote = await prisma.quote.update({
    where: { id: req.params.id },
    data: { ...rest, ...(date ? { date: new Date(date) } : {}) },
    include: { client: { select: { id: true, name: true, company: true } } },
  });
  res.json(quote);
}));

router.delete('/quotes/:id', asyncHandler(async (req, res) => {
  await prisma.quote.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

module.exports = router;
