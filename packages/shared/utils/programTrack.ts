import type { ProgramTrack } from '../types';
import {
  getRequiredQuestions,
  getRequiredWeeks,
  normalizeProgramTrack,
} from './programTrackRequirements';

export type ProgramTrackRequirements = {
  key: ProgramTrack;
  label: string;
  lessons: number;
  questions: number;
};

const REQUIREMENTS: Record<ProgramTrack, ProgramTrackRequirements> = {
  module: {
    key: 'module',
    label: 'Module',
    lessons: getRequiredWeeks('module'),
    questions: getRequiredQuestions('module'),
  },
  certificate: {
    key: 'certificate',
    label: 'Certificate',
    lessons: getRequiredWeeks('certificate'),
    questions: getRequiredQuestions('certificate'),
  },
  diploma: {
    key: 'diploma',
    label: 'Diploma',
    lessons: getRequiredWeeks('diploma'),
    questions: getRequiredQuestions('diploma'),
  },
  degree: {
    key: 'degree',
    label: 'Degree',
    lessons: getRequiredWeeks('degree'),
    questions: getRequiredQuestions('degree'),
  },
};

export { normalizeProgramTrack };

export function getProgramTrackRequirements(
  input?: string | ProgramTrack | null,
  fallback: ProgramTrack = 'certificate',
): ProgramTrackRequirements {
  const key = input ? normalizeProgramTrack(input) : fallback;
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
  if (!raw) return fallback;
  return normalizeProgramTrack(raw);
}
