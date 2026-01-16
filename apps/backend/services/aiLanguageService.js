// apps/backend/services/aiLanguageService.js
import pool from '../config/db.js';
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



const TOKEN_COST = 20;
const PROMPTS_PER_BUNDLE = 300;
const PROMPT_HISTORY_LIMIT = 12;
const LANGUAGE_CACHE_TTL_SEC = 60 * 60 * 24 * 14;

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

async function upsertCourseMetadata(client, courseId, metadata) {
  await client.query(
    `
    UPDATE courses
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
     WHERE id = $1::uuid
    `,
    [courseId, JSON.stringify(metadata)],
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
    [courseId, profileId, userId, targetLanguage, PROMPTS_PER_BUNDLE],
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
    prompts_per_bundle: PROMPTS_PER_BUNDLE,
    unlocked_at: new Date().toISOString(),
    completed_at: null,
    quiz_passed: false,
    metadata,
  };
}

function formatEntitlement(row) {
  if (!row) return null;
  const promptsPerBundle = Number(row.prompts_per_bundle || PROMPTS_PER_BUNDLE);
  const bundles = Number(row.prompt_bundles || 1);
  const used = Number(row.prompts_used || 0);
  return {
    courseId: row.course_id,
    profileId: row.profile_id,
    userId: row.user_id,
    targetLanguage: row.target_language,
    promptBundles: bundles,
    promptsUsed: used,
    promptsPerBundle,
    promptsLimit: bundles * promptsPerBundle,
    unlockedAt: row.unlocked_at,
    completedAt: row.completed_at,
    quizPassed: row.quiz_passed,
  };
}

async function loadRecentMessages(client, courseId, limit = PROMPT_HISTORY_LIMIT) {
  const q = await client.query(
    `
    SELECT role, content_text, segments_json, created_at
      FROM ai_language_messages
     WHERE course_id = $1::uuid
     ORDER BY created_at DESC
     LIMIT $2
    `,
    [courseId, limit],
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

  return aiJson({ system, user, temperature: 0.4, schema, maxTokens: 900 });
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

async function resolveVoices(client, courseId, targetLanguage, metadata) {
  if (metadata?.voices?.teacher && metadata?.voices?.translator) return metadata.voices;

  const voices = await chooseVoicePair(targetLanguage);
  await upsertCourseMetadata(client, courseId, { voices });
  return voices;
}

export async function startLanguageCourse({ userId, profileId, prompt }) {
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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const entitlementRow = await ensureLanguageCourse({
      client,
      userId,
      profileId,
      prompt,
      targetLanguage,
    });

    const courseId = entitlementRow.course_id;
    const metadata = entitlementRow.metadata || {};

    const entitlementQ = await client.query(
      `SELECT * FROM ai_language_entitlements WHERE course_id = $1::uuid FOR UPDATE`,
      [courseId],
    );
    const entitlement = entitlementQ.rows[0];

    const promptsLimit =
      Number(entitlement.prompt_bundles || 1) *
      Number(entitlement.prompts_per_bundle || PROMPTS_PER_BUNDLE);

    if (Number(entitlement.prompts_used || 0) >= promptsLimit) {
      await client.query('ROLLBACK');
      return {
        status: 402,
        data: {
          error: 'PROMPT_BUNDLE_EXHAUSTED',
          message: 'You have reached the prompt limit for this bundle.',
          needTokens: TOKEN_COST,
          promptsUsed: Number(entitlement.prompts_used || 0),
          promptsLimit,
        },
      };
    }

    if (Number(entitlement.prompts_used || 0) === 0) {
      const userQ = await client.query(
        'SELECT tokens FROM users WHERE id = $1 FOR UPDATE',
        [userId],
      );
      const currentTokens = Number(userQ.rows?.[0]?.tokens || 0);
      if (currentTokens < TOKEN_COST) {
        await client.query('ROLLBACK');
        return {
          status: 402,
          data: {
            error: 'INSUFFICIENT_TOKENS',
            message: 'You need more tokens to start this language course.',
            needTokens: TOKEN_COST,
            tokens: currentTokens,
          },
        };
      }

      await client.query('UPDATE users SET tokens = tokens - $2 WHERE id = $1', [
        userId,
        TOKEN_COST,
      ]);
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

    const voices = await resolveVoices(
      client,
      courseId,
      targetLanguage,
      metadata,
    );
    const cacheKey = buildLanguageCacheKey({
      courseId,
      prompt,
      targetLanguage,
      voices,
    });
    const cached = await cacheGetJSON(cacheKey);

    const recentMessages = await loadRecentMessages(client, courseId);
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

    await client.query(
      `
      INSERT INTO ai_language_messages
        (course_id, profile_id, user_id, role, content_text, segments_json)
     VALUES ($1::uuid, $2::int, $3::int, 'assistant', $4, $5::jsonb)

      `,
      [courseId, profileId, userId, contentText, JSON.stringify(segments)],
    );

    const playback = await buildPlaybackQueue({ segments, voices });

    const previewMessages = await loadRecentMessages(client, courseId);

    await client.query('COMMIT');

    return {
      status: 200,
      data: {
        courseId,
        targetLanguage,
        entitlement: formatEntitlement({
          ...entitlement,
          prompts_used: Number(entitlement.prompts_used || 0) + 1,
        }),
        messagesPreview: formatMessagesPreview(previewMessages),
        assistant: { ...assistant, segments },
        playback,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[aiLanguage] start failed', err);
    return { status: 500, data: { error: 'LANGUAGE_START_FAILED' } };
  } finally {
    client.release();
  }
}

export async function sendLanguagePrompt({
  userId,
  profileId,
  courseId,
  prompt,
}) {

  userId = asIntId(userId);
  profileId = asIntId(profileId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const entQ = await client.query(
      `SELECT * FROM ai_language_entitlements WHERE course_id = $1::uuid FOR UPDATE`,
      [courseId],
    );
    if (!entQ.rowCount) {
      await client.query('ROLLBACK');
      return { status: 404, data: { error: 'LANGUAGE_COURSE_NOT_FOUND' } };
    }

    const entitlement = entQ.rows[0];
    const promptsLimit =
      Number(entitlement.prompt_bundles || 1) *
      Number(entitlement.prompts_per_bundle || PROMPTS_PER_BUNDLE);

    if (Number(entitlement.prompts_used || 0) >= promptsLimit) {
      await client.query('ROLLBACK');
      return {
        status: 402,
        data: {
          error: 'PROMPT_BUNDLE_EXHAUSTED',
          message: 'You have reached the prompt limit for this bundle.',
          needTokens: TOKEN_COST,
          promptsUsed: Number(entitlement.prompts_used || 0),
          promptsLimit,
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
    const metadata = courseQ.rows?.[0]?.metadata || {};
    const voices = await resolveVoices(
      client,
      courseId,
      entitlement.target_language,
      metadata,
    );
    const cacheKey = buildLanguageCacheKey({
      courseId,
      prompt,
      targetLanguage: entitlement.target_language,
      voices,
    });
    const cached = await cacheGetJSON(cacheKey);

    const messages = await loadRecentMessages(client, courseId);
    const targetLanguage = entitlement.target_language;
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

    await client.query(
      `
      INSERT INTO ai_language_messages
        (course_id, profile_id, user_id, role, content_text, segments_json)
      VALUES ($1::uuid, $2::int, $3::int, 'assistant', $4, $5::jsonb)

      `,
      [courseId, profileId, userId, contentText, JSON.stringify(segments)],
    );

    const playback = await buildPlaybackQueue({ segments, voices });

    const updatedEnt = {
      ...entitlement,
      prompts_used: Number(entitlement.prompts_used || 0) + 1,
    };

    await client.query('COMMIT');

    return {
      status: 200,
      data: {
        assistant: { ...assistant, segments },
        playback,
        entitlement: formatEntitlement(updatedEnt),
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[aiLanguage] prompt failed', err);
    return { status: 500, data: { error: 'LANGUAGE_PROMPT_FAILED' } };
  } finally {
    client.release();
  }
}

export async function purchaseLanguageBundle({ userId, courseId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const entQ = await client.query(
      `SELECT * FROM ai_language_entitlements WHERE course_id = $1::uuid FOR UPDATE`,
      [courseId],
    );
    if (!entQ.rowCount) {
      await client.query('ROLLBACK');
      return { status: 404, data: { error: 'LANGUAGE_COURSE_NOT_FOUND' } };
    }

    const userQ = await client.query('SELECT tokens FROM users WHERE id = $1 FOR UPDATE', [
      userId,
    ]);
    const currentTokens = Number(userQ.rows?.[0]?.tokens || 0);
    if (currentTokens < TOKEN_COST) {
      await client.query('ROLLBACK');
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
         SET prompt_bundles = prompt_bundles + 1,
             updated_at = now()
       WHERE course_id = $1::uuid
       RETURNING *
      `,
      [courseId],
    );

    await client.query('COMMIT');

    return {
      status: 200,
      data: { entitlement: formatEntitlement(updatedQ.rows[0]) },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[aiLanguage] purchase bundle failed', err);
    return { status: 500, data: { error: 'LANGUAGE_BUNDLE_FAILED' } };
  } finally {
    client.release();
  }
}

export async function completeLanguageCourse({ userId, courseId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const entQ = await client.query(
      `SELECT * FROM ai_language_entitlements WHERE course_id = $1::uuid FOR UPDATE`,
      [courseId],
    );
    if (!entQ.rowCount) {
      await client.query('ROLLBACK');
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
      [courseId],
    );

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

    const langLabel = languageLabel(entQ.rows[0].target_language);
    const system = `You are a bilingual quiz writer. Create a concise quiz to test English→${langLabel} learning.`;
    const user = `Use the following learning snippets to build the quiz. Focus on translations and meaning.\n\n${snippets}\n\nReturn JSON in the schema.`;

    const quiz = await aiJson({
      system,
      user,
      temperature: 0.2,
      schema: QUIZ_SCHEMA_MCQ,
      maxTokens: 900,
    });

    const timerSec = fairTimerSec({ count: quiz.questions?.length || 5, quizType: 'mcq' });

    await client.query(
      `
      UPDATE ai_language_entitlements
         SET completed_at = COALESCE(completed_at, now()),
             updated_at = now()
       WHERE course_id = $1::uuid
      `,
      [courseId],
    );

    await client.query('COMMIT');

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
    await client.query('ROLLBACK');
    console.error('[aiLanguage] complete failed', err);
    return { status: 500, data: { error: 'LANGUAGE_COMPLETE_FAILED' } };
  } finally {
    client.release();
  }
}

export async function markLanguageQuizPassed({ courseId, userId }) {
  try {
    await pool.query(
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
