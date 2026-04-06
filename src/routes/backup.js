const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');

const router = express.Router();
const prisma = new PrismaClient();

const BACKUP_DIR = path.join(__dirname, '../../backups');
const SCHEDULE_FILE = path.join(BACKUP_DIR, 'schedule.json');

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// ── Export all org data ───────────────────────────────────────────────────────
async function exportOrgData(orgId) {
  const [
    clients, quotes, appointments, kanbanCards, projects,
    services, team, certs, socialLinks, settings, messages,
  ] = await Promise.all([
    prisma.client.findMany({ where: { orgId } }),
    prisma.quote.findMany({ where: { orgId } }),
    prisma.appointment.findMany({ where: { orgId } }),
    prisma.kanbanCard.findMany({ where: { orgId } }),
    prisma.project.findMany({ where: { orgId } }),
    prisma.service.findMany({ where: { orgId } }),
    prisma.teamMember.findMany({ where: { orgId } }),
    prisma.certification.findMany({ where: { orgId } }),
    prisma.socialLink.findMany({ where: { orgId } }),
    prisma.siteSettings.findFirst({ where: { orgId } }),
    prisma.contactMessage.findMany({ where: { orgId } }),
  ]);
  return { clients, quotes, appointments, kanbanCards, projects, services, team, certs, socialLinks, settings, messages };
}

// ── Save backup to file ───────────────────────────────────────────────────────
async function saveBackupFile(orgId) {
  const data = await exportOrgData(orgId);
  const backup = { version: '1.0', exportedAt: new Date().toISOString(), orgId, data };
  const filename = `backup-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
  fs.writeFileSync(path.join(BACKUP_DIR, filename), JSON.stringify(backup, null, 2));
  // Keep last 20 backups
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
    .sort().reverse();
  files.slice(20).forEach(f => {
    try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch {}
  });
  return filename;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Immediate download export
router.get('/export', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const orgId = req.query.orgId;
  if (!orgId) return res.status(400).json({ error: 'orgId required' });
  const data = await exportOrgData(orgId);
  const backup = { version: '1.0', exportedAt: new Date().toISOString(), orgId, data };
  const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  res.setHeader('Content-Disposition', `attachment; filename="ais-backup-${ts}.json"`);
  res.json(backup);
}));

// Trigger save to server and keep file
router.post('/save', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const orgId = req.body.orgId || req.query.orgId;
  if (!orgId) return res.status(400).json({ error: 'orgId required' });
  const filename = await saveBackupFile(orgId);
  res.json({ ok: true, filename });
}));

// List saved backups + schedule
router.get('/list', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
    .sort().reverse()
    .map(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { filename: f, size: stat.size, createdAt: stat.mtime };
    });
  const schedule = fs.existsSync(SCHEDULE_FILE)
    ? JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'))
    : { enabled: false, frequency: 'daily' };
  res.json({ backups: files, schedule });
}));

// Download a specific backup
router.get('/download/:filename', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const filepath = path.join(BACKUP_DIR, req.params.filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Not found' });
  res.download(filepath);
}));

// Delete a backup
router.delete('/:filename', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const filepath = path.join(BACKUP_DIR, req.params.filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(filepath);
  res.json({ ok: true });
}));

// Configure schedule
router.put('/schedule', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { enabled, frequency, orgId } = req.body;
  const config = { enabled: !!enabled, frequency: frequency || 'daily', orgId };
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(config, null, 2));
  setupSchedule();
  res.json({ ok: true, config });
}));

// Restore from JSON body
router.post('/restore', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { backup } = req.body;
  if (!backup?.data || !backup?.orgId) return res.status(400).json({ error: 'Invalid backup format' });
  const { orgId, data } = backup;

  // Delete in dependency order
  await prisma.aiMessage.deleteMany({ where: { conversation: { orgId } } });
  await prisma.aiConversation.deleteMany({ where: { orgId } });
  await prisma.quote.deleteMany({ where: { orgId } });
  await prisma.appointment.deleteMany({ where: { orgId } });
  await prisma.kanbanCard.deleteMany({ where: { orgId } });
  await prisma.contactMessage.deleteMany({ where: { orgId } });
  await prisma.client.deleteMany({ where: { orgId } });
  await prisma.project.deleteMany({ where: { orgId } });
  await prisma.service.deleteMany({ where: { orgId } });
  await prisma.teamMember.deleteMany({ where: { orgId } });
  await prisma.certification.deleteMany({ where: { orgId } });
  await prisma.socialLink.deleteMany({ where: { orgId } });

  const strip = obj => { const { id, org, createdAt, updatedAt, ...rest } = obj; return rest; };

  // Restore settings
  if (data.settings) {
    const { id, org, createdAt, updatedAt, orgId: _oid, ...sd } = data.settings;
    await prisma.siteSettings.upsert({ where: { orgId }, update: sd, create: { orgId, ...sd } });
  }

  // Restore collections
  const modelMap = [
    ['project', data.projects], ['service', data.services],
    ['teamMember', data.team], ['certification', data.certs],
    ['socialLink', data.socialLinks], ['contactMessage', data.messages],
  ];
  for (const [model, items] of modelMap) {
    for (const item of (items || [])) {
      try { await prisma[model].create({ data: { ...strip(item), orgId } }); } catch {}
    }
  }

  // Clients first, then their quotes
  const clientIdMap = {};
  for (const c of (data.clients || [])) {
    try {
      const created = await prisma.client.create({ data: { ...strip(c), orgId } });
      clientIdMap[c.id] = created.id;
    } catch {}
  }
  for (const q of (data.quotes || [])) {
    const newClientId = clientIdMap[q.clientId];
    if (!newClientId) continue;
    try { await prisma.quote.create({ data: { ...strip(q), orgId, clientId: newClientId } }); } catch {}
  }

  for (const k of (data.kanbanCards || [])) {
    try { await prisma.kanbanCard.create({ data: { ...strip(k), orgId } }); } catch {}
  }

  res.json({ ok: true });
}));

// Bulk import clients from parsed CSV
router.post('/import/clients', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { orgId, clients } = req.body;
  if (!orgId || !Array.isArray(clients)) return res.status(400).json({ error: 'Invalid payload' });
  let created = 0, errors = 0;
  for (const c of clients) {
    try {
      await prisma.client.create({ data: { orgId, name: c.name || 'Unknown', email: c.email || null, phone: c.phone || null, company: c.company || null, notes: c.notes || null, status: c.status || 'prospect' } });
      created++;
    } catch { errors++; }
  }
  res.json({ ok: true, created, errors });
}));

// Bulk import kanban cards from parsed CSV
router.post('/import/kanban', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { orgId, cards } = req.body;
  if (!orgId || !Array.isArray(cards)) return res.status(400).json({ error: 'Invalid payload' });
  let created = 0, errors = 0;
  for (const c of cards) {
    try {
      await prisma.kanbanCard.create({ data: { orgId, title: c.title || 'Untitled', aircraft: c.aircraft || null, client: c.client || null, priority: ['low','medium','high'].includes(c.priority) ? c.priority : 'medium', column: c.column || 'inquiry', notes: c.notes || null, order: parseInt(c.order) || 0 } });
      created++;
    } catch { errors++; }
  }
  res.json({ ok: true, created, errors });
}));

// ── Scheduled backup ──────────────────────────────────────────────────────────
let cronJob = null;
function setupSchedule() {
  if (cronJob) { try { cronJob.stop(); } catch {} }
  if (!fs.existsSync(SCHEDULE_FILE)) return;
  const config = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
  if (!config.enabled || !config.orgId) return;
  const expressions = { hourly: '0 * * * *', daily: '0 3 * * *', weekly: '0 3 * * 1' };
  const expr = expressions[config.frequency] || expressions.daily;
  cronJob = cron.schedule(expr, async () => {
    try {
      const f = await saveBackupFile(config.orgId);
      console.log(`[backup] Auto-backup saved: ${f}`);
    } catch (err) { console.error('[backup] Auto-backup failed:', err.message); }
  });
}
setupSchedule();

module.exports = router;
