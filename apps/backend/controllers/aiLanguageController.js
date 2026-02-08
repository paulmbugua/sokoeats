// apps/backend/controllers/aiLanguageController.js
import { ensureProfileIdForUser } from '../services/ensureProfile.js';
import {
  startLanguageCourse,
  sendLanguagePrompt,
  purchaseLanguageBundle,
  completeLanguageCourse,
   getLanguagePlayback,
   getLanguageCourseState,
} from '../services/aiLanguageService.js';
import {
  languageStartSchema,
  languagePromptSchema,
  languagePurchaseSchema,
  languageCompleteSchema,
  languagePlaybackSchema,
  languageStateSchema,
} from '../validators/aiCoursesValidator.js';

function pickUserId(req) {
  return req.user?.users_id ?? req.user?.id ?? null;
}

export async function startLanguage(req, res) {
  const userId = pickUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { value, error } = languageStartSchema.validate(req.body, {
    abortEarly: false,
    allowUnknown: true,
  });
  if (error) {
    return res.status(400).json({
      error: 'VALIDATION_FAILED',
      message: error.message,
      details: error.details?.map((d) => d.message) || [],
    });
  }

  const profileId = await ensureProfileIdForUser(userId, { role: req.user?.role });

  const result = await startLanguageCourse({
    userId,
    profileId,
    prompt: value.prompt,
    orgId: value.orgId,
  });

  return res.status(result.status).json(result.data);
}

export async function promptLanguage(req, res) {
  const userId = pickUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { value, error } = languagePromptSchema.validate(req.body, {
    abortEarly: false,
    allowUnknown: true,
  });
  if (error) {
    return res.status(400).json({
      error: 'VALIDATION_FAILED',
      message: error.message,
      details: error.details?.map((d) => d.message) || [],
    });
  }

  const profileId = await ensureProfileIdForUser(userId, { role: req.user?.role });

  const result = await sendLanguagePrompt({
    userId,
    profileId,
    courseId: value.courseId,
    prompt: value.prompt,
    orgId: value.orgId,
  });

  return res.status(result.status).json(result.data);
}

export async function purchaseLanguage(req, res) {
  const userId = pickUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { value, error } = languagePurchaseSchema.validate(req.body, {
    abortEarly: false,
    allowUnknown: true,
  });
  if (error) {
    return res.status(400).json({
      error: 'VALIDATION_FAILED',
      message: error.message,
      details: error.details?.map((d) => d.message) || [],
    });
  }

  const result = await purchaseLanguageBundle({
    userId,
    courseId: value.courseId,
  });

  return res.status(result.status).json(result.data);
}

export async function completeLanguage(req, res) {
  const userId = pickUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { value, error } = languageCompleteSchema.validate(req.body, {
    abortEarly: false,
    allowUnknown: true,
  });
  if (error) {
    return res.status(400).json({
      error: 'VALIDATION_FAILED',
      message: error.message,
      details: error.details?.map((d) => d.message) || [],
    });
  }

  const result = await completeLanguageCourse({
    userId,
    courseId: value.courseId,
  });

  return res.status(result.status).json(result.data);
}

export async function playbackLanguage(req, res) {
  const userId = pickUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { value, error } = languagePlaybackSchema.validate(req.body, {
    abortEarly: false,
    allowUnknown: true,
  });
  if (error) {
    return res.status(400).json({
      error: 'VALIDATION_FAILED',
      message: error.message,
      details: error.details?.map((d) => d.message) || [],
    });
  }

  const profileId = await ensureProfileIdForUser(userId, { role: req.user?.role });

  const result = await getLanguagePlayback({
    userId,
    profileId,
    courseId: value.courseId,
    messageId: value.messageId ?? null,
    messageIndex: Number.isFinite(value.messageIndex) ? value.messageIndex : null,
    voiceId: value.voiceId,
  });

  return res.status(result.status).json(result.data);
}

export async function stateLanguage(req, res) {
  const userId = pickUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { value, error } = languageStateSchema.validate(req.body, {
    abortEarly: false,
    allowUnknown: true,
  });
  if (error) return res.status(400).json({ error: 'VALIDATION_FAILED', message: error.message });

  const profileId = await ensureProfileIdForUser(userId, { role: req.user?.role });

  const result = await getLanguageCourseState({
    userId,
    profileId,
    courseId: value.courseId,
    orgId: value.orgId,
  });

  return res.status(result.status).json(result.data);
}