import './config/env.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import catalogRoutes from './routes/catalogRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import ticketRoutes from './routes/ticketRoutes.js';
import vendorRoutes from './routes/vendorRoutes.js';
import riderRoutes from './routes/riderRoutes.js';
import supportRoutes from './routes/supportRoutes.js';
import mapRoutes from './routes/mapRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import authRoutes from './routes/authRoutes.js';
import versionRoutes from './routes/versionRoutes.js';
import financeRoutes from './routes/financeRoutes.js';
import coverageRoutes from './routes/coverageRoutes.js';
import customerCareRoutes from './routes/customerCareRoutes.js';
import { startSettlementWorker } from './services/settlementWorker.js';
import pool from './config/db.js';
import { closeHttpServer, listenWithRetry } from './services/httpLifecycle.js';
import { startEmailWorker } from './services/emailService.js';

const app = express();
const port = Number(process.env.PORT || 4000);
const localOrigins = process.env.NODE_ENV === 'production'
  ? []
  : ['localhost', '127.0.0.1'].flatMap((host) =>
      [3000, 5173, 5174, 5175, 5176, 5177].map((localPort) => `http://${host}:${localPort}`),
    );
const configuredOrigins = (process.env.CORS_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean);
const origins = new Set([...localOrigins, ...configuredOrigins]);
app.use(helmet());
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || origins.has(origin)),
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '2mb', verify: (req, _res, buffer) => { req.rawBody = Buffer.from(buffer); } }));
app.get('/healthz', (_req, res) => res.json({ ok: true, app: 'sokoeats' }));
app.use('/api', authRoutes);
app.use('/api', customerCareRoutes);
app.use('/api', catalogRoutes);
app.use('/api', orderRoutes);
app.use('/api', paymentRoutes);
app.use('/api', financeRoutes);
app.use('/api', coverageRoutes);
app.use('/api', ticketRoutes);
app.use('/api', vendorRoutes);
app.use('/api', riderRoutes);
app.use('/api', supportRoutes);
app.use('/api', mapRoutes);
app.use('/api', versionRoutes);
app.use('/api/admin', adminRoutes);
app.use((req, res) => res.status(404).json({ message: `No Sokoeats route for ${req.method} ${req.path}` }));
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  else console.warn('[SokoEats][HTTP] request-rejected', { method: req.method, path: req.path, status, message: err.message });
  res.status(status).json({ message: err.message || 'Internal Server Error' });
});
try {
  const server = await listenWithRetry(app, { port });
  console.info(`Sokoeats API listening on :${port} (PID ${process.pid})`);
  const stopWorker = startSettlementWorker();
  const stopEmailWorker = startEmailWorker();
  let stopping = false;
  const shutdown = async signal => {
    if (stopping) return;
    stopping = true;
    console.info('[SokoEats][Server] shutdown', { signal, pid: process.pid });
    const deadline = setTimeout(() => {
      console.error('[SokoEats][Server] shutdown-timeout');
      process.exit(1);
    }, 15000);
    deadline.unref();
    try {
      await Promise.all([closeHttpServer(server), stopWorker(), stopEmailWorker()]);
      await pool.end();
      clearTimeout(deadline);
      process.exit(0);
    } catch (error) {
      console.error('[SokoEats][Server] shutdown-failed', { message: error.message });
      process.exit(1);
    }
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGUSR2']) process.on(signal, () => { void shutdown(signal); });
  server.on('error', error => {
    console.error('[SokoEats][Server] runtime-error', { code: error.code, message: error.message });
    void shutdown('server-error');
  });
} catch (error) {
  console.error('[SokoEats][Server] startup-failed', { code: error.code, message: error.message });
  await pool.end();
  process.exitCode = 1;
}
