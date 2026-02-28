// apps/backend/src/controllers/quotesController.js

import { db, ensureConversation, createId } from '../db/memoryDb.js';

function proSummary(p, q) {
  return {
    id: p.id,
    name: p.name,
    avatarUrl: p.avatarUrl || null,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    distanceKm: q.distanceKm,
    etaMinutes: q.etaMinutes,
    verifiedId: Boolean(p.verifiedId),
    backgroundChecked: Boolean(p.backgroundChecked),
    topRated: Boolean(p.topRated),
    jobsCompleted: p.jobsCompleted,
  };
}

export const listQuotesForJob = async (req, res) => {
  const jobId = String(req.params.id);
  const s = db();
  const job = s.jobs.find((j) => j.id === jobId && j.userId === req.user.id) || null;
  if (!job) return res.status(404).json({ message: 'Job not found' });

  const quotes = s.quotes
    .filter((q) => q.jobId === jobId && q.status === 'open')
    .map((q) => {
      const p = s.pros.find((x) => x.id === q.proId);
      return {
        id: q.id,
        jobId: q.jobId,
        pro: p ? proSummary(p, q) : { id: q.proId, name: 'Pro' },
        total: q.total,
        labor: q.labor,
        materials: q.materials,
        transport: q.transport,
        message: q.message || null,
        canArriveAt: q.canArriveAt || null,
        durationMin: q.durationMin || null,
        durationMax: q.durationMax || null,
        badge: q.badge || null,
      };
    });

  return res.status(200).json({ quotes });
};

export const getQuote = async (req, res) => {
  const quoteId = String(req.params.id);
  const s = db();
  const q = s.quotes.find((x) => x.id === quoteId) || null;
  if (!q) return res.status(404).json({ message: 'Quote not found' });

  const job = s.jobs.find((j) => j.id === q.jobId && j.userId === req.user.id) || null;
  if (!job) return res.status(404).json({ message: 'Quote not found' });

  const p = s.pros.find((x) => x.id === q.proId);
  const quote = {
    id: q.id,
    jobId: q.jobId,
    pro: p ? proSummary(p, q) : { id: q.proId, name: 'Pro' },
    total: q.total,
    labor: q.labor,
    materials: q.materials,
    transport: q.transport,
    message: q.message || null,
    canArriveAt: q.canArriveAt || null,
    durationMin: q.durationMin || null,
    durationMax: q.durationMax || null,
    badge: q.badge || null,
  };

  return res.status(200).json({ quote });
};

export const acceptQuote = async (req, res) => {
  const quoteId = String(req.params.id);
  const s = db();
  const q = s.quotes.find((x) => x.id === quoteId) || null;
  if (!q) return res.status(404).json({ message: 'Quote not found' });

  const job = s.jobs.find((j) => j.id === q.jobId && j.userId === req.user.id) || null;
  if (!job) return res.status(404).json({ message: 'Job not found' });

  // mark other quotes closed
  for (const other of s.quotes.filter((x) => x.jobId === job.id)) {
    other.status = other.id === q.id ? 'accepted' : 'closed';
  }

  const pro = s.pros.find((p) => p.id === q.proId) || null;
  job.status = 'booked';
  job.assignedPro = pro
    ? {
        id: pro.id,
        name: pro.name,
        avatarUrl: pro.avatarUrl || null,
        ratingAvg: pro.ratingAvg,
        ratingCount: pro.ratingCount,
        verifiedId: Boolean(pro.verifiedId),
        backgroundChecked: Boolean(pro.backgroundChecked),
        topRated: Boolean(pro.topRated),
        jobsCompleted: pro.jobsCompleted,
      }
    : null;

  const booking = {
    id: createId('booking'),
    jobId: job.id,
    quoteId: q.id,
    proId: q.proId,
    status: 'confirmed',
    createdAt: new Date().toISOString(),
  };
  s.bookings.unshift(booking);

  // open conversation
  if (pro) ensureConversation(req.user.id, pro.id);

  return res.status(200).json({ ok: true, booking, jobId: job.id, quoteId: q.id });
};

export const quoteMessage = async (req, res) => {
  const quoteId = String(req.params.id);
  const { body } = req.body || {};
  if (!body) return res.status(400).json({ message: 'body is required' });

  const s = db();
  const q = s.quotes.find((x) => x.id === quoteId) || null;
  if (!q) return res.status(404).json({ message: 'Quote not found' });
  const job = s.jobs.find((j) => j.id === q.jobId && j.userId === req.user.id) || null;
  if (!job) return res.status(404).json({ message: 'Quote not found' });

  const conv = ensureConversation(req.user.id, q.proId);
  const msg = {
    id: createId('msg'),
    conversationId: conv.id,
    sender: 'user',
    body: String(body),
    createdAt: new Date().toISOString(),
  };
  s.messages.push(msg);
  conv.lastMessage = msg.body;
  conv.lastAt = msg.createdAt;

  return res.status(201).json({ message: msg, conversationId: conv.id });
};
