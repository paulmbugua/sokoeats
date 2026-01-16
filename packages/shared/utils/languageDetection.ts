import type { TargetLanguage } from '@mytutorapp/shared/types';

export type LanguageIntent = {
  targetLanguage: TargetLanguage;
  label: string;
};

const INTENT_PHRASES = [
  /\bteach\s+me\b/i,
  /\bi\s+want\s+to\s+learn\b/i,
  /\bi\s+want\s+to\s+study\b/i,
  /\bwant\s+to\s+learn\b/i,
  /\blearn(?:ing)?\b/i,
];

const LANGUAGE_MAP: Array<{ code: TargetLanguage; label: string; re: RegExp }> = [
  { code: 'de', label: 'German', re: /(germany|german|deutsch)/i },
  { code: 'fr', label: 'French', re: /(france|french|fran[çc]ais)/i },
  { code: 'es', label: 'Spanish', re: /(spain|spanish|espa[ñn]ol)/i },
  { code: 'ar', label: 'Arabic', re: /(arabic|arab|العربية)/i },
];

export function isLanguageIntentText(text: string): boolean {
  const value = String(text || '').trim();
  if (!value) return false;
  return INTENT_PHRASES.some((re) => re.test(value));
}

export function detectLanguageIntent(prompt: string): LanguageIntent | null {
  const text = String(prompt || '').trim();
  if (!text) return null;

  for (const entry of LANGUAGE_MAP) {
    if (entry.re.test(text)) {
      return { targetLanguage: entry.code, label: entry.label };
    }
  }

  return null;
}
