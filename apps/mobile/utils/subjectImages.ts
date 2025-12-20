/* eslint-disable prettier/prettier */
import type { ImageSourcePropType } from 'react-native';
import type { Course } from '@mytutorapp/shared/types';

/** --------------------------------------------------------
 * Canonical subjects → image URLs (native uses URIs)
 * ------------------------------------------------------- */
const SUBJECT_IMAGE_MAP_URL: Record<string, string> = {
  // Core academics
  mathematics:
    'https://images.pexels.com/photos/6238050/pexels-photo-6238050.jpeg?auto=compress&cs=tinysrgb&w=1400&fit=crop',
  science:
    'https://images.pexels.com/photos/8325716/pexels-photo-8325716.jpeg?auto=compress&cs=tinysrgb&w=1400&fit=crop',
  english:
    'https://images.pexels.com/photos/256541/pexels-photo-256541.jpeg?auto=compress&cs=tinysrgb&w=1400&fit=crop',
  history:
    'https://images.pexels.com/photos/27352428/pexels-photo-27352428.jpeg?auto=compress&cs=tinysrgb&w=1400&fit=crop',
  'computer science':
    'https://images.pexels.com/photos/3861976/pexels-photo-3861976.jpeg?auto=compress&cs=tinysrgb&w=1400&fit=crop',
  'foreign languages':
    'https://images.pexels.com/photos/9334542/pexels-photo-9334542.jpeg?auto=compress&cs=tinysrgb&w=1400&fit=crop',
  arts: 'https://images.pexels.com/photos/7302100/pexels-photo-7302100.jpeg?auto=compress&cs=tinysrgb&w=1400&fit=crop',
  'social studies':
    'https://images.pexels.com/photos/8617974/pexels-photo-8617974.jpeg?auto=compress&cs=tinysrgb&w=1400&fit=crop',
  business:
    'https://images.pexels.com/photos/8145328/pexels-photo-8145328.jpeg?auto=compress&cs=tinysrgb&w=1400&fit=crop',
  engineering:
    'https://images.pexels.com/photos/6285153/pexels-photo-6285153.jpeg?auto=compress&cs=tinysrgb&w=1400&fit=crop',
  law: 'https://images.pexels.com/photos/5669619/pexels-photo-5669619.jpeg?auto=compress&cs=tinysrgb&w=1400&fit=crop',
  medicine:
    'https://images.pexels.com/photos/7723510/pexels-photo-7723510.jpeg?auto=compress&cs=tinysrgb&w=1400&fit=crop',
  music:
    'https://images.pexels.com/photos/17249492/pexels-photo-17249492/free-photo-of-close-up-of-a-music-sheet-and-a-violin.jpeg?auto=compress&cs=tinysrgb&w=1400&fit=crop',
  philosophy:
    'https://images.pexels.com/photos/26887007/pexels-photo-26887007.jpeg?auto=compress&cs=tinysrgb&w=1400&fit=crop',
  psychology:
    'https://images.pexels.com/photos/8378740/pexels-photo-8378740.jpeg?auto=compress&cs=tinysrgb&w=1400&fit=crop',
  sociology:
    'https://images.pexels.com/photos/5710984/pexels-photo-5710984.jpeg?auto=compress&cs=tinysrgb&w=1400&fit=crop',

  // Quant/Science specifics
  economics:
    'https://images.pexels.com/photos/5980871/pexels-photo-5980871.jpeg?auto=compress&cs=tinysrgb&w=1400&fit=crop',
  biology:
    'https://images.pexels.com/photos/11210346/pexels-photo-11210346.jpeg?auto=compress&cs=tinysrgb&w=1400&fit=crop',
  chemistry:
    'https://images.pexels.com/photos/8326459/pexels-photo-8326459.jpeg?auto=compress&cs=tinysrgb&w=1400&fit=crop',
  physics:
    'https://images.pexels.com/photos/3845162/pexels-photo-3845162.jpeg?auto=compress&cs=tinysrgb&w=1400&fit=crop',
  finance:
    'https://images.pexels.com/photos/28165814/pexels-photo-28165814.jpeg?auto=compress&cs=tinysrgb&w=1400&fit=crop',

  // Dedicated canonicals
  statistics:
    'https://images.pexels.com/photos/7054368/pexels-photo-7054368.jpeg?auto=compress&cs=tinysrgb&w=1400&fit=crop',
  'deep learning':
    'https://images.pexels.com/photos/17485705/pexels-photo-17485705.jpeg?auto=compress&cs=tinysrgb&w=1400&fit=crop',
};

export const FALLBACK_COURSE_IMAGE_URL =
  'https://images.unsplash.com/photo-1496307042754-b4aa456c4a2d?q=80&w=1400&auto=format&fit=crop';

/** --------------------------------------------------------
 * Aliases → canonical subjects
 * ------------------------------------------------------- */
export const SUBJECT_ALIASES: Record<string, string[]> = {
  mathematics: [
    'math',
    'algebra',
    'linear algebra',
    'fractions',
    'decimals',
    'calculus',
    'discrete math',
    'combinatorics',
    'graphs',
    'equations',
    'functions',
    'pca',
    'quant',
    'optimization',
  ],
  statistics: [
    'statistics',
    'statistical',
    'probability',
    'hypothesis test',
    'hypothesis testing',
    'p-values',
    'p value',
    'confidence interval',
    'ab testing',
    'a/b testing',
    'a b testing',
    'time series',
    'forecasting',
    'econometrics',
    'regression',
    'anova',
    'data analysis',
    'pandas',
    'dataframe',
    'data frames',
    'data visualization',
    'visualization',
    'matplotlib',
    'charts',
    'plots',
    'dashboard',
    'dashboards',
    'business analytics',
    'kpis',
    'kpi',
  ],
  'deep learning': [
    'deep learning',
    'neural network',
    'neural networks',
    'cnn',
    'rnn',
    'lstm',
    'transformer',
    'attention',
    'pytorch',
    'keras',
    'autoencoder',
    'gpt',
  ],
  'computer science': [
    'data structures',
    'algorithms',
    'time complexity',
    'python',
    'javascript',
    'typescript',
    'react',
    'node',
    'graphql',
    'sql',
    'docker',
    'kubernetes',
    'cloud fundamentals',
    'git',
    'ml',
    'machine learning',
    'computer vision',
    'nlp',
    'rag',
    'prompt engineering',
  ],
  physics: [
    'mechanics',
    'motion',
    'forces',
    'thermodynamics',
    'optics',
    'electricity',
    'magnetism',
  ],
  chemistry: ['stoichiometry', 'periodic table', 'reactions', 'equilibrium'],
  biology: ['cells', 'genetics', 'evolution'],
  english: [
    'literature',
    'writing',
    'composition',
    'reading',
    'grammar',
    'public speaking',
    'presentation',
    'presentations',
    'writing skills',
    'communication',
  ],
  arts: ['art', 'drawing', 'painting', 'design', 'ui/ux', 'ux', 'ui', 'wireframes', 'prototyping'],
  'foreign languages': ['german a1', 'kiswahili', 'vocabulary', 'french', 'spanish'],
  business: [
    'marketing',
    'seo',
    'social media',
    'product management',
    'project management',
    'entrepreneurship',
  ],
  finance: ['accounting', 'personal finance', 'corporate finance'],
  economics: ['microeconomics', 'macroeconomics'],
};

/** --------------------------------------------------------
 * Priority so fine-grained buckets win over broad categories
 * ------------------------------------------------------- */
export const SUBJECT_PRIORITY = [
  'deep learning',
  'statistics',
  'computer science',
  'mathematics',
  'physics',
  'chemistry',
  'biology',
  'economics',
  'finance',
  'english',
  'foreign languages',
  'arts',
  'business',
];

/** --------------------------------------------------------
 * Utilities
 * ------------------------------------------------------- */
const resolveBackendPath = (url: string | undefined, backendUrl?: string) => {
  if (!url) return '';
  if (url.startsWith('/')) return (backendUrl ?? '').replace(/\/+$/, '') + url;
  return url;
};

const toHaystack = (...parts: Array<string | undefined>) =>
  parts.filter(Boolean).join(' ').toLowerCase();

// Accept a looser course shape so TS is happy and we can read subject/category safely.
type CourseLoose = Partial<Course> & {
  subject?: string;
  category?: string;
  image?: string;
  thumbnail_url?: string;
  thumb?: string;
  description?: string;
  title?: string;
  level?: string;
};

/** --------------------------------------------------------
 * Core matcher (Native): returns a URL string
 * ------------------------------------------------------- */
export function pickImageUriForCourse(c: CourseLoose, backendUrl?: string): string {
  // 1) Prefer explicit image from course object
  const direct = resolveBackendPath(c.image || c.thumbnail_url || c.thumb, backendUrl);
  if (direct) return direct;

  // 2) Build searchable haystack from fields
  const hay = toHaystack(c.subject, c.category, c.level, c.title, c.description);

  // 3) Priority-based match
  for (const key of SUBJECT_PRIORITY) {
    const url = SUBJECT_IMAGE_MAP_URL[key];
    const aliases = SUBJECT_ALIASES[key] || [];
    if ((url && hay.includes(key)) || aliases.some((a) => hay.includes(a))) {
      return url ?? FALLBACK_COURSE_IMAGE_URL;
    }
  }

  // 4) Fallback scan across canonicals and aliases
  for (const key of Object.keys(SUBJECT_IMAGE_MAP_URL)) {
    if (hay.includes(key)) return SUBJECT_IMAGE_MAP_URL[key] ?? FALLBACK_COURSE_IMAGE_URL;
  }
  for (const [canonical, aliases] of Object.entries(SUBJECT_ALIASES)) {
    if (aliases.some((a) => hay.includes(a))) {
      return SUBJECT_IMAGE_MAP_URL[canonical] ?? FALLBACK_COURSE_IMAGE_URL;
    }
  }

  // 5) Final fallback
  return FALLBACK_COURSE_IMAGE_URL;
}

/** --------------------------------------------------------
 * RN helper: convert URL → ImageSourcePropType
 * ------------------------------------------------------- */
const asSource = (uri: string): ImageSourcePropType => ({ uri });

/** --------------------------------------------------------
 * Public Native API
 * ------------------------------------------------------- */
export function getImageSourceForCourse(c: CourseLoose, backendUrl?: string): ImageSourcePropType {
  return asSource(pickImageUriForCourse(c, backendUrl));
}

export const SUBJECT_IMAGE_MAP_NATIVE: Record<string, ImageSourcePropType> = Object.fromEntries(
  Object.entries(SUBJECT_IMAGE_MAP_URL).map(([k, v]) => [k, asSource(v)])
);

/** --------------------------------------------------------
 * Compatibility exports (so existing screen imports work)
 *  - SUBJECT_IMAGE_MAP (string→URL)
 *  - FALLBACK_COURSE_IMAGE (URL string)
 *  - pickImageForCourse (returns URL string)
 *  - SUBJECT_ALIASES (already native-friendly)
 * ------------------------------------------------------- */
export const SUBJECT_IMAGE_MAP: Record<string, string> = SUBJECT_IMAGE_MAP_URL;
export const FALLBACK_COURSE_IMAGE: string = FALLBACK_COURSE_IMAGE_URL;
export function pickImageForCourse(c: Partial<Course>, backendUrl?: string): string {
  return pickImageUriForCourse(c, backendUrl);
}
