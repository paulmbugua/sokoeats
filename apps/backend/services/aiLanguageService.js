// apps/backend/services/aiLanguageService.js
import pool, { queryWithRetry, rollbackQuiet } from '../config/db.js';
import {
  aiJson,
  QUIZ_SCHEMA_MCQ,
  fairTimerSec,
  dlog,
  cacheGetJSON,
  cacheSetJSON,
  sha1,
} from './aiCourseCore.js';
import { listGoogleVoices, synthesizeTtsLocalFirst } from './googleTtsService.js';
import { todayRange } from './narrationGate.js';



const TOKEN_COST = 20;
const FREE_PROMPTS_LIMIT = 5;
const PAID_PROMPTS_LIMIT = 300;
const ORG_PROMPT_LIMITS = { pro: 10, enterprise: 20 };
const PROMPTS_PER_BUNDLE = FREE_PROMPTS_LIMIT;
const PROMPT_HISTORY_LIMIT = 12;
const LANGUAGE_CACHE_TTL_SEC = 60 * 60 * 24 * 14;
const TX_WARN_MS = Number(process.env.DB_TX_WARN_MS) || 2500;

const LANGUAGE_CONFIG = {
  de: { label: 'German', locale: 'de-DE', native: 'Deutsch' },
  fr: { label: 'French', locale: 'fr-FR', native: 'Français' },
  es: { label: 'Spanish', locale: 'es-ES', native: 'Español' },
  ar: { label: 'Arabic', locale: 'ar-XA', native: 'العربية' },
  
};

const asIntId = (v) => {
  if (v === undefined || v === null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

async function resolveOrgPromptLimit({ orgId, userId, db = pool }) {
  const safeOrgId = String(orgId || '').trim();
  if (!safeOrgId || !userId) return null;

  const memberQ = await db.query(
    `SELECT 1 FROM org_memberships WHERE org_id = $1 AND user_id = $2 LIMIT 1`,
    [safeOrgId, userId],
  );
  if (!memberQ.rowCount) return null;

  const subQ = await db.query(
    `SELECT tier, active
       FROM org_subscriptions
      WHERE org_id = $1
      ORDER BY started_at DESC
      LIMIT 1`,
    [safeOrgId],
  );
  if (!subQ.rowCount || !subQ.rows[0].active) return null;

  const tier = String(subQ.rows[0].tier || '').toLowerCase();
  const limit = ORG_PROMPT_LIMITS[tier];
  if (!limit) return null;

  return { limit, resetsAt: todayRange().end };
}

function isPaidBundle(entitlementRow) {
  const perBundle = Number(entitlementRow?.prompts_per_bundle || 0);
  return perBundle >= PAID_PROMPTS_LIMIT;
}

function buildPromptLimit({ entitlementRow, orgLimit }) {
  const promptsPerBundle = Number(entitlementRow.prompts_per_bundle || PROMPTS_PER_BUNDLE);
  const bundles = Number(entitlementRow.prompt_bundles || 1);
  const paid = isPaidBundle(entitlementRow);
  if (paid) {
    return {
      promptsLimit: bundles * promptsPerBundle,
      resetsAt: null,
      paid,
    };
  }
  if (orgLimit?.limit) {
    return {
      promptsLimit: Number(orgLimit.limit),
      resetsAt: orgLimit.resetsAt || todayRange().end,
      paid: false,
    };
  }
  return {
    promptsLimit: FREE_PROMPTS_LIMIT,
    resetsAt: todayRange().end,
    paid: false,
  };
}

async function resetDailyPromptsIfNeeded(client, entitlementRow, { paid }) {
  if (paid) return entitlementRow;
  const updatedAt = entitlementRow?.updated_at ? new Date(entitlementRow.updated_at) : null;
  const day = todayRange();
  const dayStart = new Date(`${day.start}T00:00:00.000Z`);
  if (!updatedAt || updatedAt.getTime() >= dayStart.getTime()) return entitlementRow;

  const updated = await client.query(
    `
    UPDATE ai_language_entitlements
       SET prompts_used = 0,
           updated_at = now()
     WHERE course_id = $1::uuid
     RETURNING *
    `,
    [entitlementRow.course_id],
  );
  return updated.rows[0] || entitlementRow;
}

// ─────────────────────────────────────────────────────────
// Output sizing helpers (prevents JSON truncation)
// ─────────────────────────────────────────────────────────
const QUIZ_MAX_TOKENS_CAP = 4500;

/** MCQ JSON is verbose; size output tokens based on question count. */
function estimateMcqMaxTokens(questionCount) {
  const n = Math.max(4, Number(questionCount || 0) || 0);
  // Heuristic: baseline + per-question budget
  return Math.min(QUIZ_MAX_TOKENS_CAP, Math.max(1200, 650 + n * 230));
}

/** Keep quiz size predictable by course size */
function quizQuestionCountForCourseSize(courseSize) {
  const s = String(courseSize || '').toLowerCase();
  if (s === 'mini') return 8;
  if (s === 'standard') return 10;
  if (s === 'extended') return 12;
  if (s === 'deep_dive') return 14;
  if (s === 'bootcamp') return 16;
  return 8;
}

/** Prevent huge context from bloating generation */
function truncateToChars(text, maxChars) {
  const s = String(text || '');
  if (!s) return '';
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars - 20) + '\n\n[truncated]';
}

function startTxTimer(label) {
  const start = Date.now();
  return (status = 'done') => {
    const durationMs = Date.now() - start;
    if (durationMs >= TX_WARN_MS) {
      console.warn(`[pg:tx] ${label} ${status} in ${durationMs}ms`);
    }
  };
}

async function runQuery(queryable, text, params, { useRetry = false } = {}) {
  if (useRetry) {
    return queryWithRetry(text, params);
  }
  return queryable.query(text, params);
}


export function detectTargetLanguage(prompt) {
  const raw = String(prompt || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  const matches = [
    { code: 'de', re: /(germany|german|deutsch)/i },
    { code: 'fr', re: /(france|french|fran[çc]ais)/i },
    { code: 'es', re: /(spain|spanish|espa[ñn]ol)/i },
    { code: 'ar', re: /(arabic|arab|العربية)/i },
  ];

  for (const { code, re } of matches) {
    if (re.test(lower)) return code;
  }

  return null;
}

function languageLabel(code) {
  return LANGUAGE_CONFIG[code]?.label || code;
}

function languageLocale(code) {
  return LANGUAGE_CONFIG[code]?.locale || 'en-US';
}

function buildCourseTitle(code) {
  return `Language Learning: English → ${languageLabel(code)}`;
}

function pickVoiceByGender(voices, preferredGender) {
  const normGender = String(preferredGender || '').toUpperCase();
  const preferred = voices.find((v) => v.ssmlGender === normGender);
  return preferred?.name || voices[0]?.name || null;
}

function buildLanguageCacheKey({ courseId, prompt, targetLanguage, voices }) {
  const normalizedPrompt = String(prompt || '').trim().toLowerCase();
  const promptHash = sha1(normalizedPrompt);
  const voiceKey = `${voices?.teacher || 'en'}|${voices?.translator || 'tr'}`;
  return `ai:lang:${courseId}:${targetLanguage}:${promptHash}:voice=${voiceKey}:mode=queue`;
}

async function chooseVoicePair(targetLanguage) {
  const [enVoices, targetVoices] = await Promise.all([
    listGoogleVoices({ languageCode: 'en-US', onlyWavenet: true }).catch(() => []),
    listGoogleVoices({
      languageCode: languageLocale(targetLanguage),
      onlyWavenet: true,
    }).catch(() => []),
  ]);

  const teacher =
    pickVoiceByGender(enVoices, 'MALE') ||
    pickVoiceByGender(enVoices, 'FEMALE') ||
    'en-US-Wavenet-C';

  const translator =
    pickVoiceByGender(targetVoices, 'FEMALE') ||
    pickVoiceByGender(targetVoices, 'MALE') ||
    targetVoices[0]?.name ||
    'en-US-Wavenet-C';

  return { teacher, translator };
}

const VOICE_STYLE_PRESETS = {
  calm: { enGender: 'FEMALE', trGender: 'FEMALE' },
  bright: { enGender: 'FEMALE', trGender: 'FEMALE' },
  deep: { enGender: 'MALE', trGender: 'MALE' },
  storyteller: { enGender: 'FEMALE', trGender: 'FEMALE' },
  teacher: { enGender: 'MALE', trGender: 'FEMALE' },
  kid: { enGender: 'FEMALE', trGender: 'FEMALE' },
  sunny: { enGender: 'FEMALE', trGender: 'FEMALE' },
  focus: { enGender: 'MALE', trGender: 'MALE' },
};

function hashToIndex(hex, len) {
  if (!len) return 0;
  const n = parseInt(String(hex || '').slice(0, 8), 16);
  if (!Number.isFinite(n)) return 0;
  return n % len;
}

function pickDeterministicVoice(voices, preferredGender, salt) {
  const normGender = String(preferredGender || '').toUpperCase();
  const genderPool = normGender
    ? (voices || []).filter((v) => String(v.ssmlGender || '').toUpperCase() === normGender)
    : [];

  const pool = genderPool.length ? genderPool : (voices || []);
  if (!pool.length) return null;

  const idx = hashToIndex(sha1(String(salt || '')), pool.length);
  return pool[idx]?.name || pool[0]?.name || null;
}

async function chooseVoicePairForStyle(targetLanguage, voiceId) {
  const style = String(voiceId || '').trim().toLowerCase();
  if (!style) return chooseVoicePair(targetLanguage);

  const preset = VOICE_STYLE_PRESETS[style] || null;

  const [enVoices, targetVoices] = await Promise.all([
    listGoogleVoices({ languageCode: 'en-US', onlyWavenet: true }).catch(() => []),
    listGoogleVoices({
      languageCode: languageLocale(targetLanguage),
      onlyWavenet: true,
    }).catch(() => []),
  ]);

  const teacher =
    pickDeterministicVoice(enVoices, preset?.enGender, `${style}|en`) ||
    pickVoiceByGender(enVoices, 'MALE') ||
    pickVoiceByGender(enVoices, 'FEMALE') ||
    'en-US-Wavenet-C';

  const translator =
    pickDeterministicVoice(targetVoices, preset?.trGender, `${style}|tr|${targetLanguage}`) ||
    pickVoiceByGender(targetVoices, 'FEMALE') ||
    pickVoiceByGender(targetVoices, 'MALE') ||
    targetVoices[0]?.name ||
    'en-US-Wavenet-C';

  return { teacher, translator };
}

async function loadAssistantMessageForPlayback(queryable, courseId, { messageId, messageIndex }, opts = {}) {
  // 1) Try messageId (if your table has id)
  if (messageId != null) {
    try {
      const byId = await runQuery(
        queryable,
        `
        SELECT id, role, segments_json, content_text, created_at
          FROM ai_language_messages
         WHERE course_id = $1::uuid
           AND id = $2
         LIMIT 1
        `,
        [courseId, messageId],
        opts,
      );
      if (byId.rowCount) {
        const row = byId.rows[0];
        if (row.role === 'assistant') return row;
        // If a user msg id was sent by mistake, fall through to index logic.
      }
    } catch (e) {
      // If "id" column doesn't exist or other query issue, fall back to index logic.
    }
  }

  // 2) Index fallback: treat messageIndex as "messages list index" (chronological, both roles)
  const idx = Number.isFinite(messageIndex) ? Number(messageIndex) : null;
  if (idx == null) return null;

  const baseQ = await runQuery(
    queryable,
    `
    SELECT role, segments_json, content_text, created_at
      FROM ai_language_messages
     WHERE course_id = $1::uuid
     ORDER BY created_at ASC
     OFFSET $2
     LIMIT 1
    `,
    [courseId, idx],
    opts,
  );

  if (!baseQ.rowCount) return null;

  const baseRow = baseQ.rows[0];
  if (baseRow.role === 'assistant') return baseRow;

  // If user clicked around oddly, pick nearest assistant after this point, else before.
  const nextQ = await runQuery(
    queryable,
    `
    SELECT role, segments_json, content_text, created_at
      FROM ai_language_messages
     WHERE course_id = $1::uuid
       AND role = 'assistant'
       AND created_at >= $2
     ORDER BY created_at ASC
     LIMIT 1
    `,
    [courseId, baseRow.created_at],
    opts,
  );
  if (nextQ.rowCount) return nextQ.rows[0];

  const prevQ = await runQuery(
    queryable,
    `
    SELECT role, segments_json, content_text, created_at
      FROM ai_language_messages
     WHERE course_id = $1::uuid
       AND role = 'assistant'
       AND created_at <= $2
     ORDER BY created_at DESC
     LIMIT 1
    `,
    [courseId, baseRow.created_at],
    opts,
  );
  if (prevQ.rowCount) return prevQ.rows[0];

  return null;
}


async function upsertCourseMetadata(queryable, courseId, metadata, opts = {}) {
  await runQuery(
    queryable,
    `
    UPDATE courses
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
     WHERE id = $1::uuid
    `,
    [courseId, JSON.stringify(metadata)],
    opts,
  );
}

async function ensureLanguageCourse({
  client,
  userId,
  profileId,
  prompt,
  targetLanguage,
}) {
  const existing = await client.query(
    `
    SELECT e.*, c.metadata
      FROM ai_language_entitlements e
      JOIN courses c ON c.id = e.course_id
   WHERE e.target_language = $3
  AND (
    ($1::int IS NOT NULL AND e.profile_id = $1::int)
    OR
    ($2::int IS NOT NULL AND e.user_id = $2::int)
  )

     ORDER BY e.updated_at DESC
     LIMIT 1
    `,
    [profileId ?? null, userId ?? null, targetLanguage]

  );

  if (existing.rowCount) return existing.rows[0];

  const metadata = {
  mode: 'language',
  targetLanguage,
  titleSeed: prompt,
  // voices added later by resolveVoices()
};



  const title = buildCourseTitle(targetLanguage);
  const description = `Chat-based language learning course for ${languageLabel(targetLanguage)}.`;

const courseQ = await client.query(
  `
  INSERT INTO courses (id, title, description, course_size, is_ai_generated, metadata)
  VALUES (gen_random_uuid(), $1, $2, $3, TRUE, $4::jsonb)
  RETURNING id
  `,
  [title, description, 'mini', JSON.stringify(metadata)],
);


  const courseId = courseQ.rows[0]?.id;

  await client.query(
    `
    INSERT INTO ai_language_entitlements
      (course_id, profile_id, user_id, target_language, prompt_bundles, prompts_used, prompts_per_bundle)
    VALUES ($1::uuid, $2::int, $3::int, $4, 1, 0, $5)

    `,
    [courseId, profileId, userId, targetLanguage, FREE_PROMPTS_LIMIT],
  );

  await client.query(
    `
    INSERT INTO enrollments (student_id, course_id, status, started_at, updated_at)
    VALUES ($1, $2::uuid, $3, NOW(), NOW())
    ON CONFLICT (student_id, course_id)
    DO UPDATE SET
      status = EXCLUDED.status,
      started_at = COALESCE(enrollments.started_at, EXCLUDED.started_at),
      updated_at = NOW()
    `,
    [userId, courseId, 'active'],
  );

  return {
    course_id: courseId,
    profile_id: profileId,
    user_id: userId,
    target_language: targetLanguage,
    prompt_bundles: 1,
    prompts_used: 0,
    prompts_per_bundle: FREE_PROMPTS_LIMIT,
    unlocked_at: new Date().toISOString(),
    completed_at: null,
    quiz_passed: false,
    metadata,
  };
}

function formatEntitlement(row, { promptsLimit, resetsAt } = {}) {
  if (!row) return null;
  const promptsPerBundle = Number(row.prompts_per_bundle || PROMPTS_PER_BUNDLE);
  const bundles = Number(row.prompt_bundles || 1);
  const used = Number(row.prompts_used || 0);
  const effectiveLimit =
    typeof promptsLimit === 'number' && Number.isFinite(promptsLimit)
      ? promptsLimit
      : bundles * promptsPerBundle;
  return {
    courseId: row.course_id,
    profileId: row.profile_id,
    userId: row.user_id,
    targetLanguage: row.target_language,
    promptBundles: bundles,
    promptsUsed: used,
    promptsPerBundle,
    promptsLimit: effectiveLimit,
    bundleBlocked: Boolean(effectiveLimit > 0 && used >= effectiveLimit),
    unlockedAt: row.unlocked_at,
    resetsAt: resetsAt ?? null,
    completedAt: row.completed_at,
    quizPassed: row.quiz_passed,
  };
}

async function loadRecentMessages(queryable, courseId, limit = PROMPT_HISTORY_LIMIT, opts = {}) {
  const q = await runQuery(
    queryable,
    `
    SELECT role, content_text, segments_json, created_at
      FROM ai_language_messages
     WHERE course_id = $1::uuid
     ORDER BY created_at DESC
     LIMIT $2
    `,
    [courseId, limit],
    opts,
  );

  return (q.rows || []).reverse();
}

function formatMessagesPreview(rows) {
  return (rows || []).map((row) => ({
    role: row.role,
    content: row.content_text,
    segments: row.segments_json || null,
    createdAt: row.created_at,
  }));
}

function buildConversationContext(messages) {
  if (!messages?.length) return '';
  return messages
    .map((msg) => {
      if (msg.role === 'assistant' && Array.isArray(msg.segments_json)) {
        const lines = msg.segments_json
          .map((seg) => `EN: ${seg.en}\nTR: ${seg.tr}`)
          .join('\n');
        return `Assistant:\n${lines}`;
      }
      return `User: ${msg.content_text}`;
    })
    .join('\n\n');
}

async function generateLanguageResponse({
  targetLanguage,
  prompt,
  messages,
}) {
  const langLabel = languageLabel(targetLanguage);
  const langNative = LANGUAGE_CONFIG[targetLanguage]?.native || langLabel;

  const system = `You are a bilingual language tutor. The learner is an English speaker learning ${langLabel} (${langNative}).
Return JSON only, following the schema. Keep segments short, conversational, and accurate. Use natural translations.
Include 3-6 segments, short vocab list, and 2-3 mini practice prompts.`;

  const history = buildConversationContext(messages);
  const user = `Conversation so far:\n${history || 'None'}\n\nLearner prompt: ${prompt}\n\nRespond in JSON.`;

  const schema = {
    name: 'LanguageChatResponse',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        segments: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              en: { type: 'string', minLength: 1 },
              tr: { type: 'string', minLength: 1 },
            },
            required: ['en', 'tr'],
          },
        },
        vocab: {
          type: 'array',
           default: [],
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              term: { type: 'string', minLength: 1 },
              meaning: { type: 'string', minLength: 1 },
              exampleEn: { type: 'string', minLength: 1 },
              exampleTr: { type: 'string', minLength: 1 },
            },
            required: ['term', 'meaning', 'exampleEn', 'exampleTr'],
          },
        },
        
        miniPractice: {
          type: 'array',
           default: [], 
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              promptEn: { type: 'string', minLength: 1 },
              promptTr: { type: 'string', minLength: 1 },
              answerHint: { type: 'string', minLength: 1 },
            },
            required: ['promptEn', 'promptTr', 'answerHint'],
          },
        },
      },
      required: ['segments', 'vocab', 'miniPractice'],

    },
  };

  return aiJson({ system, user, temperature: 0.4, schema, maxTokens: 1400 });
}

async function buildPlaybackQueue({ segments, voices }) {
  const items = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    const enAudio = await synthesizeTtsLocalFirst({
      text: seg.en,
      voiceName: voices.teacher,
      wantTimepoints: false,
    });

    const trAudio = await synthesizeTtsLocalFirst({
      text: seg.tr,
      voiceName: voices.translator,
      wantTimepoints: false,
    });

    items.push({
      segmentIdx: i,
      kind: 'en',
      text: seg.en,
      audioUrl: enAudio.cdnUrl,
    });
    items.push({
      segmentIdx: i,
      kind: 'tr',
      text: seg.tr,
      audioUrl: trAudio.cdnUrl,
    });
  }

  return { mode: 'queue', items };
}

async function resolveVoices(queryable, courseId, targetLanguage, metadata, opts = {}) {
  if (metadata?.voices?.teacher && metadata?.voices?.translator) return metadata.voices;

  const voices = await chooseVoicePair(targetLanguage);
  await upsertCourseMetadata(queryable, courseId, { voices }, opts);
  return voices;
}

export async function startLanguageCourse({ userId, profileId, prompt, orgId }) {
  userId = asIntId(userId);
  profileId = asIntId(profileId);
  const targetLanguage = detectTargetLanguage(prompt);
  if (!targetLanguage) {
    return {
      status: 400,
      data: {
        error: 'LANGUAGE_NOT_DETECTED',
        message:
          'Which language would you like to learn? Try “Teach me German”, “Teach me French”, “Teach me Spanish”, or “Teach me Arabic”.',
      },
    };
  }

  let client;
  let courseId;
  let entitlement;
  let metadata = {};
  let promptsLimit = 0;
  let resetsAt = null;
  let orgLimit = null;
  const endTxTimer = startTxTimer('aiLanguage:start');

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const entitlementRow = await ensureLanguageCourse({
      client,
      userId,
      profileId,
      prompt,
      targetLanguage,
    });

    courseId = entitlementRow.course_id;
    metadata = entitlementRow.metadata || {};

    const entitlementQ = await client.query(
      `SELECT * FROM ai_language_entitlements WHERE course_id = $1::uuid FOR UPDATE`,
      [courseId],
    );
    entitlement = entitlementQ.rows[0];
    orgLimit = await resolveOrgPromptLimit({ orgId, userId, db: client });
    const promptLimitMeta = buildPromptLimit({ entitlementRow: entitlement, orgLimit });
    promptsLimit = promptLimitMeta.promptsLimit;
    resetsAt = promptLimitMeta.resetsAt;

    entitlement = await resetDailyPromptsIfNeeded(client, entitlement, {
      paid: promptLimitMeta.paid,
    });

    if (Number(entitlement.prompts_used || 0) >= promptsLimit) {
      await rollbackQuiet(client);
      endTxTimer('rollback');
      return {
        status: 409,
        data: {
          error: 'PROMPT_LIMIT_REACHED',
          message: 'You have reached the free prompt limit for this course.',
          needTokens: TOKEN_COST,
          promptsUsed: Number(entitlement.prompts_used || 0),
          promptsLimit,
          resetsAt,
          bundleBlocked: true,
        },
      };
    }

    await client.query(
      `
      UPDATE ai_language_entitlements
         SET prompts_used = prompts_used + 1,
             updated_at = now()
       WHERE course_id = $1::uuid
      `,
      [courseId],
    );

    await client.query(
      `
      INSERT INTO ai_language_messages
        (course_id, profile_id, user_id, role, content_text)
      VALUES ($1::uuid, $2::int, $3::int, 'user', $4)

      `,
      [courseId, profileId, userId, prompt],
    );

    await client.query('COMMIT');
    endTxTimer('commit');
    client.release();
    client = null;

    // Resolve voices OUTSIDE tx (may call Google)
    const voices = await resolveVoices(pool, courseId, targetLanguage, metadata, {
      useRetry: true,
    });
    const cacheKey = buildLanguageCacheKey({
      courseId,
      prompt,
      targetLanguage,
      voices,
    });
    const cached = await cacheGetJSON(cacheKey);

    const recentMessages = await loadRecentMessages(pool, courseId, PROMPT_HISTORY_LIMIT, {
      useRetry: true,
    });
    let assistant = cached;
    if (!assistant) {
      assistant = await generateLanguageResponse({
        targetLanguage,
        prompt,
        messages: recentMessages,
      });
      const cachePayload = {
        segments: assistant?.segments || [],
        vocab: assistant?.vocab || [],
        miniPractice: assistant?.miniPractice || [],
      };
      await cacheSetJSON(cacheKey, cachePayload, LANGUAGE_CACHE_TTL_SEC);
      assistant = cachePayload;
    }

    const segments = assistant?.segments || [];
    const contentText = segments
      .map((seg) => `${seg.en} / ${seg.tr}`)
      .join('\n');

    await queryWithRetry(
      `
      INSERT INTO ai_language_messages
        (course_id, profile_id, user_id, role, content_text, segments_json)
     VALUES ($1::uuid, $2::int, $3::int, 'assistant', $4, $5::jsonb)

      `,
      [courseId, profileId, userId, contentText, JSON.stringify(segments)],
    );

    const playback = await buildPlaybackQueue({ segments, voices });

    const previewMessages = await loadRecentMessages(pool, courseId, PROMPT_HISTORY_LIMIT, {
      useRetry: true,
    });

    return {
      status: 200,
      data: {
        courseId,
        targetLanguage,
        entitlement: formatEntitlement(
          {
            ...entitlement,
            prompts_used: Number(entitlement.prompts_used || 0) + 1,
          },
          { promptsLimit, resetsAt },
        ),
        messagesPreview: formatMessagesPreview(previewMessages),
        assistant: { ...assistant, segments },
        playback,
      },
    };
  } catch (err) {
    if (client) {
      await rollbackQuiet(client);
      endTxTimer('rollback');
    }
    console.error('[aiLanguage] start failed', err);
    return { status: 500, data: { error: 'LANGUAGE_START_FAILED' } };
  } finally {
    if (client) client.release();
  }
}

export async function sendLanguagePrompt({
  userId,
  profileId,
  courseId,
  prompt,
  orgId,
}) {
  userId = asIntId(userId);
  profileId = asIntId(profileId);

  let client;
  let entitlement;
  let metadata = {};
  let targetLanguage;
  let updatedEnt;
  let promptsLimit = 0;
  let resetsAt = null;
  let orgLimit = null;
  const endTxTimer = startTxTimer('aiLanguage:prompt');

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const entQ = await client.query(
      `SELECT * FROM ai_language_entitlements WHERE course_id = $1::uuid FOR UPDATE`,
      [courseId],
    );
    if (!entQ.rowCount) {
      await rollbackQuiet(client);
      endTxTimer('rollback');
      return { status: 404, data: { error: 'LANGUAGE_COURSE_NOT_FOUND' } };
    }

    entitlement = entQ.rows[0];
    orgLimit = await resolveOrgPromptLimit({ orgId, userId, db: client });
    const promptLimitMeta = buildPromptLimit({ entitlementRow: entitlement, orgLimit });
    promptsLimit = promptLimitMeta.promptsLimit;
    resetsAt = promptLimitMeta.resetsAt;

    entitlement = await resetDailyPromptsIfNeeded(client, entitlement, {
      paid: promptLimitMeta.paid,
    });

    if (Number(entitlement.prompts_used || 0) >= promptsLimit) {
      await rollbackQuiet(client);
      endTxTimer('rollback');
      return {
        status: 409,
        data: {
          error: 'PROMPT_LIMIT_REACHED',
          message: 'You have reached the free prompt limit for this course.',
          needTokens: TOKEN_COST,
          promptsUsed: Number(entitlement.prompts_used || 0),
          promptsLimit,
          resetsAt,
          bundleBlocked: true,
        },
      };
    }

    await client.query(
      `
      UPDATE ai_language_entitlements
         SET prompts_used = prompts_used + 1,
             updated_at = now()
       WHERE course_id = $1::uuid
      `,
      [courseId],
    );

    await client.query(
      `
      INSERT INTO ai_language_messages
        (course_id, profile_id, user_id, role, content_text)
      VALUES ($1::uuid, $2::int, $3::int, 'user', $4)

      `,
      [courseId, profileId, userId, prompt],
    );

    const courseQ = await client.query(
      'SELECT metadata FROM courses WHERE id = $1::uuid',
      [courseId],
    );
    metadata = courseQ.rows?.[0]?.metadata || {};
    targetLanguage = entitlement.target_language;
    updatedEnt = {
      ...entitlement,
      prompts_used: Number(entitlement.prompts_used || 0) + 1,
    };

    await client.query('COMMIT');
    endTxTimer('commit');

  } catch (err) {
    if (client) {
      await rollbackQuiet(client);
      endTxTimer('rollback');
    }
    console.error('[aiLanguage] prompt failed', err);
    return { status: 500, data: { error: 'LANGUAGE_PROMPT_FAILED' } };
  } finally {
    if (client) client.release();
  }

  try {
    const voices = await resolveVoices(pool, courseId, targetLanguage, metadata, {
      useRetry: true,
    });
    const cacheKey = buildLanguageCacheKey({
      courseId,
      prompt,
      targetLanguage,
      voices,
    });
    const cached = await cacheGetJSON(cacheKey);

    const messages = await loadRecentMessages(pool, courseId, PROMPT_HISTORY_LIMIT, {
      useRetry: true,
    });
    let assistant = cached;
    if (!assistant) {
      assistant = await generateLanguageResponse({
        targetLanguage,
        prompt,
        messages,
      });
      const cachePayload = {
        segments: assistant?.segments || [],
        vocab: assistant?.vocab || [],
        miniPractice: assistant?.miniPractice || [],
      };
      await cacheSetJSON(cacheKey, cachePayload, LANGUAGE_CACHE_TTL_SEC);
      assistant = cachePayload;
    }

    const segments = assistant?.segments || [];
    const contentText = segments
      .map((seg) => `${seg.en} / ${seg.tr}`)
      .join('\n');

    await queryWithRetry(
      `
      INSERT INTO ai_language_messages
        (course_id, profile_id, user_id, role, content_text, segments_json)
      VALUES ($1::uuid, $2::int, $3::int, 'assistant', $4, $5::jsonb)

      `,
      [courseId, profileId, userId, contentText, JSON.stringify(segments)],
    );

    const playback = await buildPlaybackQueue({ segments, voices });

    return {
      status: 200,
      data: {
        assistant: { ...assistant, segments },
        playback,
        entitlement: formatEntitlement(updatedEnt, { promptsLimit, resetsAt }),
      },
    };
  } catch (err) {
    console.error('[aiLanguage] prompt failed', err);
    return { status: 500, data: { error: 'LANGUAGE_PROMPT_FAILED' } };
  }
}

export async function purchaseLanguageBundle({ userId, courseId }) {
  const endTxTimer = startTxTimer('aiLanguage:purchase');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const entQ = await client.query(
      `SELECT * FROM ai_language_entitlements WHERE course_id = $1::uuid FOR UPDATE`,
      [courseId],
    );
    if (!entQ.rowCount) {
      await rollbackQuiet(client);
      endTxTimer('rollback');
      return { status: 404, data: { error: 'LANGUAGE_COURSE_NOT_FOUND' } };
    }

    const userQ = await client.query('SELECT tokens FROM users WHERE id = $1 FOR UPDATE', [
      userId,
    ]);
    const currentTokens = Number(userQ.rows?.[0]?.tokens || 0);
    if (currentTokens < TOKEN_COST) {
      await rollbackQuiet(client);
      endTxTimer('rollback');
      return {
        status: 402,
        data: {
          error: 'INSUFFICIENT_TOKENS',
          message: 'You need more tokens to unlock more prompts.',
          needTokens: TOKEN_COST,
          tokens: currentTokens,
        },
      };
    }

    await client.query('UPDATE users SET tokens = tokens - $2 WHERE id = $1', [
      userId,
      TOKEN_COST,
    ]);

    const updatedQ = await client.query(
      `
      UPDATE ai_language_entitlements
         SET prompt_bundles = 1,
             prompts_per_bundle = $2,
             updated_at = now()
       WHERE course_id = $1::uuid
       RETURNING *
      `,
      [courseId, PAID_PROMPTS_LIMIT],
    );

    await client.query('COMMIT');
    endTxTimer('commit');

    return {
      status: 200,
      data: { entitlement: formatEntitlement(updatedQ.rows[0]) },
    };
  } catch (err) {
    await rollbackQuiet(client);
    endTxTimer('rollback');
    console.error('[aiLanguage] purchase bundle failed', err);
    return { status: 500, data: { error: 'LANGUAGE_BUNDLE_FAILED' } };
  } finally {
    client.release();
  }
}

export async function completeLanguageCourse({ userId, courseId }) {
  let client;
  let targetLanguage;
  let courseSize = 'mini';
  let snippetsCapped = '';
  const endTxTimer = startTxTimer('aiLanguage:complete');
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const entQ = await client.query(
      `SELECT * FROM ai_language_entitlements WHERE course_id = $1::uuid FOR UPDATE`,
      [courseId]
    );
    if (!entQ.rowCount) {
      await rollbackQuiet(client);
      endTxTimer('rollback');
      return { status: 404, data: { error: 'LANGUAGE_COURSE_NOT_FOUND' } };
    }

    const messagesQ = await client.query(
      `
      SELECT content_text, segments_json
        FROM ai_language_messages
       WHERE course_id = $1::uuid
         AND role = 'assistant'
       ORDER BY created_at DESC
       LIMIT 8
      `,
      [courseId]
    );

    targetLanguage = entQ.rows[0].target_language;

    // ✅ fetch course_size so quiz size + maxTokens are deterministic
    const courseQ = await client.query(`SELECT course_size FROM courses WHERE id = $1::uuid`, [
      courseId,
    ]);
    courseSize = courseQ.rows?.[0]?.course_size || 'mini';

    const source = messagesQ.rows || [];
    const snippets = source
      .map((row) => {
        if (Array.isArray(row.segments_json)) {
          return row.segments_json
            .map((seg) => `EN: ${seg.en}\nTR: ${seg.tr}`)
            .join('\n');
        }
        return row.content_text;
      })
      .filter(Boolean)
      .join('\n\n');

    // ✅ cap context so the model doesn't ramble
    snippetsCapped = truncateToChars(snippets, 6000);

    await client.query('COMMIT');
    endTxTimer('commit');
  } catch (err) {
    if (client) {
      await rollbackQuiet(client);
      endTxTimer('rollback');
    }
    console.error('[aiLanguage] complete failed', err);
    return { status: 500, data: { error: 'LANGUAGE_COMPLETE_FAILED' } };
  } finally {
    if (client) client.release();
  }

  try {
    const langLabel = languageLabel(targetLanguage);

    // ✅ deterministic quiz size
    const questionCount = quizQuestionCountForCourseSize(courseSize);
    const maxTokens = estimateMcqMaxTokens(questionCount);

    const system = `You are a bilingual quiz writer. Create a concise MCQ quiz to test English→${langLabel} learning. Return JSON only.`;
    const user = `Use the following learning snippets to build the quiz. Focus on translations and meaning.

${snippetsCapped || 'No snippets available. Create a general beginner quiz.'}

Requirements:
- quizType must be "mcq"
- Create EXACTLY ${questionCount} questions
- Keep each question short
- Keep explanations 1 sentence maximum
- Do NOT include any text outside JSON

Return JSON in the schema.`;

    const quiz = await aiJson({
      system,
      user,
      temperature: 0.2,
      schema: QUIZ_SCHEMA_MCQ,
      maxTokens,
    });

    const timerSec = fairTimerSec({
      count: quiz.questions?.length || questionCount,
      quizType: 'mcq',
    });

    await queryWithRetry(
      `
      UPDATE ai_language_entitlements
         SET completed_at = COALESCE(completed_at, now()),
             updated_at = now()
       WHERE course_id = $1::uuid
      `,
      [courseId]
    );

    return {
      status: 200,
      data: {
        quiz: {
          ...quiz,
          timerSec,
          courseId,
        },
      },
    };
  } catch (err) {
    console.error('[aiLanguage] complete failed', err);
    return { status: 500, data: { error: 'LANGUAGE_COMPLETE_FAILED' } };
  }
}

export async function markLanguageQuizPassed({ courseId, userId }) {
  try {
    await queryWithRetry(
      `
      UPDATE ai_language_entitlements
         SET quiz_passed = TRUE,
             updated_at = now()
       WHERE course_id = $1::uuid
         AND ($2::int IS NULL OR user_id = $2::int)

      `,
      [courseId, userId ?? null],
    );
  } catch (err) {
    dlog('aiLanguage', 'mark quiz passed failed', err?.message || err);
  }
}

export async function getLanguagePlayback({
  userId,
  profileId,
  courseId,
  messageId,
  messageIndex,
  voiceId,
}) {
  userId = asIntId(userId);
  profileId = asIntId(profileId);

  if (!courseId) return { status: 400, data: { error: 'COURSE_ID_REQUIRED' } };
  if (!voiceId) return { status: 400, data: { error: 'VOICE_ID_REQUIRED' } };

  try {
    // ✅ ownership check (no prompt consumption)
    const entQ = await runQuery(
      pool,
      `
      SELECT e.target_language, c.metadata
        FROM ai_language_entitlements e
        JOIN courses c ON c.id = e.course_id
       WHERE e.course_id = $1::uuid
         AND (
           ($2::int IS NOT NULL AND e.profile_id = $2::int)
           OR
           ($3::int IS NOT NULL AND e.user_id = $3::int)
         )
       LIMIT 1
      `,
      [courseId, profileId ?? null, userId ?? null],
      { useRetry: true },
    );

    if (!entQ.rowCount) {
      return { status: 403, data: { error: 'FORBIDDEN' } };
    }

    const targetLanguage = entQ.rows[0].target_language;
    const metadata = entQ.rows[0].metadata || {};

    // ✅ load the requested assistant message
    const msgRow = await loadAssistantMessageForPlayback(
      pool,
      courseId,
      { messageId, messageIndex },
      { useRetry: true },
    );

    if (!msgRow) {
      return { status: 404, data: { error: 'MESSAGE_NOT_FOUND' } };
    }

    let segments = msgRow.segments_json;
    if (typeof segments === 'string') {
      try {
        segments = JSON.parse(segments);
      } catch {
        segments = null;
      }
    }

    if (!Array.isArray(segments) || !segments.length) {
      return { status: 404, data: { error: 'MESSAGE_HAS_NO_SEGMENTS' } };
    }

    // ✅ voices: use style-based pair for playback (so voiceId actually matters)
    // If you want "default" voices when voiceId is unknown, chooseVoicePairForStyle handles that.
    const voices = await chooseVoicePairForStyle(targetLanguage, voiceId);

    // ✅ Redis cache key (stable per message+segments+voice)
    const segHash = sha1(JSON.stringify(segments));
    const msgKey =
      messageId != null
        ? `id:${String(messageId)}`
        : `idx:${String(messageIndex ?? 0)}:${new Date(msgRow.created_at).toISOString()}`;

    const cacheKey = `ai:lang:playback:${courseId}:${msgKey}:seg=${segHash}:style=${String(
      voiceId,
    ).toLowerCase()}:v=${voices.teacher}|${voices.translator}`;

    const cached = await cacheGetJSON(cacheKey);
    if (cached?.items?.length) {
      return { status: 200, data: cached };
    }

    // ✅ build playback (TTS layer should already cache per voice+text)
    const playback = await buildPlaybackQueue({ segments, voices });

    await cacheSetJSON(cacheKey, playback, LANGUAGE_CACHE_TTL_SEC);

    return { status: 200, data: playback };
  } catch (err) {
    console.error('[aiLanguage] playback failed', err);
    return { status: 500, data: { error: 'LANGUAGE_PLAYBACK_FAILED' } };
  }
}
