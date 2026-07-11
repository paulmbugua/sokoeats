// apps/backend/server.js
import 'dotenv/config';

if (
  process.env.NODE_ENV === 'production' &&
  process.env.START_PAYOUT_WORKER === 'true'
) {
  await import('./cronJobs/payoutWorker.js');
}

import pool from './config/db.js'; // loads .env variables
import express from 'express';
import cors from 'cors';
import http from 'http';
import { runWebhookTickSingleton as runWebhookTick } from './cronJobs/webhookWorkerSingleton.js';

import { Server } from 'socket.io';
import bodyParser from 'body-parser';
import refundRoutes from './routes/refundRoutes.js';

// Routes

import adminRoutes from './routes/adminRoutes.js';
import authRoutes from './routes/authRoutes.js';
import catalogRoutes from './routes/catalogRoutes.js';
import jobsRoutes from './routes/jobsRoutes.js';
import quotesRoutes from './routes/quotesRoutes.js';
import messagesRoutes from './routes/messagesRoutes.js';
import './cronJobs/scheduler.js';
import paymentRoutes from './routes/paymentRoutes.js';

import profileRoutes from './routes/profileRoutes.js';
import userRouter from './routes/userRoute.js';

import webhookRoutes from './routes/webhookRoutes.js';

import mpesaUrlsRoutes from './routes/mpesaUrlsRoutes.js';

import { webhooks } from './controllers/paypalController.js';

import payoutRoutes from './routes/payoutRoutes.js';
import emailUnsubscribeRoutes from './routes/emailUnsubscribe.js';
import { inflightLimiter } from './middleware/inflightLimiter.js';

import paystackRoutes from './routes/paystackRoutes.js';
import { handlePaystackWebhook } from './controllers/paystackController.js';
import pushRoutes from './routes/pushRoutes.js';
import { notifyEvent } from './services/notificationEvents.js';
import { installCloudinaryResponseOptimizer } from './utils/optimizeMediaUrlsDeep.js';
import {
  canChatUnlocked,
  getRoles,
  resolveStudentTutor,
  syncConversationLock,
} from './services/chatGatingService.js';
import {
  setSocketServer,
  setAppPresence,
  setChatPresence,
  clearPresence,
} from './services/socketService.js';


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
  aiLimiterStrict, // ⇐ use the new per-user/per-bucket limiter
  loginLimiterFactory,
} from './middleware/middleware.js';



if (process.env.START_WEBHOOK_WORKER === 'true') {
  console.log('▶️  Webhook worker: enabled (10s interval)');
  // Avoid dup intervals during hot-reload
  if (!globalThis.__WEBHOOK_TICK__) {
    globalThis.__WEBHOOK_TICK__ = setInterval(() => {
      runWebhookTick().catch((e) => console.error('[webhookTick]', e));
    }, 10_000);
  }
}

// ────────────────────────────────────────────────────────────────────────────────
// Handle unhandled promise rejections
// ────────────────────────────────────────────────────────────────────────────────
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled rejection:', err);
});

const app = express();
const BUILD =
  process.env.RAILWAY_GIT_COMMIT_SHA ||
  process.env.GIT_SHA ||
  process.env.APP_BUILD ||
  'dev';

async function ensureSeedSuperadmin() {
  const email = String(process.env.SEED_SUPERADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.SEED_SUPERADMIN_PASSWORD || '').trim();
  if (!email || !password) return;

  const bcrypt = await import('bcryptjs');
  const hashed = await bcrypt.default.hash(password, 10);
  await pool.query(
    `INSERT INTO users (email, password, role, name)
     VALUES ($1, $2, 'superadmin', 'Super Admin')
     ON CONFLICT (email)
     DO UPDATE SET role = 'superadmin', password = EXCLUDED.password`,
    [email, hashed],
  );
}

app.use((req, res, next) => {
  res.setHeader('x-daybreak-build', BUILD);
  next();
});

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

const server = http.createServer(app);
const port = Number(process.env.PORT ?? 4005);
const isProduction = process.env.NODE_ENV === 'production';

// ─── 1) Environment vars ────────────────────────────────────────────────────────
const BACKEND_URL =
  process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 4005}`;
const WEB_BACKEND_URL = process.env.WEB_BACKEND_URL || 'http://localhost:5173';
const PROD_BACKEND_URL =
  process.env.PROD_BACKEND_URL || 'https://server.ekazi.co.ke';

// ─── 2) Allowed origins ────────────────────────────────────────────────────────
const WEB_BASE_URL = process.env.WEB_BASE_URL || process.env.WEB_BASE_URLS || '';
const APP_BASE_URL = process.env.APP_BASE_URL || '';
const productionOrigins = [
  PROD_BACKEND_URL,
  'https://ekazi.co.ke',
  'https://www.ekazi.co.ke',
  'https://server.ekazi.co.ke',
  'https://daybreaklearner.com',
  'https://www.daybreaklearner.com',
  'https://app.daybreaklearner.com',
  'https://daybreaklearner.netlify.app',
  'https://server.daybreaklearner.com',
  'https://admin.daybreaklearner.com',
  WEB_BASE_URL,
  APP_BASE_URL,
];

const developmentOrigins = [
  BACKEND_URL,
  WEB_BACKEND_URL,
  'http://localhost:3000',
  'http://10.42.11.111:3000',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://localhost:5173',
  'http://localhost:8081',
  'http://192.168.137.1:8081',
  'http://192.168.137.1:4005',
  'http://localhost:19006',
  'http://localhost:19000', // Expo web
  'https://b743-37-211-202-186.ngrok-free.app',
  'exp://192.168.68.47:19000', // Expo app
];

const allowedOrigins = isProduction ? productionOrigins : developmentOrigins;

// ─── 3) CORS for ALL endpoints & preflight OPTIONS (single source of truth) ────
const corsOptions = {
  origin: (origin, callback) => {
    console.log('🛂 CORS origin check:', origin);
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

    // ✅ AI flow extras
    'X-Program-Track',
    'X-Anon-Id',
    'X-Assignment-Id',
    'X-Org-Id',

    // (optional but handy)
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
     'X-Program-Track',
    'X-Degraded',
  ],
  credentials: true,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Same options for preflight

// ─── 7) Webhooks (raw body) must come BEFORE JSON parser for that route only ───
app.post(
  '/api/paypal/webhook',
  bodyParser.raw({ type: 'application/json' }),
  (req, _res, next) => {
    req.rawBody = req.body;
    next();
  },
  webhooks,
);
// ✅ Paystack webhook must be RAW (before express.json)
app.post(
  '/api/paystack/webhook',
  bodyParser.raw({ type: 'application/json', limit: '1mb' }),
  (req, _res, next) => {
    req.rawBody = req.body;
    next();
  },
  handlePaystackWebhook,
);

// ─── 4) Global middleware ───────────────────────────────────────────────────────
app.use(helmetMiddleware);
app.use(morganMiddleware);
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static('uploads', { maxAge: '1h', immutable: false }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(installCloudinaryResponseOptimizer());
app.set('trust proxy', 1);

// 🔒 Mild global soft limiter (keeps surprise fan-outs in check)
app.use(limiter);

// 🔐 Login-only rate limiting (5 attempts / 15m, skip success)
const loginLimiter = loginLimiterFactory({ windowMs: 15 * 60_000, limit: 5 });

// Middleware-only routes that pass through to actual routers:
app.post('/api/auth/admin-env-login', loginLimiter, (req, _res, next) =>
  next(),
);
app.post('/api/admin/login', loginLimiter, (req, _res, next) => next());
app.post('/api/auth/login', loginLimiter, (req, _res, next) => next());
app.post('/api/institutions/auth/login', loginLimiter, (req, _res, next) =>
  next(),
);

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

app.get('/__build', (_req, res) => {
  res.json({
    build: BUILD,
    nodeEnv: process.env.NODE_ENV,
    time: new Date().toISOString(),
  });
});

// ✅ Paystack return endpoints (support both /paystack/return and /api/paystack/return)
function redirectToDeepLink(req, res) {
  console.log('[PAYSTACK][RETURN] hit', {
    url: req.originalUrl,
    query: req.query,
  });

  const deep = new URL('ekazi://paystack/callback');

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

// ─── 5) Socket.IO setup ─────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin))
        return callback(null, true);
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
  pingTimeout: 30000,
  pingInterval: 10000,
});

setSocketServer(io);

// expose io on req
app.use((req, _res, next) => {
  req.io = io;
  next();
});

// ─── 6) HTTPS redirect in production ────────────────────────────────────────────
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

    if (skipRedirect) {
      return next();
    }
    if (req.secure) return next();
    return res.redirect(`https://${req.headers.host}${req.url}`);
  });
}

// ─── 8) Mount REST routes (with per-route limiters where needed) ───────────────
// User & profiles
app.use('/api/user', userLimiter, userRouter);
app.use('/api/profile', profileRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api/push', pushRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', catalogRoutes);
app.use('/api', jobsRoutes);
app.use('/api', quotesRoutes);
app.use('/api', messagesRoutes);

// Payments & webhooks
app.use('/api/payment', paymentRoutes);
app.use('/api', webhookRoutes);

app.use('/api/payouts', payoutRoutes);
app.use('/api/payment', refundRoutes);
app.use('/api/paystack', paystackRoutes);


// Tutor sessions / M-Pesa

app.use('/api/mpesa', mpesaUrlsRoutes);

// Reviews, public content and legacy AI/TTS routes are intentionally not mounted in the Ekazi mobile API shell.
app.use('/api/email', emailUnsubscribeRoutes);

// Root ping
app.get('/', (_req, res) => res.send('API Working'));

// =======================
// ✅ SOCKET.IO FOR MESSAGING (UPDATED FOR PROFILE IDs)
// =======================
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('joinRoom', (profileId) => {
    if (profileId) {
      socket.join(String(profileId));
      socket.data.profileId = String(profileId);
      console.log(
        `Socket ${socket.id} joined room for profile ID: ${profileId}`,
      );
    } else {
      console.error('joinRoom: Missing or invalid profileId');
    }
  });

  socket.on('presence:app', (payload) => {
    const profileId = payload?.profileId;
    if (!profileId) return;
    socket.data.profileId = String(profileId);
    setAppPresence(profileId, Boolean(payload?.active));
  });

  socket.on('presence:chat', (payload) => {
    const profileId = payload?.profileId;
    if (!profileId) return;
    socket.data.profileId = String(profileId);
    setChatPresence(profileId, payload?.conversationId, Boolean(payload?.active));
  });

  const getProfileById = async (profileId) => {
    const result = await pool.query('SELECT id FROM profiles WHERE id = $1', [
      profileId,
    ]);
    return result.rows.length > 0 ? result.rows[0].id : null;
  };

  socket.on('sendMessage', async (data, callback) => {
    const { recipientId, content, senderId } = data;

    try {
      const senderProfileId = await getProfileById(senderId);
      const recipientProfileId = await getProfileById(recipientId);

      if (!senderProfileId || !recipientProfileId) {
        return callback?.({
          status: 'error',
          message: 'Sender or recipient profile not found.',
        });
      }

      const rolesMap = await getRoles(senderProfileId, recipientProfileId);
      const { studentProfileId, tutorProfileId } = resolveStudentTutor(
        senderProfileId,
        recipientProfileId,
        rolesMap,
        recipientProfileId,
      );
      const senderIsStudent =
        String(senderProfileId) === String(studentProfileId);
      const unlocked = await canChatUnlocked(
        studentProfileId,
        tutorProfileId,
      );
      if (!unlocked && senderIsStudent) {
        return callback?.({
          status: 'error',
          code: 'CHAT_LOCKED',
          message: 'Book a session to message this tutor.',
        });
      }

      // Find or create conversation
      let conversation = await pool.query(
        `SELECT id FROM conversations
       WHERE (sender_id = $1 AND recipient_id = $2)
          OR (sender_id = $2 AND recipient_id = $1)`,
        [senderProfileId, recipientProfileId],
      );

      let conversationId;
      if (conversation.rows.length === 0) {
        const newConversation = await pool.query(
          `INSERT INTO conversations (sender_id, recipient_id, unread_count, chat_status)
         VALUES ($1, $2, 1, $3) RETURNING id`,
          [senderProfileId, recipientProfileId, unlocked ? 'unlocked' : 'locked'],
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

      await syncConversationLock(
        conversationId,
        studentProfileId,
        tutorProfileId,
      );

      // Store message
      await pool.query(
        `INSERT INTO messages (conversation_id, sender_id, content)
       VALUES ($1, $2, $3)`,
        [conversationId, senderProfileId, content],
      );

      // Emit realtime events (socket rooms are profile ids)
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

      // ✅ PUSH NOTIFICATION (must be inside this async handler)
      // Fetch sender name from DB (don’t trust client payload)
      const senderNameRes = await pool.query(
        'SELECT name FROM profiles WHERE id = $1',
        [senderProfileId],
      );
      const senderNameDb = senderNameRes.rows[0]?.name || 'New message';

      // Don’t block socket response if Expo is slow
      void notifyEvent(
        'CHAT_MESSAGE',
        String(recipientProfileId),
        {
          senderName: senderNameDb,
          preview: String(content || 'You have a new message').slice(0, 140),
          senderProfileId,
          recipientProfileId,
          conversationId,
        },
        { recipientProfileId: String(recipientProfileId) },
      ).catch((e) =>
        console.warn('[push] chat notify failed', e?.message || e),
      );

      callback?.({ status: 'success', message: 'Message sent successfully' });
    } catch (error) {
      console.error('Error sending message:', error);
      callback?.({ status: 'error', message: 'Failed to send message' });
    }
  });

  socket.on('prebookingInquiry', async (data, callback) => {
    const { tutorProfileId, topic, level, availability, note, senderId } = data || {};

    if (!tutorProfileId || !topic || !level || !availability || !senderId) {
      return callback?.({
        status: 'error',
        message: 'Tutor, topic, level, availability, and sender are required.',
      });
    }

    try {
      const senderProfileId = await getProfileById(senderId);
      const recipientProfileId = await getProfileById(tutorProfileId);

      if (!senderProfileId || !recipientProfileId) {
        return callback?.({
          status: 'error',
          message: 'Sender or recipient profile not found.',
        });
      }

      const rolesMap = await getRoles(senderProfileId, recipientProfileId);
      const senderRole = rolesMap[String(senderProfileId)]?.role ?? null;
      if (senderRole && senderRole !== 'student') {
        return callback?.({
          status: 'error',
          message: 'Only students can send prebooking inquiries.',
        });
      }

      const { studentProfileId, tutorProfileId: resolvedTutorProfileId } =
        resolveStudentTutor(
          senderProfileId,
          recipientProfileId,
          rolesMap,
          recipientProfileId,
        );

      const unlocked = await canChatUnlocked(
        studentProfileId,
        resolvedTutorProfileId,
      );
      if (unlocked) {
        return callback?.({
          status: 'error',
          message: 'Already unlocked.',
        });
      }

      const conversationResult = await pool.query(
        `SELECT id, prebooking_used FROM conversations
         WHERE (sender_id = $1 AND recipient_id = $2)
            OR (sender_id = $2 AND recipient_id = $1)
         LIMIT 1`,
        [senderProfileId, resolvedTutorProfileId],
      );

      let conversationId = conversationResult.rows[0]?.id;
      const prebookingUsed = conversationResult.rows[0]?.prebooking_used;

      if (prebookingUsed) {
        return callback?.({
          status: 'error',
          message: 'Inquiry already used.',
        });
      }

      if (!conversationId) {
        const newConversation = await pool.query(
          `INSERT INTO conversations 
            (sender_id, recipient_id, unread_count, chat_status, prebooking_used, prebooking_at)
           VALUES ($1, $2, 1, 'locked', true, NOW())
           RETURNING id`,
          [senderProfileId, resolvedTutorProfileId],
        );
        conversationId = newConversation.rows[0].id;
      } else {
        await pool.query(
          `UPDATE conversations
           SET prebooking_used = true,
               prebooking_at = NOW(),
               chat_status = 'locked',
               unread_count = unread_count + 1,
               updated_at = NOW()
           WHERE id = $1`,
          [conversationId],
        );
      }

      const contentParts = [
        `Inquiry: ${topic}`,
        `Level: ${level}`,
        `Availability: ${availability}`,
      ];
      if (note) contentParts.push(`Note: ${note}`);
      const content = contentParts.join(' | ');

      await pool.query(
        `INSERT INTO messages (conversation_id, sender_id, content, meta)
         VALUES ($1, $2, $3, $4)`,
        [
          conversationId,
          senderProfileId,
          content,
          {
            type: 'prebooking_inquiry',
            topic,
            level,
            availability,
            note: note ?? '',
          },
        ],
      );

      io.to(String(resolvedTutorProfileId)).emit('messageReceived', {
        recipientId: String(resolvedTutorProfileId),
        content,
        senderId: String(senderProfileId),
        senderName: null,
        unread: true,
        conversationId: String(conversationId),
        meta: {
          type: 'prebooking_inquiry',
          topic,
          level,
          availability,
          note: note ?? '',
        },
      });

      io.to(String(senderProfileId)).emit('messageReceived', {
        recipientId: String(resolvedTutorProfileId),
        content,
        senderId: String(senderProfileId),
        senderName: 'You',
        unread: false,
        conversationId: String(conversationId),
        meta: {
          type: 'prebooking_inquiry',
          topic,
          level,
          availability,
          note: note ?? '',
        },
      });

      const senderNameRes = await pool.query(
        'SELECT name FROM profiles WHERE id = $1',
        [senderProfileId],
      );
      const senderNameDb = senderNameRes.rows[0]?.name || 'Student';

      void notifyEvent(
        'INQUIRY_SENT',
        String(resolvedTutorProfileId),
        {
          studentProfileId: senderProfileId,
          studentName: senderNameDb,
          topic,
          level,
          conversationId,
        },
        { recipientProfileId: String(resolvedTutorProfileId) },
      ).catch((e) =>
        console.warn('[push] inquiry notify failed', e?.message || e),
      );

      callback?.({ status: 'success', conversationId });
    } catch (error) {
      console.error('Error sending prebooking inquiry:', error);
      callback?.({
        status: 'error',
        message: 'Failed to send prebooking inquiry',
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (socket.data?.profileId) {
      clearPresence(socket.data.profileId);
    }
  });
});

app.use(errorLogger);

// 404 handler
// 404 handler (must be AFTER all routes, BEFORE 500 handler)
app.use((req, res) => {
  const url = req.originalUrl || req.url || '';
  if (url.includes('paystack')) {
    console.log('[PAYSTACK][404]', {
      method: req.method,
      url,
      host: req.get('host'),
    });
  }
  res.status(404).json({ message: 'Route Not Found' });
});

// 500 handler
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  if (res.headersSent) return next(err);
  res.status(500).json({ message: 'Internal Server Error' });
});

// Seed superadmin (non-blocking)
await ensureSeedSuperadmin().catch(() => {});

// ─── 11) Start server ──────────────────────────────────────────────────────────
server.listen(port, '0.0.0.0', () => {
  console.log(`
🚀 Server listening on port ${port}
  • LAN URL      : ${BACKEND_URL}
  • Loopback URL : ${WEB_BACKEND_URL}
  • Prod URL     : ${PROD_BACKEND_URL}
`);
});
