const express = require('express');
const { z } = require('zod');
const { PrismaClient } = require('@prisma/client');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

const contactSchema = z.object({
  orgId: z.string(),
  name: z.string().min(1),
  company: z.string().optional(),
  email: z.string().email(),
  phone: z.string().optional(),
  aircraftModel: z.string().optional(),
  serviceType: z.string().optional(),
  message: z.string().min(1),
});

router.get('/', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { orgId, unread } = req.query;
  const where = {
    ...(orgId && { orgId }),
    ...(unread === 'true' && { isRead: false }),
  };
  const messages = await prisma.contactMessage.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
  res.json(messages);
}));

router.post('/', asyncHandler(async (req, res) => {
  const data = contactSchema.parse(req.body);
  const message = await prisma.contactMessage.create({ data });
  res.status(201).json(message);
}));

router.patch('/:id', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const message = await prisma.contactMessage.update({
    where: { id: req.params.id },
    data: { isRead: req.body.isRead },
  });
  res.json(message);
}));

router.delete('/:id', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  await prisma.contactMessage.delete({ where: { id: req.params.id } });
  res.status(204).send();
}));

module.exports = router;
