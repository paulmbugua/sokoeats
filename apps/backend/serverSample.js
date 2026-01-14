// apps/backend/server.js

import 'dotenv/config';
import pool from './config/db.js'; // loads .env variables
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import connectCloudinary from './config/cloudinary.js';
import './cronJobs/scheduler.js';
import paymentRoutes from './routes/paymentRoutes.js';
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

import {
  morganMiddleware,
  helmetMiddleware,
  limiter,
  errorLogger,
} from './middleware/middleware.js';

connectCloudinary();
// ─── Handle unhandled promise rejections ──────────────────────────────────────
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled rejection:', err);
});

const app = express();
const server = http.createServer(app);
const port = Number(process.env.PORT ?? 4000);
const isProduction = process.env.NODE_ENV === 'production';

// ─── 1) Environment vars ─────────────────────────────────────────────────────────
const BACKEND_URL = process.env.BACKEND_URL;
const WEB_BACKEND_URL = process.env.WEB_BACKEND_URL;
const PROD_BACKEND_URL = process.env.PROD_BACKEND_URL;

if (!BACKEND_URL || !WEB_BACKEND_URL || !PROD_BACKEND_URL) {
  console.error(
    '❌ Define BACKEND_URL, WEB_BACKEND_URL and PROD_BACKEND_URL in .env',
  );
  process.exit(1);
}

// ─── 2) Allowed origins ──────────────────────────────────────────────────────────
const productionOrigins = [
  PROD_BACKEND_URL,
  'https://admin.supatoto.co.ke',
  'https://supatoto.co.ke',
  'https://backend.novagptech.com',
  'https://DayBreak.netlify.app',
  'https://mytutorapp-production.up.railway.app',
  'https://client.supatoto.co.ke',
  'https://DayBreak.co.ke',
  'https://server.DayBreak.co.ke',
  'https://b743-37-211-202-186.ngrok-free.app',
];

const developmentOrigins = [
  BACKEND_URL,
  WEB_BACKEND_URL,
  'http://localhost:5174',
  'http://localhost:5173',
  'http://localhost:8081',
  'http://192.168.165.47:8081',
  'http://192.168.137.1:4000',
  'http://localhost:19006',
  'http://localhost:19000', // Expo web
  'https://b743-37-211-202-186.ngrok-free.app',
  'exp://192.168.68.47:19000', // Expo app
];

const allowedOrigins = isProduction ? productionOrigins : developmentOrigins;

// ─── 3) CORS for ALL endpoints & preflight OPTIONS ─────────────────────────────
app.use(
  cors({
    origin: (origin, callback) => {
      console.log('🛂 CORS origin check:', origin);
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      console.warn('🚫 Blocked by CORS:', origin);
      callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
    exposedHeaders: ['Content-Disposition'],
    credentials: true,
  }),
);
// ensure preflight is always handled
app.options('*', cors());

// ─── 4) Global middleware ───────────────────────────────────────────────────────
app.use(limiter);
app.use(helmetMiddleware);
app.use(morganMiddleware);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ─── 5) Socket.IO setup ─────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  },
  pingTimeout: 30000,
  pingInterval: 10000,
});

// expose io on req
app.use((req, _res, next) => {
  req.io = io;
  next();
});

// ─── 6) HTTPS redirect in production ─────────────────────────────────────────────
if (isProduction) {
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    if (req.secure) return next();
    res.redirect(`https://${req.headers.host}${req.url}`);
  });
}

// ─── 8) Mount REST routes ───────────────────────────────────────────────────────
app.use('/api/user', userRouter);
app.use('/api/profile', profileRoutes);
app.use('/api/profileActions', profileActionsRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api', webhookRoutes);
app.use('/api/tutor-session', tutorSessionRoutes);
app.use('/api/mpesa', mpesaUrlsRoutes);
app.use('/api/reviews', reviewRouter);
app.use('/api/profiles', certificationRoutes);
app.use('/api/certifications', certificationsAdminRoutes);
app.use('/api/classvault', classVaultRoutes);

app.get('/', (_req, res) => res.send('API Working'));

// =======================
// ✅ SOCKET.IO FOR MESSAGING (UPDATED FOR PROFILE IDs)
// =======================
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('joinRoom', (profileId) => {
    if (profileId) {
      socket.join(String(profileId));
      console.log(
        `Socket ${socket.id} joined room for profile ID: ${profileId}`,
      );
    } else {
      console.error('joinRoom: Missing or invalid profileId');
    }
  });

  socket.on('sendMessage', async (data, callback) => {
    const { recipientId, content, senderId, senderName } = data;
    console.log('sendMessage data:', {
      senderId,
      recipientId,
      content,
      senderName,
    });

    // Helper: Lookup profile using the profile's primary key
    const getProfileById = async (profileId) => {
      const result = await pool.query('SELECT id FROM profiles WHERE id = $1', [
        profileId,
      ]);
      return result.rows.length > 0 ? result.rows[0].id : null;
    };

    try {
      // Get profile IDs for sender and recipient (both are now profile IDs)
      const senderProfileId = await getProfileById(senderId);
      const recipientProfileId = await getProfileById(recipientId);

      if (!senderProfileId || !recipientProfileId) {
        console.error('Sender or recipient profile not found.');
        return (
          callback &&
          callback({
            status: 'error',
            message: 'Sender or recipient profile not found.',
          })
        );
      }

      // Check if conversation exists using profile IDs
      let conversation = await pool.query(
        `SELECT id FROM conversations 
         WHERE (sender_id = $1 AND recipient_id = $2)
            OR (sender_id = $2 AND recipient_id = $1)`,
        [senderProfileId, recipientProfileId],
      );

      let conversationId;
      if (conversation.rows.length === 0) {
        // Create a new conversation using profile IDs
        const newConversation = await pool.query(
          `INSERT INTO conversations (sender_id, recipient_id, unread_count) 
           VALUES ($1, $2, 1) RETURNING id`,
          [senderProfileId, recipientProfileId],
        );
        conversationId = newConversation.rows[0].id;
      } else {
        conversationId = conversation.rows[0].id;
        // Increment unread_count for the recipient
        await pool.query(
          `UPDATE conversations 
           SET unread_count = unread_count + 1, updated_at = NOW() 
           WHERE id = $1 AND recipient_id = $2`,
          [conversationId, recipientProfileId],
        );
      }

      // Insert the new message into the messages table using the conversation id and sender's profile id
      const message = await pool.query(
        `INSERT INTO messages (conversation_id, sender_id, content)
         VALUES ($1, $2, $3) RETURNING *`,
        [conversationId, senderProfileId, content],
      );

      // Emit real-time message events using the profile IDs as room identifiers
      io.to(String(recipientId)).emit('messageReceived', {
        recipientId: String(recipientProfileId),
        content,
        senderId: String(senderProfileId),
        senderName,
        unread: true, // recipient sees it as unread
      });

      io.to(String(senderId)).emit('messageReceived', {
        recipientId: String(recipientProfileId),
        content,
        senderId: String(senderProfileId),
        senderName: 'You',
        unread: false, // sender's copy is read
      });

      callback &&
        callback({ status: 'success', message: 'Message sent successfully' });
    } catch (error) {
      console.error('Error sending message:', error);
      callback &&
        callback({ status: 'error', message: 'Failed to send message' });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// ========================
// ERROR HANDLING
// ========================
app.use((req, res, next) => {
  console.log(`→ ${req.method} ${req.hostname}${req.url}`);
  next();
});

app.use(errorLogger);
app.use((req, res) => {
  res.status(404).json({ message: 'Route Not Found' });
});
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  if (res.headersSent) return next(err);
  res.status(500).json({ message: 'Internal Server Error' });
});

// ─── 11) Start server ──────────────────────────────────────────────────────────
server.listen(port, '0.0.0.0', () => {
  console.log(`
🚀 Server listening on port ${port}
  • LAN URL      : ${BACKEND_URL}
  • Loopback URL : ${WEB_BACKEND_URL}
`);
});
