// packages/shared/api/oerApi.ts
import type { OerCatalogItem, OerMeta, Course, SyllabusItem } from '@mytutorapp/shared/types';

/* ----------------------------------------------------------------------------
 * Shared helpers / defaults for OER-backed "Course" objects
 * --------------------------------------------------------------------------*/
const OER_PROVIDER = 'oer';

// Adjust these two defaults to match your Course type exactly.
// If Course['tutorId'] is a number, set 0. If it's a string, 'oer' is fine.
const OER_TUTOR_ID: Course['tutorId'] = 'oer' as any;

// If Course['createdAt'] is a Date in your model, switch to new Date(0) as any.
const OER_CREATED_AT: Course['createdAt'] = new Date(0).toISOString() as any;

const ensureArray = <T>(x: T | T[] | undefined | null): T[] =>
  Array.isArray(x) ? x : x ? [x] : [];

/* ----------------------------------------------------------------------------
 * Existing catalog + meta + wrap
 * --------------------------------------------------------------------------*/

export type OerListParams = {
  baseUrl: string;
  token?: string;
  type?: 'video' | 'text';
  subject?: string;
  provider?: string;
  limit?: number;
  offset?: number;
};

export async function fetchOerCatalog(params: OerListParams): Promise<OerCatalogItem[]> {
  const { baseUrl, token, type, subject, provider, limit, offset } = params;
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/api/oer/catalog`);
  if (type) url.searchParams.set('type', type);
  if (subject) url.searchParams.set('subject', subject);
  if (provider) url.searchParams.set('provider', provider);
  if (limit) url.searchParams.set('limit', String(limit));
  if (offset) url.searchParams.set('offset', String(offset));

  const res = await fetch(url.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function wrapOerItem(params: {
  baseUrl: string;
  token?: string;
  slug: string;
}): Promise<{ courseId: string; firstLessonWeek: number }> {
  const { baseUrl, token, slug } = params;
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/oer/wrap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ slug }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchOerMeta(params: {
  baseUrl: string;
  token?: string;
  courseId: string;
}): Promise<OerMeta> {
  const { baseUrl, token, courseId } = params;
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/oer/meta/${courseId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    if (res.status === 404) return null as unknown as OerMeta;
    throw new Error(await res.text());
  }
  return res.json();
}

/* ----------------------------------------------------------------------------
 * NEW: OER Courses (collections-as-courses)
 * GET /api/oer/courses
 * GET /api/oer/courses/:idOrTitle
 * --------------------------------------------------------------------------*/

// ----------------------- Backend response shapes ----------------------------

type RawOerCourseListItem = {
  id: string;
  slug?: string | null;
  title: string;
  description?: string | null;
  subject?: string | null;
  thumbnail_url?: string | null;
  items_count?: number; // number of catalog items linked
  level?: string | null; // optional, backend may not set
  price?: number | null; // optional (we’ll force to 0)
  priceLabel?: string | null; // optional, e.g., "Free"
  provider?: string | null; // optional, hint for UI
  kind?: 'collection' | 'book' | string | null;
};

type RawOerCourseDetailItem = {
  week: number;
  topic: string;
  thumbnail_url?: string | null;
  // These may be present in different shapes; we normalise.
  videoUrl?: string | null;
  videoUrls?: string[] | null;
  notesUrl?: string | null;
  notesUrls?: string[] | null;
};

type RawOerCourseDetail = {
  id: string;
  title: string;
  description?: string | null;
  subject?: string | null;
  thumbnail_url?: string | null;
  provider?: string | null;
  level?: string | null;
  price?: number | null;
  priceLabel?: string | null;
  syllabus: RawOerCourseDetailItem[];
};

// ---------------------------- Mappers --------------------------------------

const toCourseCard = (r: RawOerCourseListItem): Course => {
  return {
    id: r.id,
    ...(r.slug ? { slug: r.slug } : {}),
    ...(r.kind ? { kind: r.kind } : {}),
    title: r.title,
    description: r.description ?? '',
    subject: r.subject ?? undefined,
    thumbnail_url: r.thumbnail_url ?? undefined,
    level: r.level ?? 'All Levels',
    price: typeof r.price === 'number' ? r.price : 0,
    priceLabel: r.priceLabel ?? 'Free',
    provider: (r.provider as any) ?? OER_PROVIDER,
    items_count: r.items_count ?? undefined,

    // Required fields in shared Course
    tutorId: OER_TUTOR_ID,
    createdAt: OER_CREATED_AT,

    // No lessons on list view; details endpoint provides syllabus
    syllabus: [],
  } as unknown as Course;
};

const toCourseDetail = (r: RawOerCourseDetail): Course => {
  const mapLesson = (it: RawOerCourseDetailItem): SyllabusItem => {
    const videoUrls = ensureArray(it.videoUrls)
      .concat(ensureArray(it.videoUrl))
      .filter(Boolean) as string[];

    const notesUrls = ensureArray(it.notesUrls)
      .concat(ensureArray(it.notesUrl))
      .filter(Boolean) as string[];

    return {
      week: it.week,
      topic: it.topic,
      // keep single + plural for downstream compatibility
      videoUrl: videoUrls[0],
      videoUrls,
      notesUrl: notesUrls[0],
      notesUrls,
      thumbnail_url: it.thumbnail_url ?? undefined,
    } as SyllabusItem;
  };

  return {
    id: r.id,
    title: r.title,
    description: r.description ?? '',
    subject: r.subject ?? undefined,
    thumbnail_url: r.thumbnail_url ?? undefined,
    provider: (r.provider as any) ?? OER_PROVIDER,
    level: r.level ?? 'All Levels',
    price: typeof r.price === 'number' ? r.price : 0,
    priceLabel: r.priceLabel ?? 'Free',
    syllabus: (r.syllabus || []).map(mapLesson),

    // Required fields in shared Course
    tutorId: OER_TUTOR_ID,
    createdAt: OER_CREATED_AT,
  } as unknown as Course;
};

// ------------------------------ API calls ----------------------------------

export async function fetchOerCourses(params: {
  baseUrl: string;
  limit?: number;
  offset?: number;
  subject?: string;
}): Promise<Course[]> {
  const { baseUrl, limit, offset, subject } = params;
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/api/oer/courses`);
  if (limit != null) url.searchParams.set('limit', String(limit));
  if (offset != null) url.searchParams.set('offset', String(offset));
  if (subject) url.searchParams.set('subject', subject);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(await res.text());
  const data: RawOerCourseListItem[] = await res.json();
  return (Array.isArray(data) ? data : []).map(toCourseCard);
}

export async function fetchOerCourse(params: {
  baseUrl: string;
  idOrTitle: string; // accepts UUID or exact title (case-insensitive)
}): Promise<Course> {
  const { baseUrl, idOrTitle } = params;
  const res = await fetch(
    `${baseUrl.replace(/\/$/, '')}/api/oer/courses/${encodeURIComponent(idOrTitle)}`
  );
  if (!res.ok) throw new Error(await res.text());
  const data: RawOerCourseDetail = await res.json();
  return toCourseDetail(data);
}

export async function wrapOerBook(params: { baseUrl: string; token?: string; idOrSlug: string }) {
  const { baseUrl, token, idOrSlug } = params;
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/oer/wrap-book`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ idOrSlug }),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => 'Failed to wrap book'));
  return res.json() as Promise<{ courseId: string; firstLessonWeek: number }>;
}
