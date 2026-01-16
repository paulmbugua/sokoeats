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
  const res = await axios.post(
    `${baseOf(backendUrl)}/api/ai/courses/language/start`,
    { prompt },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data as LanguageStartResponse;
}

export async function sendLanguagePrompt(
  backendUrl: string,
  token: string,
  courseId: string,
  prompt: string
): Promise<LanguagePromptResponse> {
  const res = await axios.post(
    `${baseOf(backendUrl)}/api/ai/courses/language/prompt`,
    { courseId, prompt },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data as LanguagePromptResponse;
}

export async function purchaseLanguageBundle(
  backendUrl: string,
  token: string,
  courseId: string
): Promise<{ entitlement: LanguageLearningEntitlement }> {
  const res = await axios.post(
    `${baseOf(backendUrl)}/api/ai/courses/language/purchase-bundle`,
    { courseId },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data as { entitlement: LanguageLearningEntitlement };
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
