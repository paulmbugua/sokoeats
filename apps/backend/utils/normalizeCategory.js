import { validCategories } from '../validators/profileValidators.js';

const CANON = new Set(validCategories);

// maps old/variant values -> new canonical
const MAP = {
  'programming': 'Technology & Computing',
  'technology': 'Technology & Computing',
  'technology & computing': 'Technology & Computing',
  'computing': 'Technology & Computing',
  'art & design': 'Arts',
  'arts & design': 'Arts',
  'art and design': 'Arts',
  'wellness': 'Wellness & PE',
  'wellness & pe': 'Wellness & PE',
  'pe': 'Wellness & PE',
  'physical education': 'Wellness & PE',
  'business and economics': 'Business & Economics',
  'business & economics': 'Business & Economics',
  'social studies': 'Social Studies',
};

export function normalizeCategory(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return '';

  // exact match fast path
  if (CANON.has(raw)) return raw;

  const key = raw.toLowerCase();
  const mapped = MAP[key];

  if (mapped && CANON.has(mapped)) return mapped;

  // last resort: try case-insensitive match to canonical set
  for (const c of CANON) {
    if (c.toLowerCase() === key) return c;
  }

  return raw; // let Joi reject truly unknown values
}
