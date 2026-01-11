import type { ProgramTrack } from '../types';

export const REQUIRED_WEEKS_BY_TRACK = {
  certificate: 12,
  diploma: 18,
  degree: 24,
} as const;

export const REQUIRED_QUESTIONS_BY_TRACK = {
  certificate: 24,
  diploma: 36,
  degree: 48,
} as const;

const MODULE_WEEKS = 8;
const MODULE_QUESTIONS = 16;

export function normalizeProgramTrack(input: unknown): ProgramTrack {
  const raw = String(input ?? '').trim().toLowerCase();
  if (raw === 'module') return 'module';
  if (raw === 'certificate') return 'certificate';
  if (raw === 'diploma') return 'diploma';
  if (raw === 'degree') return 'degree';
  return 'certificate';
}

export function getRequiredWeeks(track: ProgramTrack): number {
  const normalized = normalizeProgramTrack(track);
  if (normalized === 'module') return MODULE_WEEKS;
  return REQUIRED_WEEKS_BY_TRACK[normalized];
}

export function getRequiredQuestions(track: ProgramTrack): number {
  const normalized = normalizeProgramTrack(track);
  if (normalized === 'module') return MODULE_QUESTIONS;
  return REQUIRED_QUESTIONS_BY_TRACK[normalized];
}
