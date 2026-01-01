import OpenAI from 'openai';
import { sanitizeRemark30, remarkStringSchema30 } from '../utils/remarkUtils.js';

/**
 * Simple OpenAI client reusing your existing .env
 * Uses OPENAI_API_KEY and optional OPENAI_EXAMS_MODEL
 */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EXAMS_MODEL =
  process.env.OPENAI_EXAMS_MODEL ||
  process.env.OPENAI_COURSE_MODEL ||
  'gpt-4o-mini';

/**
 * Shape of the JSON we expect from AI for remarks:
 * {
 *   principalRemark: string | null,
 *   subjectRemarks: Array<{ subject: string, remark: string }>
 * }
 */
const EXAM_INSIGHTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    principalRemark: { type: 'string' },
    subjectRemarks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          subject: { type: 'string' },
          remark: remarkStringSchema30(), // ✅ <=30 + no trailing dot/ellipsis
        },
        required: ['subject', 'remark'],
      },
    },
  },
  required: ['principalRemark', 'subjectRemarks'],
};

const EXAM_CONFIG_TRANSFORM_SCHEMA = {
  type: 'object',
  properties: {
    reportTitle: { type: 'string' },
    terms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          label: { type: 'string' },
          year: { anyOf: [{ type: 'number' }, { type: 'string' }] },
          is_active: { type: 'boolean' },
        },
        required: ['label', 'year'],
      },
    },
    sessions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          term_label: { type: 'string' }, // required: link back to a term by label
          weight: { anyOf: [{ type: 'number' }, { type: 'string' }] },
          starts_at: { type: ['string', 'null'] },
          ends_at: { type: ['string', 'null'] },
        },
        required: ['label', 'term_label'],
        additionalProperties: true,
      },
    },
    gradingBands: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          grade: { type: 'string' },
          min_percent: { anyOf: [{ type: 'number' }, { type: 'string' }] },
          max_percent: { anyOf: [{ type: 'number' }, { type: 'string' }] },
          remark: { type: ['string', 'null'] },
          scheme_name: { type: 'string' },
        },
        required: ['grade', 'min_percent', 'max_percent'],
        additionalProperties: true,
      },
    },
  },
  required: ['terms', 'sessions', 'gradingBands'],
  additionalProperties: true,
};

/**
 * NEW: Shape of JSON we expect when AI is transforming the marks sheet.
 *
 * IMPORTANT:
 * - `extra` is an ARRAY of {key,value} entries so we can keep strict JSON schema.
 */
const EXAM_SHEET_TRANSFORM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    updatedRows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          student_user_id: { anyOf: [{ type: 'number' }, { type: 'string' }] },
          subject: { type: 'string' },
          subject_new: { anyOf: [{ type: 'string' }, { type: 'null' }] },

          score: { anyOf: [{ type: 'number' }, { type: 'null' }] },
          max_score: { anyOf: [{ type: 'number' }, { type: 'null' }] },
          cat_score: { anyOf: [{ type: 'number' }, { type: 'null' }] },
          exam_score: { anyOf: [{ type: 'number' }, { type: 'null' }] },
          percent: { anyOf: [{ type: 'number' }, { type: 'null' }] },

          grade: { anyOf: [{ type: 'string' }, { type: 'null' }] },

          remark: { anyOf: [remarkStringSchema30(), { type: 'null' }] },

          teacher_initials: { anyOf: [{ type: 'string' }, { type: 'null' }] },

          // ✅ strict-safe dynamic columns
          extra: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                key: { type: 'string' },
                value: {
                  anyOf: [
                    { type: 'string' },
                    { type: 'number' },
                    { type: 'boolean' },
                    { type: 'null' },
                  ],
                },
              },
              required: ['key', 'value'],
            },
          },
        },
        // ✅ strict: true requires all fields required (use nulls to emulate optional)
        required: [
          'student_user_id',
          'subject',
          'subject_new',
          'score',
          'max_score',
          'cat_score',
          'exam_score',
          'percent',
          'grade',
          'remark',
          'teacher_initials',
          'extra',
        ],
      },
    },
  },
  required: ['updatedRows'],
};

/**
 * Helpers for strict-safe extra conversions:
 * - object -> [{key,value}] for AI input
 * - [{key,value}] -> object for backend merge
 */
const extraObjToEntries = (obj) =>
  Object.entries(obj || {}).map(([key, value]) => ({
    key: String(key),
    value:
      value == null || ['string', 'number', 'boolean'].includes(typeof value)
        ? value
        : JSON.stringify(value),
  }));

const entriesToExtraObj = (entries) => {
  const out = {};
  for (const e of Array.isArray(entries) ? entries : []) {
    if (e && typeof e.key === 'string') out[e.key] = e.value ?? null;
  }
  return out;
};

/**
 * Build a compact JSON-friendly snapshot of the card for AI.
 * We deliberately avoid sending emails / IDs etc.
 */
function buildAiCardSnapshot(card) {
  return {
    org: {
      name: card.org?.name || 'School',
    },
    student: {
      name: card.student?.name || 'Learner',
      class_label:
        card.student?.class_label || card.summary?.classLabel || null,
    },
    term: card.term ? { year: card.term.year, label: card.term.label } : null,
    session: card.session ? { label: card.session.label } : null,
    summary: {
      totalScore: card.summary?.totalScore ?? null,
      totalMax: card.summary?.totalMax ?? null,
      totalPercent: card.summary?.totalPercent ?? null,
      overallGrade: card.summary?.overallGrade ?? null,
      classRank: card.summary?.classRank ?? null,
      classSize: card.summary?.classSize ?? null,
    },
    subjects: (card.subjects || []).map((s) => ({
      subject: s.subject,
      score: s.score,
      max_score: s.max_score,
      percent: s.percent,
      grade: s.grade,
      remark: s.remark || null,
    })),
    attendance: card.attendance || null,
    computed: card.computed || null,
  };
}

function buildAiConfigSnapshot(config = {}) {
  const terms = Array.isArray(config.terms) ? config.terms : [];
  const sessions = Array.isArray(config.sessions) ? config.sessions : [];
  const gradingBands = Array.isArray(config.gradingBands)
    ? config.gradingBands
    : [];

  const termById = new Map();
  terms.forEach((t) => {
    if (!t) return;
    if (!t.id) return;
    termById.set(String(t.id), t);
  });

  return {
    reportTitle: config.reportTitle ?? null,
    terms: terms.map((t) => ({
      label: t.label,
      year: t.year,
      is_active: Boolean(t.is_active),
    })),
    sessions: sessions.map((s) => {
      let termLabel = null;
      if (s.term_id && termById.has(String(s.term_id))) {
        termLabel = termById.get(String(s.term_id)).label || null;
      }
      return {
        label: s.label,
        term_label: termLabel,
        weight: s.weight ?? 1,
        starts_at: s.starts_at || null,
        ends_at: s.ends_at || null,
      };
    }),
    gradingBands: gradingBands.map((b) => ({
      grade: b.grade,
      min_percent: b.min_percent,
      max_percent: b.max_percent,
      remark: b.remark ?? null,
      scheme_name: b.scheme_name || 'default',
    })),
  };
}

function clampSubjectRemark(raw, max = 30) {
  if (raw == null) return null;
  const flat = String(raw).replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  if (flat.length <= max) return flat;

  const clipped = flat.slice(0, max);
  const lastSpace = clipped.lastIndexOf(' ');
  const safe = lastSpace > 10 ? clipped.slice(0, lastSpace) : clipped;
  return safe.trimEnd();
}

/**
 * Core AI helper:
 * - Takes the student card + optional free-text instructions from admin
 * - Returns { principalRemark, subjectRemarks[] } JSON
 */
export async function aiGenerateExamInsights({ card, instructions }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const snapshot = buildAiCardSnapshot(card);

  const systemMessage =
    'You are an experienced school teacher and examination officer. ' +
    'Given exam results, you generate clear, professional report-card remarks and optional per-subject comments. ' +
    'You must ALWAYS respond as pure JSON, matching the provided JSON schema.';

  const userMessage = [
    'You are helping to generate remarks for a school report card.',
    '',
    'Context JSON:',
    '```json',
    JSON.stringify(snapshot, null, 2),
    '```',
    '',
    'Goals:',
    '- Write a short overall PRINCIPAL-style remark (2–4 sentences) under 420 characters.',
    '- Optionally refine/override per-subject comments to be printed in the subject REMARK column.',
    '- Keep each subject remark under 30 characters, as a short but complete phrase with NO trailing dots or ellipsis.',
    '',
    instructions
      ? `Extra instructions from the admin/instructor: "${instructions}"`
      : 'Use a neutral, encouraging tone suitable for different types of schools (primary, secondary, etc.).',
    '',
    'Return JSON only, with this shape:',
    JSON.stringify(EXAM_INSIGHTS_SCHEMA, null, 2),
  ].join('\n');

  const resp = await openai.responses.create({
    model: EXAMS_MODEL,
    input: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'exam_insights',
        strict: true,
        schema: EXAM_INSIGHTS_SCHEMA,
      },
    },
  });

  const raw = resp.output_text || '{}';

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    parsed = {
      principalRemark:
        'This learner has shown steady progress this term. Please review the detailed marks and discuss targets for the next exam.',
      subjectRemarks: [],
    };
  }

  const principalRemark =
    typeof parsed.principalRemark === 'string'
      ? parsed.principalRemark.trim()
      : null;

  const subjectRemarks = Array.isArray(parsed.subjectRemarks)
    ? parsed.subjectRemarks
        .filter(
          (x) =>
            x &&
            typeof x.subject === 'string' &&
            x.subject.trim() &&
            typeof x.remark === 'string' &&
            x.remark.trim()
        )
        .map((x) => ({
          subject: x.subject.trim(),
          remark: sanitizeRemark30(x.remark),
        }))
    : [];

  return {
    principalRemark,
    subjectRemarks,
    _raw: parsed,
  };
}

/**
 * Build a compact JSON snapshot of the MARKS SHEET for AI.
 * We only send what AI needs to compute columns.
 */
function buildAiSheetSnapshot({ rows, meta = {} }) {
  return {
    org: {
      name: meta.orgName || 'School',
    },
    session: {
      id: meta.sessionId || null,
      label: meta.sessionLabel || null,
    },
    class_label: meta.classLabel || null,
    targetColumnKey: meta.targetColumnKey || null,
    instructions: meta.instructions || null,
    rows: (rows || []).map((r) => ({
      student_user_id: r.student_user_id,
      subject: r.subject,
      class_label: r.class_label || null,
      score: r.score ?? null,
      max_score: r.max_score ?? null,
      cat_score: r.cat_score ?? null,
      exam_score: r.exam_score ?? null,
      percent: r.percent ?? null,
      grade: r.grade ?? null,
      remark: r.remark ?? null,
      teacher_initials: r.teacher_initials ?? r.teacherInitials ?? null,

      // ✅ convert object extras into strict-safe entries for the AI
      extra: extraObjToEntries(
        r.extra && typeof r.extra === 'object' && !Array.isArray(r.extra)
          ? r.extra
          : {}
      ),
    })),
  };
}

/**
 * Core AI helper for the SHEET:
 */
export async function aiComputeExamSheet({
  rows,
  instructions,
  meta = {},
  targetColumnKey,
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const snapshot = buildAiSheetSnapshot({
    rows,
    meta: {
      ...meta,
      instructions,
      targetColumnKey,
    },
  });

  const systemMessage =
    'You are an assistant that helps teachers compute or fill exam mark-sheet columns. ' +
    'You must strictly follow the JSON schema. ' +
    'NEVER change student_user_id. ' +
    'DO NOT change the "subject" field directly because it is used to match rows. ' +
    'If you need to correct a subject name (typo/casing), set "subject_new" to the corrected value. ' +
    'The "extra" field is an ARRAY of {key,value} entries (not an object). If you want to set a value, add/update an entry with that key.';

  const userMessage = [
    'You are helping to compute or fill columns for a school exam mark sheet.',
    '',
    'Context JSON (rows + meta):',
    '```json',
    JSON.stringify(snapshot, null, 2),
    '```',
    '',
    'Rules:',
    '- NEVER change student_user_id.',
    '- DO NOT change the "subject" field directly. To correct subject spelling/casing, use "subject_new".',
    '- Treat each row as one learner + subject entry.',
    '- extra is an ARRAY of entries: [{ "key": "...", "value": ... }].',
    '- If targetColumnKey is provided and is NOT "Remark" or "Remarks", prefer adding/updating an entry in row.extra like: { "key": targetColumnKey, "value": "..." }.',
    '- If targetColumnKey IS "Remark" or "Remarks", write your text into the existing "remark" field for that row. DO NOT create an extra entry with key "Remark" or "Remarks".',
    '- You MAY adjust derived numeric fields (e.g. percent).',
    '- If you need to add additional per-subject commentary beyond the main remark, add/update an entry in row.extra (e.g. { "key": "ai_comment", "value": "..." }).',
    '- If you introduce any new derived column other than Remark(s), it MUST live inside row.extra as an entry with your chosen key.',
    '- To DELETE an extra column completely (e.g. "Effort"), set an entry { "key": "Effort", "value": "__DELETE__" } (or null) for every affected row.',
    '',
    'Return ONLY JSON with this shape:',
    JSON.stringify(EXAM_SHEET_TRANSFORM_SCHEMA, null, 2),
    '',
    'Examples of what you can do:',
    '- Fill "Effort" as A/B/C/D/E based on percent ranges (store as extra entry).',
    '- Compute "Total" in an extra entry key "total" as cat_score + exam_score.',
    '- Rewrite remark strings to be short, neutral comments.',
  ].join('\n');

  const resp = await openai.responses.create({
    model: EXAMS_MODEL,
    input: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: instructions || '' },
      { role: 'user', content: userMessage },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'exam_sheet_transform',
        strict: true,
        schema: EXAM_SHEET_TRANSFORM_SCHEMA,
      },
    },
  });

  const raw = resp.output_text || '{}';

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    parsed = { updatedRows: [] };
  }

  const updatedRows = Array.isArray(parsed.updatedRows)
    ? parsed.updatedRows
        .filter((row) => {
          const sid = Number(row.student_user_id);
          const subject = row.subject && row.subject.toString().trim();
          return sid && subject;
        })
        .map((row) => ({
          ...row,
          remark:
            row.remark == null ? row.remark : sanitizeRemark30(row.remark),

          // ✅ convert AI entries -> object so the rest of your backend can merge normally
          extra: entriesToExtraObj(row.extra),
        }))
    : [];

  return {
    updatedRows,
    _raw: parsed,
  };
}

export async function aiTransformExamConfig({ config, instructions }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const snapshot = buildAiConfigSnapshot(config || {});

  const systemMessage =
    'You help school admins configure exam TERMS, EXAMS (sessions), and GRADING BANDS. ' +
    'You must strictly return JSON following the given JSON schema. ' +
    'When the user asks to delete something, simply OMIT it from the final arrays. ' +
    'Sessions must always reference a term by its label via term_label.';

  const userMessage = [
    'You are helping to update the exam setup for a school.',
    '',
    'Current configuration (JSON):',
    '```json',
    JSON.stringify(snapshot, null, 2),
    '```',
    '',
    'User instructions:',
    instructions || 'Tidy this setup in a sensible way.',
    '',
    'Important rules:',
    '- If the user says "create" something, include it in the final arrays.',
    '- If the user says "delete/remove" something, DO NOT include it in the final arrays.',
    '- If they mention semesters, treat them as terms with sensible labels like "Semester 1".',
    '- Every session MUST have a term_label that matches one of the final terms.',
    '- For gradingBands, keep ranges non-overlapping and in 0–100.',
    '',
    'Return ONLY JSON with this shape:',
    JSON.stringify(EXAM_CONFIG_TRANSFORM_SCHEMA, null, 2),
  ].join('\n');

  const completion = await openai.chat.completions.create({
    model: EXAMS_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content || '{}';

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  const safeTerms = Array.isArray(parsed.terms) ? parsed.terms : snapshot.terms;
  const safeSessions = Array.isArray(parsed.sessions)
    ? parsed.sessions
    : snapshot.sessions;
  const safeBands = Array.isArray(parsed.gradingBands)
    ? parsed.gradingBands
    : snapshot.gradingBands;

  const safeReportTitle =
    typeof parsed.reportTitle === 'string'
      ? parsed.reportTitle.trim()
      : config && typeof config.reportTitle === 'string'
        ? config.reportTitle
        : null;

  return {
    reportTitle: safeReportTitle,
    terms: safeTerms,
    sessions: safeSessions,
    gradingBands: safeBands,
    _raw: parsed,
  };
}
