// apps/backend/validators/orgEngagementValidators.js
import Joi from 'joi';

const uuidLike = Joi.string().min(1);

const attendanceStatus = Joi.string().valid('present', 'absent', 'late', 'excused');

const classLabel = Joi.string().trim().max(120).allow(null, '').empty(['', null]).default(null);

const memberIdAny = Joi.alternatives()
  .try(
    Joi.string().pattern(/^\d+$/), // numeric users.id
    Joi.string().guid({ version: ['uuidv4', 'uuidv5'] }) // allow uuid too
  )
  .required();

/* ─────────────────────────────────────────────────────────
 * Attendance
 * ───────────────────────────────────────────────────────── */

export const attendanceSessionSchema = Joi.object({
  session_date: Joi.date().required(),
  class_label: Joi.string().allow('', null),
  period_label: Joi.string().allow('', null),
});

export const attendanceSessionUpdateSchema = attendanceSessionSchema.fork(
  ['session_date', 'class_label', 'period_label'],
  (schema) => schema.optional()
);

export const attendanceEntrySchema = Joi.object({
  session_id: Joi.number().integer().positive().optional(),
  entries: Joi.array()
    .items(
      Joi.object({
        learner_id: memberIdAny.required(), // ✅ accept uuid or numeric
        status: attendanceStatus.required(),
        note: Joi.string().allow('', null),
      })
    )
    .min(1)
    .required(),
});

export const attendanceQuerySchema = Joi.object({
  start: Joi.date().allow(null),
  end: Joi.date().allow(null),
  class_label: Joi.string().allow('', null),
  limit: Joi.number().integer().min(1).max(500).default(100),
  offset: Joi.number().integer().min(0).default(0),
  format: Joi.string().valid('csv').optional(),
});

/* ─────────────────────────────────────────────────────────
 * Announcements
 * ───────────────────────────────────────────────────────── */

export const announcementSchema = Joi.object({
  audience: Joi.string().default('all'),
  title: Joi.string().min(2).required(),
  body: Joi.string().min(1).required(),
  pinned: Joi.boolean().default(false),
  start_at: Joi.date().allow(null),
  end_at: Joi.date().allow(null),
  category: Joi.string().default('general'),
  class_label: classLabel,
  meeting_at: Joi.date().allow(null),
  meeting_location: Joi.string().allow('', null),
  meeting_url: Joi.string().uri().allow('', null),
  agenda_md: Joi.string().allow('', null),
  metadata: Joi.object().unknown(true).default({}),
});

export const announcementUpdateSchema = announcementSchema.fork(
  [
    'title',
    'body',
    'audience',
    'pinned',
    'start_at',
    'end_at',
    'category',
    'class_label',
    'meeting_at',
    'meeting_location',
    'meeting_url',
    'agenda_md',
    'metadata',
  ],
  (schema) => schema.optional()
);

export const announcementQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(200).default(100),
  offset: Joi.number().integer().min(0).default(0),
  class_label: classLabel,
});

/* ─────────────────────────────────────────────────────────
 * Sports events (UPDATED per your spec)
 * ───────────────────────────────────────────────────────── */

const isoDate = Joi.date().iso();
const int0 = Joi.number().integer().min(0);

const audience = Joi.string()
  .trim()
  .lowercase()
  .valid('all', 'learners', 'instructors', 'parents')
  .default('all');

const status = Joi.string()
  .trim()
  .lowercase()
  .valid('scheduled', 'completed', 'cancelled')
  .default('scheduled');

const kind = Joi.string()
  .trim()
  .lowercase()
  .valid('fixture', 'practice', 'tournament', 'other')
  .default('fixture');

export const sportsEventSchema = Joi.object({
  title: Joi.string().trim().min(1).required(),
  description: Joi.string().allow('', null).default(null),

  kind,
  team_label: Joi.string().allow('', null).default(null),
  opponent: Joi.string().allow('', null).default(null),

  event_at: isoDate.allow(null).default(null),
  end_at: isoDate.allow(null).default(null),

  location: Joi.string().allow('', null).default(null),
  audience,
  status,

  score_home: int0.allow(null).default(null),
  score_away: int0.allow(null).default(null),

  metadata: Joi.object().unknown(true).default({}),
});

export const sportsEventUpdateSchema = Joi.object({
  title: Joi.string().trim().min(1),
  description: Joi.string().allow('', null),

  kind,
  team_label: Joi.string().allow('', null),
  opponent: Joi.string().allow('', null),

  event_at: isoDate.allow(null),
  end_at: isoDate.allow(null),

  location: Joi.string().allow('', null),
  audience,
  status,

  score_home: int0.allow(null),
  score_away: int0.allow(null),

  metadata: Joi.object().unknown(true),
});

export const sportsQuerySchema = Joi.object({
  start: isoDate.allow(null).default(null),
  end: isoDate.allow(null).default(null),

  status: Joi.string().trim().lowercase().allow('', null).default(null),
  kind: Joi.string().trim().lowercase().allow('', null).default(null),
  team_label: Joi.string().trim().allow('', null).default(null),
  audience: Joi.string().trim().lowercase().allow('', null).default(null),

  q: Joi.string().trim().allow('', null).default(null),
  format: Joi.string().trim().lowercase().valid('json', 'csv').default('json'),

  limit: Joi.number().integer().min(1).max(500).default(200),
  offset: Joi.number().integer().min(0).default(0),
});

/* ─────────────────────────────────────────────────────────
 * Clubs
 * ───────────────────────────────────────────────────────── */

export const clubSchema = Joi.object({
  name: Joi.string().min(2).required(),
  description: Joi.string().allow('', null),
  advisor_id: uuidLike.allow(null),
  meeting_schedule: Joi.string().allow('', null),
  is_active: Joi.boolean().default(true),
});

export const clubUpdateSchema = clubSchema.fork(
  ['name', 'description', 'advisor_id', 'meeting_schedule', 'is_active'],
  (schema) => schema.optional()
);

export const membershipParamsSchema = Joi.object({
  member_id: memberIdAny,
});

/* ─────────────────────────────────────────────────────────
 * Messaging
 * ───────────────────────────────────────────────────────── */

export const messageSendSchema = Joi.object({
  subject: Joi.string().allow('', null),
  body: Joi.string().allow('', null),
  template_key: Joi.string().allow('', null),
  payload: Joi.object().unknown(true).default({}),
  recipients: Joi.array()
    .items(
      Joi.object({
        user_id: uuidLike.allow(null),
        email: Joi.string().email().allow('', null),
        channel: Joi.string().allow('', null),
      })
    )
    .min(1)
    .required(),
});
