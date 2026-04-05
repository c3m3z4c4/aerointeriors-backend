const express = require('express');
const { z } = require('zod');
const { PrismaClient } = require('@prisma/client');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
const prisma = new PrismaClient();

const appointmentSchema = z.object({
  orgId: z.string(),
  title: z.string().min(1),
  date: z.string(),
  duration: z.number().int().optional(),
  clientId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(['scheduled', 'completed', 'cancelled']).optional(),
});

router.get('/', asyncHandler(async (req, res) => {
  const { orgId, from, to } = req.query;
  if (!orgId) return res.status(400).json({ error: 'orgId required' });
  const where = {
    orgId,
    ...(from || to ? {
      date: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      },
    } : {}),
  };
  const appointments = await prisma.appointment.findMany({
    where,
    include: { client: { select: { id: true, name: true, company: true } } },
    orderBy: { date: 'asc' },
  });
  res.json(appointments);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const appt = await prisma.appointment.findUnique({
    where: { id: req.params.id },
    include: { client: { select: { id: true, name: true, company: true } } },
  });
  if (!appt) return res.status(404).json({ error: 'Not found' });
  res.json(appt);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { date, ...rest } = appointmentSchema.parse(req.body);
  const appt = await prisma.appointment.create({
    data: { ...rest, date: new Date(date) },
    include: { client: { select: { id: true, name: true, company: true } } },
  });
  res.status(201).json(appt);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { date, orgId, ...rest } = appointmentSchema.partial().parse(req.body);
  const appt = await prisma.appointment.update({
    where: { id: req.params.id },
    data: { ...rest, ...(date ? { date: new Date(date) } : {}) },
    include: { client: { select: { id: true, name: true, company: true } } },
  });
  res.json(appt);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await prisma.appointment.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

module.exports = router;
