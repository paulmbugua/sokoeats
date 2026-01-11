import type { ProgramTrack } from '../types';

export type ProgramTrackRequirements = {
  key: ProgramTrack;
  label: string;
  lessons: number;
  questions: number;
};

const REQUIREMENTS: Record<ProgramTrack, ProgramTrackRequirements> = {
  module: { key: 'module', label: 'Module', lessons: 8, questions: 16 },
  certificate: { key: 'certificate', label: 'Certificate', lessons: 12, questions: 24 },
  diploma: { key: 'diploma', label: 'Diploma', lessons: 18, questions: 36 },
  degree: { key: 'degree', label: 'Degree', lessons: 24, questions: 48 },
};

export function normalizeProgramTrack(
  input?: string | ProgramTrack | null,
  fallback: ProgramTrack | null = 'certificate',
): ProgramTrack | null {
  const raw = String(input || '').toLowerCase();
  if (raw === 'module') return 'module';
  if (raw === 'certificate') return 'certificate';
  if (raw === 'diploma') return 'diploma';
  if (raw === 'degree') return 'degree';
  return fallback;
}

export function getProgramTrackRequirements(
  input?: string | ProgramTrack | null,
  fallback: ProgramTrack = 'certificate',
): ProgramTrackRequirements {
  const key = normalizeProgramTrack(input, fallback) || fallback;
  return REQUIREMENTS[key];
}

export function resolveCourseProgramTrack(
  course: unknown,
  fallback: ProgramTrack | null = null,
): ProgramTrack | null {
  if (!course || typeof course !== 'object') return fallback;
  const raw =
    (course as any)?.programTrack ??
    (course as any)?.program_track ??
    (course as any)?.track ??
    (course as any)?.track_key ??
    (course as any)?.program_track_key;
  return normalizeProgramTrack(raw, fallback);
}
