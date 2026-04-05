const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { callAI } = require('../lib/aiProviders');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate, requireAdmin);

router.get('/status', asyncHandler(async (req, res) => {
  res.json({ status: 'available', providers: ['openai', 'anthropic', 'gemini'] });
}));

router.get('/config', asyncHandler(async (req, res) => {
  const { orgId } = req.query;
  if (!orgId) return res.status(400).json({ error: 'orgId required' });
  const settings = await prisma.siteSettings.findUnique({ where: { orgId } });
  if (!settings) return res.status(404).json({ error: 'Settings not found' });
  res.json({
    aiProvider: settings.aiProvider,
    aiModel: settings.aiModel,
    aiSystemPrompt: settings.aiSystemPrompt,
    hasOpenaiKey: !!settings.openaiKey,
    hasAnthropicKey: !!settings.anthropicKey,
    hasGeminiKey: !!settings.geminiKey,
  });
}));

router.put('/config', asyncHandler(async (req, res) => {
  const { orgId, aiProvider, aiModel, aiSystemPrompt, openaiKey, anthropicKey, geminiKey } = req.body;
  if (!orgId) return res.status(400).json({ error: 'orgId required' });
  await prisma.siteSettings.upsert({
    where: { orgId },
    update: { aiProvider, aiModel, aiSystemPrompt, openaiKey, anthropicKey, geminiKey },
    create: { orgId, aiProvider, aiModel, aiSystemPrompt, openaiKey, anthropicKey, geminiKey },
  });
  res.json({ success: true });
}));

router.get('/context', asyncHandler(async (req, res) => {
  const { orgId } = req.query;
  if (!orgId) return res.status(400).json({ error: 'orgId required' });
  const [services, messages, settings] = await Promise.all([
    prisma.service.findMany({ where: { orgId } }),
    prisma.contactMessage.findMany({ where: { orgId, isRead: false }, take: 10, orderBy: { createdAt: 'desc' } }),
    prisma.siteSettings.findUnique({ where: { orgId } }),
  ]);
  res.json({ services, recentInquiries: messages, companyName: settings?.companyName });
}));

router.get('/conversations', asyncHandler(async (req, res) => {
  const { orgId } = req.query;
  const conversations = await prisma.aiConversation.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    include: { messages: { take: 1, orderBy: { createdAt: 'desc' } } },
  });
  res.json(conversations);
}));

router.post('/conversations', asyncHandler(async (req, res) => {
  const { orgId, title } = req.body;
  const convo = await prisma.aiConversation.create({ data: { orgId, title } });
  res.status(201).json(convo);
}));

router.get('/conversations/:id', asyncHandler(async (req, res) => {
  const convo = await prisma.aiConversation.findUnique({
    where: { id: req.params.id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!convo) return res.status(404).json({ error: 'Not found' });
  res.json(convo);
}));

router.post('/conversations/:id/messages', asyncHandler(async (req, res) => {
  const { content, orgId } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });

  const convo = await prisma.aiConversation.findUnique({
    where: { id: req.params.id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!convo) return res.status(404).json({ error: 'Conversation not found' });

  await prisma.aiMessage.create({ data: { conversationId: convo.id, role: 'user', content } });

  const settings = await prisma.siteSettings.findUnique({ where: { orgId: convo.orgId } });
  if (!settings?.aiProvider) return res.status(400).json({ error: 'AI provider not configured' });

  const apiKey =
    settings.aiProvider === 'openai' ? settings.openaiKey :
    settings.aiProvider === 'anthropic' ? settings.anthropicKey :
    settings.geminiKey;

  if (!apiKey) return res.status(400).json({ error: 'API key not configured' });

  const allMessages = [...convo.messages, { role: 'user', content }];
  const systemPrompt = settings.aiSystemPrompt ||
    `You are a business assistant for ${settings.companyName}, specializing in aircraft interior construction and refurbishment. Help with proposals, client communications, and business operations.`;

  const reply = await callAI({ provider: settings.aiProvider, model: settings.aiModel, apiKey, systemPrompt, messages: allMessages });

  const aiMsg = await prisma.aiMessage.create({ data: { conversationId: convo.id, role: 'assistant', content: reply } });
  res.json(aiMsg);
}));

router.delete('/conversations/:id', asyncHandler(async (req, res) => {
  await prisma.aiConversation.delete({ where: { id: req.params.id } });
  res.status(204).send();
}));

module.exports = router;
