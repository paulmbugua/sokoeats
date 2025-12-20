// apps/backend/middleware/normalizeCourseSize.js
const VALID = new Set([
  'mini',
  'standard',
  'extended',
  'deep_dive',
  'bootcamp',
]);
const LEGACY_TO_NEW = Object.freeze({
  micro: 'mini',
  short: 'standard',
  standard: 'standard',
  deep_dive: 'deep_dive',
  // add more aliases if you like:
  // long: 'extended',
  // 'deep dive': 'deep_dive',
});

function normKey(v) {
  if (v == null) return undefined;
  return String(v)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function normalizeCourseSize(req, res, next) {
  req.body ||= {};
  req.query ||= {};

  const headerCourseSize = req.get?.('x-course-size') || req.get?.('x-size');

  const raw = {
    bodyCourseSize: req.body.courseSize,
    bodySize: req.body.size,
    queryCourseSize: req.query.courseSize,
    querySize: req.query.size,
    headerCourseSize,
  };

  // precedence: body.courseSize → body.size → query.courseSize → query.size → header
  const src =
    raw.bodyCourseSize ??
    raw.bodySize ??
    raw.queryCourseSize ??
    raw.querySize ??
    raw.headerCourseSize;

  const k = normKey(src);

  let mapped;
  if (k && VALID.has(k)) {
    mapped = k;
  } else if (k && LEGACY_TO_NEW[k]) {
    mapped = LEGACY_TO_NEW[k];
  }

  // optional default via env
  const envDefault = normKey(process.env.DEFAULT_COURSE_SIZE);
  const DEFAULT = envDefault && VALID.has(envDefault) ? envDefault : null;

  if (mapped) req.body.courseSize = mapped;
  else if (DEFAULT && req.body.courseSize == null)
    req.body.courseSize = DEFAULT;

  // drop legacy keys to prevent confusion
  if ('size' in req.body) delete req.body.size;
  if ('size' in req.query) delete req.query.size;

  // expose for downstream + quick debugging
  res.locals.courseSize = req.body.courseSize || null;
  if (res.locals.courseSize) {
    try {
      res.set('X-Normalized-CourseSize', res.locals.courseSize);
    } catch {}
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('[mw:normalizeCourseSize]', {
      raw,
      normalized: mapped || null,
      effective: res.locals.courseSize,
      path: req.path,
      method: req.method,
    });
  }

  next();
}
