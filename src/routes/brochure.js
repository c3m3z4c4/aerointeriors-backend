const express = require('express');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireAdmin } = require('../middleware/auth');
const upload = require('../lib/upload');

const router = express.Router();
const prisma = new PrismaClient();

router.get('/files', asyncHandler(async (req, res) => {
  const { orgId } = req.query;
  const files = await prisma.brochureFile.findMany({
    where: orgId ? { orgId } : {},
    orderBy: { uploadedAt: 'desc' },
  });
  const totalDownloads = orgId
    ? await prisma.brochureDownload.count({ where: { orgId } })
    : 0;
  res.json({ files, totalDownloads });
}));

router.post('/upload', authenticate, requireAdmin, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { orgId } = req.body;
  const brochure = await prisma.brochureFile.create({
    data: { orgId, filename: req.file.originalname, path: req.file.filename, isCurrent: false },
  });
  res.status(201).json(brochure);
}));

router.post('/set-current/:id', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const brochure = await prisma.brochureFile.findUnique({ where: { id: req.params.id } });
  if (!brochure) return res.status(404).json({ error: 'Not found' });
  await prisma.brochureFile.updateMany({ where: { orgId: brochure.orgId }, data: { isCurrent: false } });
  const updated = await prisma.brochureFile.update({ where: { id: req.params.id }, data: { isCurrent: true } });
  res.json(updated);
}));

router.get('/download/:filename', asyncHandler(async (req, res) => {
  const filePath = path.join(__dirname, '../../uploads', req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  const brochure = await prisma.brochureFile.findFirst({ where: { path: req.params.filename } });
  if (brochure) {
    await prisma.brochureDownload.create({
      data: { orgId: brochure.orgId, ip: req.ip, userAgent: req.headers['user-agent'] },
    });
  }
  res.download(filePath);
}));

router.delete('/files/:id', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const brochure = await prisma.brochureFile.findUnique({ where: { id: req.params.id } });
  if (!brochure) return res.status(404).json({ error: 'Not found' });
  const filePath = path.join(__dirname, '../../uploads', brochure.path);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  await prisma.brochureFile.delete({ where: { id: req.params.id } });
  res.status(204).send();
}));

router.get('/metrics', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { orgId } = req.query;
  const totalDownloads = await prisma.brochureDownload.count({ where: orgId ? { orgId } : {} });
  res.json({ totalDownloads });
}));

module.exports = router;
