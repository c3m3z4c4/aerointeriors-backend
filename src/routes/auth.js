const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { PrismaClient } = require('@prisma/client');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await prisma.profile.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({ token, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
}));

router.post('/register', asyncHandler(async (req, res) => {
  const { email, password, name } = registerSchema.parse(req.body);
  const existing = await prisma.profile.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: 'Email already exists' });
  const password_hash = await bcrypt.hash(password, 12);
  const user = await prisma.profile.create({
    data: { email, password_hash, name, role: 'admin' },
  });
  res.status(201).json({ id: user.id, email: user.email, role: user.role, name: user.name });
}));

router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const user = await prisma.profile.findUnique({
    where: { id: req.user.id },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
}));

// Admin user management
router.get('/users', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const users = await prisma.profile.findMany({
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(users);
}));

router.post('/users', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { email, password, name, role } = registerSchema.parse(req.body);
  const existing = await prisma.profile.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: 'Email already exists' });
  const password_hash = await bcrypt.hash(password, 12);
  const user = await prisma.profile.create({
    data: { email, password_hash, name, role: role || 'admin' },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
  res.status(201).json(user);
}));

router.put('/users/:id/password', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { newPassword } = z.object({ newPassword: z.string().min(8) }).parse(req.body);
  const password_hash = await bcrypt.hash(newPassword, 12);
  await prisma.profile.update({ where: { id: req.params.id }, data: { password_hash } });
  res.json({ ok: true });
}));

router.delete('/users/:id', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  await prisma.profile.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

module.exports = router;
