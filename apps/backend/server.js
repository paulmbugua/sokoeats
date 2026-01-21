// apps/backend/server.js
import 'dotenv/config';

// ────────────────────────────────────────────────────────────────────────────────
// Optional workers (top-level await is fine in ESM)
// ────────────────────────────────────────────────────────────────────────────────
if (
  process.env.NODE_ENV === 'production' &&
  process.env.START_PAYOUT_WORKER === 'true'
) {
  await import('./cronJobs/payoutWorker.js');
}

import express from 'express';
import cors from 'cors';
import http from 'http';
import bodyParser from 'body-parser';
import { Server } from 'socket.io';

import pool from './config/db.js';
import connectCloudinary from './config/cloudinary.js';

import { runWebhookTickSingleton as runWebhookTick } from './cronJobs/webhookWorkerSingleton.js';

// Middleware
import {
  morganMiddleware,
  helmetMiddleware,
  errorLogger,
  limiter, // global soft limiter
  userLimiter,
  reviewsLimiter,
  progressLimiter,
  aiKeyFn,
  certificatesLimiter,
  aiLimiterStrict,
  loginLimiterFactory,
} from './middleware/middleware.js';

import { inflightLimiter } from './middleware/inflightLimiter.js';
import { normalizeCourseSize } from './middleware/normalizeCourseSize.js';

// Controllers
import { ensureSeedSuperadmin } from './controllers/sessionController.js';
import { webhooks } from './controllers/paypalController.js';
import { handlePaystackWebhook } from './controllers/paystackController.js';

// Services
import { notifyNewMessage } from './services/pushService.js';

// Routes
import attemptsRoutes from './routes/attemptsRoutes.js';
import oerRoutes from './routes/oerRoutes.js';
import refundRoutes from './routes/refundRoutes.js';
import emailUnsubscribeRoutes from './routes/emailUnsubscribe.js';
import progressWatchRoutes from './routes/progressWatchRoutes.js';
import progressReadRoutes from './routes/progressReadRoutes.js';
import openstaxIngestRoutes from './routes/openstaxIngestRoutes.js';
import youtubeIngestRoutes from './routes/youtubeIngestRoutes.js';

import ttsAvatarRoutes from './routes/ttsAvatarRoutes.js';
import transcriptsRoutes from './routes/transcripts.js';
import adminRoutes from './routes/adminRoutes.js';
import authRoutes from './routes/authRoutes.js';
import adminStaffRoutes from './routes/adminStaffRoutes.js';
import institutionAuthRoutes from './routes/institutionAuthRoutes.js';
import aiRoutes from './routes/ai.js';
import orgRoutes from './routes/orgRoutes.js';
import cloudinaryRoutes from './routes/cloudinaryRoutes.js';
import earningsRoutes from './routes/earningsRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import aiCourseRoutes from './routes/aiCourseRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import userRouter from './routes/userRoute.js';
import profileActionsRoutes from './routes/profileActionsRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import tutorSessionRoutes from './routes/tutorSessionRoutes.js';
import classVaultRoutes from './routes/classVaultRoutes.js';
import mpesaUrlsRoutes from './routes/mpesaUrlsRoutes.js';
import reviewRouter from './routes/reviewRoutes.js';
import certificationRoutes from './routes/certificationRoutes.js';
import certificationsAdminRoutes from './routes/certificationsAdminRoutes.js';
import courseRoutes from './routes/courseRoutes.js';
import searchRoutes from './routes/searchRoutes.js';
import enrollmentRoutes from './routes/enrollmentRoutes.js';
import paypalRoutes from './routes/paypalRoutes.js';
import courseProgressRoutes from './routes/courseProgressRoutes.js';
import achievementsRoutes from './routes/achievementsRoutes.js';
import certificateRoutes from './routes/certificateRoutes.js';
import payoutRoutes from './routes/payoutRoutes.js';
import orgExamsRoutes from './routes/orgExamsRoutes.js';
import paystackRoutes from './routes/paystackRoutes.js';
import pushRoutes from './routes/pushRoutes.js';
import messagesRoutes from './routes/messagesRoutes.js';
import orgFeesRoutes from './routes/orgFeesRoutes.js';
import orgProToolsRoutes from './routes/orgProToolsRoutes.js';

// Scheduler (side-effect import)
import './cronJobs/scheduler.js';

// ────────────────────────────────────────────────────────────────────────────────
// Boot-time setup
// ────────────────────────────────────────────────────────────────────────────────
connectCloudinary();

// Webhook worker tick (dev-safe singleton)
if (process.env.START_WEBHOOK_WORKER === 'true') {
  console.log('▶️  Webhook worker: enabled (10s interval)');
  if (!globalThis.__WEBHOOK_TICK__) {
    globalThis.__WEBHOOK_TICK__ = setInterval(() => {
      runWebhookTick().catch((e) => console.error('[webhookTick]', e));
    }, 10_000);
  }
}

// ────────────────────────────────────────────────────────────────────────────────
// Process safety (do NOT call pool.end() here; handled in shutdown below)
// ────────────────────────────────────────────────────────────────────────────────
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled rejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception:', err);
});

// ────────────────────────────────────────────────────────────────────────────────
// App + Server
// ────────────────────────────────────────────────────────────────────────────────
const app = express();

// ✅ 1) Kill ETags so Express never emits 304 for APIs
app.set('etag', false);

// ✅ 2) Make ALL /api responses non-cacheable (prevents browser/proxy 304 behavior)
app.use('/api', (req, res, next) => {
  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate',
  );
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  // Optional: extra hardening for some proxies
  res.setHeader('Vary', 'Origin');

  next();
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Not allowed by CORS (socket): ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Anon-Id',
      'X-Program-Track',
      'X-Assignment-Id',
      'X-Org-Id',
    ],
    credentials: true,
  },
  pingTimeout: 30_000,
  pingInterval: 10_000,
});

const port = Number(process.env.PORT ?? 4000);
const isProduction = process.env.NODE_ENV === 'production';

const BUILD =
  process.env.RAILWAY_GIT_COMMIT_SHA ||
  process.env.GIT_SHA ||
  process.env.APP_BUILD ||
  'dev';

// ─── URLs ───────────────────────────────────────────────────────────────────────
const BACKEND_URL =
  process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 4000}`;
const WEB_BACKEND_URL = process.env.WEB_BACKEND_URL || 'http://localhost:5173';
const PROD_BACKEND_URL =
  process.env.PROD_BACKEND_URL || 'https://server.daybreaklearner.com';

// ─── Origins ────────────────────────────────────────────────────────────────────
const productionOrigins = [
  'https://daybreaklearner.com',
  'https://www.daybreaklearner.com',
  'https://daybreaklearner.netlify.app',
  'https://server.daybreaklearner.com',
  'https://admin.daybreaklearner.com',
];

const developmentOrigins = [
  BACKEND_URL,
  WEB_BACKEND_URL,
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://localhost:5173',
  'http://localhost:8081',
  'http://192.168.137.1:8081',
  'http://192.168.137.1:4000',
  'http://localhost:19006',
  'http://localhost:19000', // Expo web
  'https://b743-37-211-202-186.ngrok-free.app',
  'exp://192.168.68.47:19000', // Expo app
];

const allowedOrigins = isProduction ? productionOrigins : developmentOrigins;

// ────────────────────────────────────────────────────────────────────────────────
// Core middleware
// ────────────────────────────────────────────────────────────────────────────────
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('x-daybreak-build', BUILD);
  next();
});

// expose io on req
app.use((req, _res, next) => {
  req.io = io;
  next();
});

// Paystack request debug (optional)
app.use((req, _res, next) => {
  const url = req.originalUrl || req.url || '';
  if (url.includes('paystack')) {
    console.log('[PAYSTACK][REQ]', {
      method: req.method,
      url,
      host: req.get('host'),
      origin: req.get('origin'),
      proto: req.get('x-forwarded-proto'),
      secure: req.secure,
      ip: req.ip,
    });
  }
  next();
});

// CORS (single source of truth)
const corsOptions = {
  origin: (origin, callback) => {
    // If you want to reduce log spam, comment next line out:
    // console.log('🛂 CORS origin check:', origin);
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    console.warn('🚫 Blocked by CORS:', origin);
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-Client-Platform',
    'X-Platform',
    'Cache-Control',

    // AI flow extras
    'X-Program-Track',
    'X-Anon-Id',
    'X-Assignment-Id',
    'X-Org-Id',

    // optional
    'X-Quiz-Type',
    'X-Idempotency-Key',
  ],
  exposedHeaders: [
    'Content-Disposition',

    // Rate limit (IETF draft)
    'RateLimit-Limit',
    'RateLimit-Remaining',
    'RateLimit-Reset',

    // Legacy GitHub-style
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',

    // Retry advice
    'Retry-After',

    // extras
    'X-Program-Track',
    'X-Degraded',
  ],
  credentials: true,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(helmetMiddleware);
app.use(morganMiddleware);

// Webhooks (RAW) must be registered BEFORE JSON parser (for those routes only)
app.post(
  '/api/paypal/webhook',
  bodyParser.raw({ type: 'application/json' }),
  (req, _res, next) => {
    req.rawBody = req.body;
    next();
  },
  webhooks,
);

app.post(
  '/api/paystack/webhook',
  bodyParser.raw({ type: 'application/json', limit: '1mb' }),
  (req, _res, next) => {
    req.rawBody = req.body;
    next();
  },
  handlePaystackWebhook,
);

// Normal body parsing after webhooks
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Mild global limiter (keeps surprise fan-outs in check)
app.use(limiter);

// Login-only rate limiting
const loginLimiter = loginLimiterFactory({ windowMs: 15 * 60_000, limit: 5 });
app.post('/api/auth/admin-env-login', loginLimiter, (req, _res, next) => next());
app.post('/api/admin/login', loginLimiter, (req, _res, next) => next());
app.post('/api/auth/login', loginLimiter, (req, _res, next) => next());
app.post('/api/institutions/auth/login', loginLimiter, (req, _res, next) =>
  next(),
);

// ────────────────────────────────────────────────────────────────────────────────
// Health / debug
// ────────────────────────────────────────────────────────────────────────────────
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

app.get('/__build', (_req, res) => {
  res.json({
    build: BUILD,
    nodeEnv: process.env.NODE_ENV,
    time: new Date().toISOString(),
  });
});

// Paystack return endpoints
function redirectToDeepLink(req, res) {
  console.log('[PAYSTACK][RETURN] hit', {
    url: req.originalUrl,
    query: req.query,
  });

  const deep = new URL('daybreak://paystack/callback');
  for (const [k, v] of Object.entries(req.query || {})) {
    if (v == null) continue;
    deep.searchParams.set(k, String(v));
  }
  if (!deep.searchParams.get('reference') && deep.searchParams.get('trxref')) {
    deep.searchParams.set('reference', deep.searchParams.get('trxref'));
  }

  const loc = deep.toString();
  console.log('[PAYSTACK][RETURN] redirecting →', loc);

  res.setHeader('x-daybreak-paystack-return', '1');
  return res.redirect(302, loc);
}

app.get('/paystack/return', redirectToDeepLink);
app.get('/api/paystack/return', redirectToDeepLink);

// ────────────────────────────────────────────────────────────────────────────────
// HTTPS redirect in production
// ────────────────────────────────────────────────────────────────────────────────
if (isProduction) {
  app.use((req, res, next) => {
    const skipRedirect =
      req.path === '/healthz' ||
      req.path === '/api/paypal/webhook' ||
      req.path === '/api/paystack/webhook' ||
      req.path === '/api/fees/inbound/mpesa' ||
      req.path === '/api/fees/inbound/confirm' ||
      req.path === '/api/fees/inbound/validate' ||
      req.path === '/api/fees/inbound/bank' ||
      req.headers['x-railway-healthcheck'];

    if (skipRedirect) return next();
    if (req.secure) return next();
    return res.redirect(`https://${req.headers.host}${req.url}`);
  });
}

// ────────────────────────────────────────────────────────────────────────────────
// REST routes
// ────────────────────────────────────────────────────────────────────────────────

// User & profiles
app.use('/api/user', userLimiter, userRouter);
app.use('/api/profile', profileRoutes);
app.use('/api/profileActions', profileActionsRoutes);
app.use('/api/push', pushRoutes);
app.use('/api', messagesRoutes);

// Payments & webhooks
app.use('/api/payment', paymentRoutes);
app.use('/api', webhookRoutes);
app.use('/api/paypal', paypalRoutes);
app.use('/api/payouts', payoutRoutes);
app.use('/api/payment', refundRoutes);
app.use('/api/paystack', paystackRoutes);
app.use('/api', orgFeesRoutes);

// Tutor sessions / M-Pesa
app.use('/api/tutor-session', tutorSessionRoutes);
app.use('/api/mpesa', mpesaUrlsRoutes);

// Reviews & public content
app.use('/api/reviews', reviewsLimiter, reviewRouter);
app.use('/api/profiles', certificationRoutes);
app.use('/api/certifications', certificationsAdminRoutes);
app.use('/api/certificates', certificatesLimiter, certificateRoutes);

// ClassVault & media
app.use('/api/classvault', classVaultRoutes);
app.use('/api/cloudinary', cloudinaryRoutes);

// Courses & enrollments
app.use('/api/courses', courseRoutes);
app.use('/api', searchRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/earnings', earningsRoutes);
app.use('/api/achievements', achievementsRoutes);

// Auth & Admin
app.use('/api/institutions/auth', institutionAuthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminStaffRoutes);
app.use('/api/admin', adminRoutes);

// Organization
app.use('/api/orgs', orgRoutes);
app.use('/api/orgs', orgExamsRoutes);
app.use('/api/orgs/attempts', attemptsRoutes);
app.use('/api/org', orgProToolsRoutes);

// Course progress
app.use('/api/course-progress', progressLimiter, courseProgressRoutes);
app.use('/api', progressLimiter, progressWatchRoutes);
app.use('/api', progressLimiter, progressReadRoutes);

// OER + ingest
app.use('/api', oerRoutes);
app.use('/api', openstaxIngestRoutes);
app.use('/api', youtubeIngestRoutes);

// AI routes (ensure size normalization runs before AI handlers)
app.use('/api/ai', normalizeCourseSize);
app.use(
  '/api/ai',
  inflightLimiter({
    keyFn: aiKeyFn,
    max: Number(process.env.AI_MAX_INFLIGHT || 2),
  }),
);
app.use('/api/ai', aiLimiterStrict, aiRoutes);
app.use('/api/ai', aiLimiterStrict, aiCourseRoutes);

// TTS avatars (also protected)
app.use(
  '/api/ttsAvatar',
  inflightLimiter({
    keyFn: aiKeyFn,
    max: Number(process.env.AI_MAX_INFLIGHT || 2),
  }),
);
app.use('/api/ttsAvatar', aiLimiterStrict, ttsAvatarRoutes);

// Transcripts
app.use('/api/transcripts', transcriptsRoutes);

// Email unsubscribe
app.use('/api/email', emailUnsubscribeRoutes);

// Root ping
app.get('/', (_req, res) => res.send('API Working'));

// ────────────────────────────────────────────────────────────────────────────────
// Socket.IO: messaging
// ────────────────────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('joinRoom', (profileId) => {
    if (!profileId) {
      console.error('joinRoom: Missing or invalid profileId');
      return;
    }
    socket.join(String(profileId));
    console.log(`Socket ${socket.id} joined room for profile ID: ${profileId}`);
  });

  socket.on('sendMessage', async (data, callback) => {
    const { recipientId, content, senderId } = data;

    const getProfileById = async (profileId) => {
      const result = await pool.query('SELECT id FROM profiles WHERE id = $1', [
        profileId,
      ]);
      return result.rows.length > 0 ? result.rows[0].id : null;
    };

    try {
      const senderProfileId = await getProfileById(senderId);
      const recipientProfileId = await getProfileById(recipientId);

      if (!senderProfileId || !recipientProfileId) {
        return callback?.({
          status: 'error',
          message: 'Sender or recipient profile not found.',
        });
      }

      // Find or create conversation
      const conversation = await pool.query(
        `SELECT id FROM conversations
         WHERE (sender_id = $1 AND recipient_id = $2)
            OR (sender_id = $2 AND recipient_id = $1)`,
        [senderProfileId, recipientProfileId],
      );

      let conversationId;
      if (conversation.rows.length === 0) {
        const newConversation = await pool.query(
          `INSERT INTO conversations (sender_id, recipient_id, unread_count)
           VALUES ($1, $2, 1) RETURNING id`,
          [senderProfileId, recipientProfileId],
        );
        conversationId = newConversation.rows[0].id;
      } else {
        conversationId = conversation.rows[0].id;
        await pool.query(
          `UPDATE conversations
           SET unread_count = unread_count + 1, updated_at = NOW()
           WHERE id = $1 AND recipient_id = $2`,
          [conversationId, recipientProfileId],
        );
      }

      // Store message
      await pool.query(
        `INSERT INTO messages (conversation_id, sender_id, content)
         VALUES ($1, $2, $3)`,
        [conversationId, senderProfileId, content],
      );

      // Emit realtime events (rooms are profile ids)
      io.to(String(recipientProfileId)).emit('messageReceived', {
        recipientId: String(recipientProfileId),
        content,
        senderId: String(senderProfileId),
        senderName: null,
        unread: true,
        conversationId: String(conversationId),
      });

      io.to(String(senderProfileId)).emit('messageReceived', {
        recipientId: String(recipientProfileId),
        content,
        senderId: String(senderProfileId),
        senderName: 'You',
        unread: false,
        conversationId: String(conversationId),
      });

      // Push notification (don’t block socket response)
      const senderNameRes = await pool.query(
        'SELECT name FROM profiles WHERE id = $1',
        [senderProfileId],
      );
      const senderNameDb = senderNameRes.rows[0]?.name || 'New message';

      void notifyNewMessage({
        recipientProfileId,
        title: senderNameDb,
        body: String(content || 'You have a new message').slice(0, 140),
        data: { screen: 'Messages', params: { studentId: String(senderProfileId) } },
      }).catch((e) =>
        console.warn('[push] notifyNewMessage failed', e?.message || e),
      );

      callback?.({ status: 'success', message: 'Message sent successfully' });
    } catch (error) {
      console.error('Error sending message:', error);
      callback?.({ status: 'error', message: 'Failed to send message' });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// Error logging + 404 + 500
// ────────────────────────────────────────────────────────────────────────────────
app.use(errorLogger);

app.use((req, res) => {
  const url = req.originalUrl || req.url || '';
  if (url.includes('paystack')) {
    console.log('[PAYSTACK][404]', { method: req.method, url, host: req.get('host') });
  }
  res.status(404).json({ message: 'Route Not Found' });
});

app.use((err, _req, res, next) => {
  console.error('Error:', err.stack || err);
  if (res.headersSent) return next(err);
  res.status(500).json({ message: 'Internal Server Error' });
});

// Seed superadmin (non-blocking)
await ensureSeedSuperadmin().catch(() => {});

// ────────────────────────────────────────────────────────────────────────────────
// Start server + graceful shutdown (ONLY place that calls pool.end())
// ────────────────────────────────────────────────────────────────────────────────
server.listen(port, '0.0.0.0', () => {
  console.log(`
🚀 Server listening on port ${port}
  • LAN URL      : ${BACKEND_URL}
  • Loopback URL : ${WEB_BACKEND_URL}
  • Prod URL     : ${PROD_BACKEND_URL}
`);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[shutdown] ${signal} received — closing HTTP server...`);

  // Stop webhook interval if running
  if (globalThis.__WEBHOOK_TICK__) {
    clearInterval(globalThis.__WEBHOOK_TICK__);
    globalThis.__WEBHOOK_TICK__ = null;
  }

  // Stop accepting new connections
  server.close(async () => {
    try {
      console.log('[shutdown] closing PG pool...');
      await pool.end();
      console.log('🧹 PG pool closed');
    } catch (e) {
      console.warn('PG pool close error:', e?.message || e);
    } finally {
      process.exit(0);
    }
  });

  // Safety: force-exit if something hangs
  setTimeout(() => {
    console.warn('[shutdown] force exit (timeout)');
    process.exit(1);
  }, 15_000).unref();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGQUIT', () => shutdown('SIGQUIT'));
