// apps/backend/src/controllers/jobsController.js

import { db, createId } from '../db/memoryDb.js';

function computeQuoteCount(s, jobId) {
  return s.quotes.filter((q) => q.jobId === jobId && q.status === 'open').length;
}

export const listJobs = async (req, res) => {
  const status = String(req.query.status || 'active');
  const s = db();
  const jobs = s.jobs
    .filter((j) => j.userId === req.user.id)
    .filter((j) => {
      if (!status) return true;
      // Map UI tabs → backend job status
      if (status === 'active') return ['active', 'quoted', 'in_progress', 'booked'].includes(j.status);
      if (status === 'completed') return j.status === 'completed';
      if (status === 'cancelled') return j.status === 'cancelled';
      return j.status === status;
    })
    .map((j) => ({ ...j, quoteCount: computeQuoteCount(s, j.id) }));

  return res.status(200).json({ jobs });
};

export const getJob = async (req, res) => {
  const id = String(req.params.id);
  const s = db();
  const job = s.jobs.find((j) => j.id === id && j.userId === req.user.id) || null;
  if (!job) return res.status(404).json({ message: 'Job not found' });
  return res.status(200).json({ job: { ...job, quoteCount: computeQuoteCount(s, job.id) } });
};

export const createJob = async (req, res) => {
  const body = req.body || {};
  const s = db();

  const required = ['categoryId', 'description', 'estate', 'city', 'scheduleType'];
  for (const k of required) {
    if (!body[k]) return res.status(400).json({ message: `${k} is required` });
  }

  const job = {
    id: createId('job'),
    userId: req.user.id,
    categoryId: String(body.categoryId),
    serviceId: body.serviceId ? String(body.serviceId) : null,
    description: String(body.description),
    photoUrls: Array.isArray(body.photoUrls) ? body.photoUrls.map(String) : [],
    estate: String(body.estate),
    city: String(body.city),
    scheduleType: String(body.scheduleType),
    scheduledFor: body.scheduledFor ? String(body.scheduledFor) : null,
    budgetMin: body.budgetMin != null ? Number(body.budgetMin) : null,
    budgetMax: body.budgetMax != null ? Number(body.budgetMax) : null,
    providerBringsMaterials: Boolean(body.providerBringsMaterials),
    notes: body.notes ? String(body.notes) : null,
    status: 'active',
    quoteCount: 0,
    assignedPro: null,
    createdAt: new Date().toISOString(),
  };

  s.jobs.unshift(job);

  // Optional: auto-generate demo quotes for new jobs
  // (so UI always has quotes to show during dev)
  const proIds = s.pros.map((p) => p.id);
  for (let i = 0; i < Math.min(3, proIds.length); i++) {
    const proId = proIds[i];
    s.quotes.unshift({
      id: createId('q'),
      jobId: job.id,
      proId,
      total: 3000 + i * 500,
      labor: 1800 + i * 300,
      materials: 900 + i * 150,
      transport: 300 + i * 50,
      etaMinutes: 10 + i * 10,
      distanceKm: 2.0 + i * 1.5,
      message: 'Available today. Professional service.',
      badge: i === 0 ? 'Best Value' : null,
      status: 'open',
      createdAt: new Date().toISOString(),
    });
  }

  return res.status(201).json({ job: { ...job, quoteCount: computeQuoteCount(s, job.id) } });
};

export const updateJob = async (req, res) => {
  const id = String(req.params.id);
  const s = db();
  const job = s.jobs.find((j) => j.id === id && j.userId === req.user.id) || null;
  if (!job) return res.status(404).json({ message: 'Job not found' });

  const body = req.body || {};
  const editable = [
    'description',
    'photoUrls',
    'estate',
    'city',
    'scheduleType',
    'scheduledFor',
    'budgetMin',
    'budgetMax',
    'providerBringsMaterials',
    'notes',
    'serviceId',
  ];
  for (const k of editable) {
    if (body[k] === undefined) continue;
    job[k] = body[k];
  }

  return res.status(200).json({ job: { ...job, quoteCount: computeQuoteCount(s, job.id) } });
};

export const addJobPhotos = async (req, res) => {
  const id = String(req.params.id);
  const { photoUrls } = req.body || {};
  const s = db();
  const job = s.jobs.find((j) => j.id === id && j.userId === req.user.id) || null;
  if (!job) return res.status(404).json({ message: 'Job not found' });
  if (!Array.isArray(photoUrls)) return res.status(400).json({ message: 'photoUrls must be an array' });

  job.photoUrls = [...(job.photoUrls || []), ...photoUrls.map(String)].slice(0, 10);
  return res.status(200).json({ job });
};

export const cancelJob = async (req, res) => {
  const id = String(req.params.id);
  const s = db();
  const job = s.jobs.find((j) => j.id === id && j.userId === req.user.id) || null;
  if (!job) return res.status(404).json({ message: 'Job not found' });

  job.status = 'cancelled';
  return res.status(200).json({ ok: true, job });
};
