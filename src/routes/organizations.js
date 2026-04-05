const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', asyncHandler(async (req, res) => {
  const orgs = await prisma.organization.findMany();
  res.json(orgs);
}));

router.get('/default', asyncHandler(async (req, res) => {
  const org = await prisma.organization.findFirst({ where: { slug: 'aerointeriors' } });
  if (!org) return res.status(404).json({ error: 'Default org not found' });
  res.json(org);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { id: req.params.id } });
  if (!org) return res.status(404).json({ error: 'Not found' });
  res.json(org);
}));

module.exports = router;
