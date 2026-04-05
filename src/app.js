require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const pino = require('pino');

const authRouter = require('./routes/auth');
const organizationsRouter = require('./routes/organizations');
const projectsRouter = require('./routes/projects');
const servicesRouter = require('./routes/services');
const teamRouter = require('./routes/team');
const certificationsRouter = require('./routes/certifications');
const contactRouter = require('./routes/contact');
const brochureRouter = require('./routes/brochure');
const socialLinksRouter = require('./routes/socialLinks');
const siteSettingsRouter = require('./routes/siteSettings');
const uploadRouter = require('./routes/upload');
const aiRouter = require('./routes/ai');
const crmRouter = require('./routes/crm');
const appointmentsRouter = require('./routes/appointments');
const { errorHandler } = require('./middleware/errorHandler');
const { publicLimiter, writeLimiter } = require('./middleware/rateLimit');
const { authenticate, requireAdmin } = require('./middleware/auth');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const app = express();
const PORT = process.env.PORT || 4000;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',');

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', writeLimiter, authRouter);
app.use('/api/organizations', publicLimiter, organizationsRouter);
app.use('/api/projects', publicLimiter, projectsRouter);
app.use('/api/services', publicLimiter, servicesRouter);
app.use('/api/team', publicLimiter, teamRouter);
app.use('/api/certifications', publicLimiter, certificationsRouter);
app.use('/api/contact', publicLimiter, contactRouter);
app.use('/api/brochure', publicLimiter, brochureRouter);
app.use('/api/social-links', publicLimiter, socialLinksRouter);
app.use('/api/site-settings', publicLimiter, siteSettingsRouter);
app.use('/api/upload', publicLimiter, uploadRouter);
app.use('/api/ai', publicLimiter, aiRouter);
app.use('/api/crm', authenticate, requireAdmin, crmRouter);
app.use('/api/appointments', authenticate, requireAdmin, appointmentsRouter);

app.use(errorHandler);

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'AeroInteriors backend running');
});

module.exports = app;
