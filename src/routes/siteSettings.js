const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Public: safe fields only (no API keys)
router.get('/', asyncHandler(async (req, res) => {
  const { orgId } = req.query;
  if (!orgId) return res.status(400).json({ error: 'orgId required' });
  let settings = await prisma.siteSettings.findUnique({ where: { orgId } });
  if (!settings) settings = await prisma.siteSettings.create({ data: { orgId } });
  const { openaiKey, anthropicKey, geminiKey, ...safe } = settings;
  res.json(safe);
}));

// Admin: full fields
router.get('/admin', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { orgId } = req.query;
  if (!orgId) return res.status(400).json({ error: 'orgId required' });
  let settings = await prisma.siteSettings.findUnique({ where: { orgId } });
  if (!settings) settings = await prisma.siteSettings.create({ data: { orgId } });
  res.json(settings);
}));

router.put('/', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { orgId, org, ...data } = req.body;
  if (!orgId) return res.status(400).json({ error: 'orgId required' });
  const settings = await prisma.siteSettings.upsert({
    where: { orgId },
    update: data,
    create: { orgId, ...data },
  });
  res.json(settings);
}));

module.exports = router;
