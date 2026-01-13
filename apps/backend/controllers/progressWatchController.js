// apps/backend/controllers/progressWatchController.js
import pool from '../config/db.js';

const THRESHOLD = 0.9; // 90% watch required
const MIN_SECONDS = 30; // tiny videos must still watch 30s

/** Normalize a YouTube URL (or raw id) to a stable video id string */
function normalizeYoutubeId(url = '') {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host.includes('youtu.be')) return u.pathname.slice(1);
    if (host.includes('youtube.com')) {
      if (u.pathname.startsWith('/embed/'))
        return u.pathname.split('/').pop() || '';
      return u.searchParams.get('v') || '';
    }
  } catch {
    // Not a URL — assume caller already passed an ID
    return url;
  }
  // If we got here, parsing yielded no id
  return url;
}

/** --- Write event ------------------------------------------------------ */
export async function postWatchEvent(req, res) {
  try {
    const userId = req.user?.id;
    const {
      courseId,
      week,
      provider,
      videoUrl,
      videoId,
      watchedSeconds,
      durationSeconds,
    } = req.body || {};

    if (!userId) return res.status(401).json({ error: 'auth required' });
    if (!courseId || week == null) {
      return res.status(400).json({ error: 'courseId/week required' });
    }

    const prov = String(provider || 'youtube').toLowerCase();
    const vid = String(
      videoId || normalizeYoutubeId(videoUrl || '') || videoUrl || '',
    ).trim();
    if (!vid) return res.status(400).json({ error: 'video id/url required' });

    const watched = Math.max(0, Number(watchedSeconds || 0) | 0);
    const dur = Math.max(0, Number(durationSeconds || 0) | 0);

    const completed =
      dur > 0
        ? watched >= Math.max(MIN_SECONDS, Math.ceil(dur * THRESHOLD))
        : false;

    const sql = `
      INSERT INTO course_video_watch
        (user_id, course_id, week, video_id, provider, watched_seconds, duration_seconds, completed)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (user_id, course_id, week, video_id)
      DO UPDATE SET
        watched_seconds  = GREATEST(course_video_watch.watched_seconds, EXCLUDED.watched_seconds),
        duration_seconds = GREATEST(course_video_watch.duration_seconds, EXCLUDED.duration_seconds),
        completed        = course_video_watch.completed OR EXCLUDED.completed,
        updated_at       = now()
      RETURNING user_id, course_id, week, video_id, provider, watched_seconds, duration_seconds, completed
    `;
    const { rows } = await pool.query(sql, [
      userId,
      courseId,
      Number(week),
      vid,
      prov,
      watched,
      dur,
      completed,
    ]);
    res.json(rows[0]);
  } catch (e) {
    console.error('[watch] postWatchEvent', e);
    res.status(500).json({ error: 'failed to record watch' });
  }
}

/** --- Read per-course summary ----------------------------------------- */
export async function getWatchSummary(req, res) {
  try {
    const userId = req.user?.id;
    const { courseId } = req.params;
    if (!userId) return res.status(401).json({ error: 'auth required' });
    if (!courseId) return res.status(400).json({ error: 'courseId required' });

    const { rows } = await pool.query(
      `SELECT week, video_id, provider, completed, watched_seconds, duration_seconds
         FROM course_video_watch
        WHERE user_id = $1 AND course_id = $2
        ORDER BY week ASC, video_id ASC`,
      [userId, courseId],
    );
    res.json(rows);
  } catch (e) {
    console.error('[watch] getWatchSummary', e);
    res.status(500).json({ error: 'failed to load watch summary' });
  }
}

/** --- Week requirements (from syllabus) ------------------------------- */
export async function getWeekRequirements(req, res) {
  try {
    const { courseId, week } = req.params;
    const { rows } = await pool.query(
      `SELECT syllabus FROM courses WHERE id = $1`,
      [courseId],
    );
    const syllabus = rows[0]?.syllabus || [];
    const item = Array.isArray(syllabus)
      ? syllabus.find((s) => s.week === Number(week))
      : null;

    const urls = []
      .concat(item?.videoUrls || [])
      .concat(item?.videoUrl ? [item.videoUrl] : []);
    const reqs = urls
      .map((u) => ({
        provider: 'youtube',
        videoId: normalizeYoutubeId(u),
        raw: u,
      }))
      .filter((v) => v.videoId);

    res.json({ week: Number(week), videos: reqs });
  } catch (e) {
    console.error('[watch] getWeekRequirements', e);
    res.status(500).json({ error: 'failed to load week requirements' });
  }
}

/** --- Middleware: require all videos in week watched ------------------- */
export async function ensureWeekWatched(req, res, next) {
  try {
    const userId = req.user?.id;
    const { courseId, week } = req.body || {};
    if (!userId || !courseId || week == null) {
      return res.status(400).json({ error: 'courseId/week required' });
    }

    const { rows: srows } = await pool.query(
      `SELECT syllabus FROM courses WHERE id=$1`,
      [courseId],
    );
    const syllabus = srows[0]?.syllabus || [];
    const item = Array.isArray(syllabus)
      ? syllabus.find((s) => s.week === Number(week))
      : null;

    const urls = []
      .concat(item?.videoUrls || [])
      .concat(item?.videoUrl ? [item.videoUrl] : []);
    const reqVideoIds = urls.map(normalizeYoutubeId).filter(Boolean);

    if (reqVideoIds.length === 0) return next(); // nothing to enforce

    const { rows } = await pool.query(
      `SELECT video_id, completed
         FROM course_video_watch
        WHERE user_id=$1 AND course_id=$2 AND week=$3 AND video_id = ANY($4)`,
      [userId, courseId, Number(week), reqVideoIds],
    );

    const done = new Set(
      rows.filter((r) => r.completed).map((r) => r.video_id),
    );
    const missing = reqVideoIds.filter((v) => !done.has(v));

    if (missing.length) {
      return res.status(422).json({
        error:
          'You must watch all required videos before completing this week.',
        missing,
      });
    }
    next();
  } catch (e) {
    console.error('[watch] ensureWeekWatched', e);
    res.status(500).json({ error: 'validation failed' });
  }
}

/** --- Helpers + middleware: course-wide completion -------------------- */
export async function getAllRequiredVideoIds(courseId) {
  const { rows } = await pool.query(
    `SELECT syllabus FROM courses WHERE id=$1`,
    [courseId],
  );
  const syllabus = rows[0]?.syllabus || [];
  if (!Array.isArray(syllabus)) return [];

  // Collect EVERY video (videoUrls array OR single videoUrl) across all weeks
  const urls = syllabus.flatMap((s) =>
    [].concat(s?.videoUrls || []).concat(s?.videoUrl ? [s.videoUrl] : []),
  );

  return urls.map(normalizeYoutubeId).filter(Boolean);
}

/** Ensure *every* required video in the course is completed for this user */
export async function ensureCourseFullyWatched(req, res, next) {
  // --- request tracing (helps correlate with /me logs) ---
  const rid =
    req.headers['x-request-id'] ||
    req.headers['x-correlation-id'] ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const userId = req.user?.id;
  const courseId = req.params?.courseId || req.body?.courseId;

  const meta = {
    rid,
    uid: userId,
    uidType: typeof userId,
    courseId,
    path: req.originalUrl,
    method: req.method,
  };

  try {
    console.log('[watchGate] enter', {
      ...meta,
      hasAuth: Boolean(userId),
      hasCourseId: Boolean(courseId),
      paramCourseId: req.params?.courseId,
      bodyCourseId: req.body?.courseId,
    });

    if (!userId || !courseId) {
      console.warn('[watchGate] bad_request', {
        ...meta,
        reason: 'courseId/auth required',
      });
      return res.status(400).json({ error: 'courseId/auth required' });
    }

    const t0 = Date.now();
    const required = await getAllRequiredVideoIds(courseId);

    console.log('[watchGate] required_loaded', {
      ...meta,
      requiredCount: Array.isArray(required) ? required.length : 0,
      ms: Date.now() - t0,
      // keep sample small to avoid noisy logs
      requiredSample: Array.isArray(required) ? required.slice(0, 5) : [],
    });

    if (!required || required.length === 0) {
      console.log('[watchGate] skip', {
        ...meta,
        reason: 'no required videos',
      });
      return next();
    }

    const t1 = Date.now();
    const { rows } = await pool.query(
      `SELECT DISTINCT video_id
         FROM course_video_watch
        WHERE user_id=$1 AND course_id=$2 AND completed=TRUE
          AND video_id = ANY($3)`,
      [userId, courseId, required],
    );

    console.log('[watchGate] watch_rows', {
      ...meta,
      rowCount: rows?.length || 0,
      ms: Date.now() - t1,
      doneSample: Array.isArray(rows) ? rows.slice(0, 5).map((r) => r.video_id) : [],
    });

    const done = new Set((rows || []).map((r) => r.video_id));
    const missing = required.filter((id) => !done.has(id));

    if (missing.length) {
      console.warn('[watchGate] blocked', {
        ...meta,
        requiredCount: required.length,
        doneCount: done.size,
        missingCount: missing.length,
        missingSample: missing.slice(0, 10),
      });

      return res.status(422).json({
        error: 'Please watch all course videos before continuing.',
        missing,
      });
    }

    console.log('[watchGate] pass', {
      ...meta,
      requiredCount: required.length,
      doneCount: done.size,
      msTotal: Date.now() - t0,
    });

    return next();
  } catch (e) {
    console.error('[watchGate] error', {
      ...meta,
      message: e?.message,
      code: e?.code,
      stack: e?.stack,
    });
    return res.status(500).json({ error: 'validation failed' });
  }
}