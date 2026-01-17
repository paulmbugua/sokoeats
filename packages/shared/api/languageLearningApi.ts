import axios from 'axios';
import type {
  LanguageLearningEntitlement,
  LanguageLearningMessage,
  LanguageLearningAssistant,
  PlaybackPayload,
  TargetLanguage,
} from '@mytutorapp/shared/types';

const baseOf = (backendUrl: string) => backendUrl.replace(/\/+$/, '');

export type LanguageStartResponse = {
  courseId: string;
  targetLanguage: TargetLanguage;
  entitlement: LanguageLearningEntitlement;
  messagesPreview: LanguageLearningMessage[];
  assistant: LanguageLearningAssistant;
  playback: PlaybackPayload;
};

export type LanguagePromptResponse = {
  assistant: LanguageLearningAssistant;
  playback: PlaybackPayload;
  entitlement: LanguageLearningEntitlement;
};

export async function startLanguageCourse(
  backendUrl: string,
  token: string,
  prompt: string
): Promise<LanguageStartResponse> {
  try {
    const res = await axios.post(
      `${baseOf(backendUrl)}/api/ai/courses/language/start`,
      { prompt },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data as LanguageStartResponse;
  } catch (err: any) {
    const data = err?.response?.data ?? {};
    if (!data.courseId) {
      data.courseId =
        data?.course_id ||
        data?.entitlement?.courseId ||
        data?.entitlement?.course_id ||
        data?.languageStart?.courseId ||
        data?.languageStart?.course_id ||
        data?.data?.courseId ||
        data?.data?.course_id ||
        null;
    }
    const e: any = new Error(
      data?.message || data?.error || err?.message || 'Unable to start language learning.'
    );
    e.status = err?.response?.status;
    e.data = data; // ✅ IMPORTANT: makes UI gating consistent
    throw e;
  }
}

export async function sendLanguagePrompt(
  backendUrl: string,
  token: string,
  courseId: string,
  prompt: string
): Promise<LanguagePromptResponse> {
  try {
    const res = await axios.post(
      `${baseOf(backendUrl)}/api/ai/courses/language/prompt`,
      { courseId, prompt },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data as LanguagePromptResponse;
  } catch (err: any) {
    const data = err?.response?.data ?? {};
    const e: any = new Error(data?.message || data?.error || err?.message || 'Prompt failed.');
    e.status = err?.response?.status;
    e.data = data;
    throw e;
  }
}

export async function purchaseLanguageBundle(
  backendUrl: string,
  token: string,
  courseId: string
): Promise<{ entitlement: LanguageLearningEntitlement }> {
  try {
    const res = await axios.post(
      `${baseOf(backendUrl)}/api/ai/courses/language/purchase-bundle`,
      { courseId },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data as { entitlement: LanguageLearningEntitlement };
  } catch (err: any) {
    const data = err?.response?.data ?? {};
    const e: any = new Error(
      data?.message || data?.error || err?.message || 'Unable to purchase bundle.'
    );
    e.status = err?.response?.status;
    e.data = data;
    throw e;
  }
}


export async function completeLanguageCourse(
  backendUrl: string,
  token: string,
  courseId: string
): Promise<{ quiz: any }> {
  const res = await axios.post(
    `${baseOf(backendUrl)}/api/ai/courses/language/complete`,
    { courseId },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data as { quiz: any };
}
