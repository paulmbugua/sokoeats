import pool from '../config/db.js';

const READ_PCT = 0.9; // require 90% scroll OR …
const WORDS_PCT = 0.85; // 85% of words “seen”
const MIN_SECS = 60; // at least a minute engaged for tiny pages

function normalizeUrl(s = '') {
  try {
    return new URL(s).toString();
  } catch {
    return String(s || '').trim();
  }
}

/** POST /api/progress/read
 * body: { courseId, week, sourceUrl, wordsRead, totalWords, scrolledPct, secondsActive }
 */
export async function postReadEvent(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'auth required' });

    const {
      courseId,
      week,
      sourceUrl,
      wordsRead = 0,
      totalWords = 0,
      scrolledPct = 0,
      secondsActive = 0,
    } = req.body || {};
    if (!courseId || week == null || !sourceUrl) {
      return res
        .status(400)
        .json({ error: 'courseId/week/sourceUrl required' });
    }

    const words = Math.max(0, Number(wordsRead) | 0);
    const total = Math.max(0, Number(totalWords) | 0);
    const pct = Math.max(0, Math.min(1, Number(scrolledPct)));
    const secs = Math.max(0, Number(secondsActive) | 0);

    const enoughPct = pct >= READ_PCT;
    const enoughWords =
      total > 0 ? words >= Math.ceil(total * WORDS_PCT) : false;
    const enoughSecs =
      secs >= Math.max(MIN_SECS, Math.min(1200, Math.ceil(total / 3))); // ~200wpm heuristic

    const completed = Boolean(enoughPct || enoughWords || enoughSecs);

    const sql = `
      INSERT INTO course_text_read
        (user_id, course_id, week, source_url, words_read, total_words, scrolled_pct, seconds_active, completed)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (user_id, course_id, week, source_url)
      DO UPDATE SET
        words_read    = GREATEST(course_text_read.words_read, EXCLUDED.words_read),
        total_words   = GREATEST(course_text_read.total_words, EXCLUDED.total_words),
        scrolled_pct  = GREATEST(course_text_read.scrolled_pct, EXCLUDED.scrolled_pct),
        seconds_active= GREATEST(course_text_read.seconds_active, EXCLUDED.seconds_active),
        completed     = course_text_read.completed OR EXCLUDED.completed,
        updated_at    = now()
      RETURNING *`;
    const { rows } = await pool.query(sql, [
      userId,
      courseId,
      Number(week),
      normalizeUrl(sourceUrl),
      words,
      total,
      pct,
      secs,
      completed,
    ]);
    res.json(rows[0]);
  } catch (e) {
    console.error('[read] postReadEvent', e);
    res.status(500).json({ error: 'failed to record read' });
  }
}

/** GET /api/progress/read/:courseId */
export async function getReadSummary(req, res) {
  try {
    const userId = req.user?.id;
    const { courseId } = req.params;
    if (!userId) return res.status(401).json({ error: 'auth required' });
    const { rows } = await pool.query(
      `SELECT week, source_url, scrolled_pct, seconds_active, words_read, total_words, completed
         FROM course_text_read
        WHERE user_id=$1 AND course_id=$2
        ORDER BY week ASC, source_url ASC`,
      [userId, courseId],
    );
    res.json(rows);
  } catch (e) {
    console.error('[read] getReadSummary', e);
    res.status(500).json({ error: 'failed to load read summary' });
  }
}

/** GET /api/courses/:courseId/weeks/:week/read-reqs */
export async function getWeekReadRequirements(req, res) {
  try {
    const { courseId, week } = req.params;
    const { rows } = await pool.query(
      `SELECT syllabus FROM courses WHERE id=$1`,
      [courseId],
    );
    const syllabus = rows[0]?.syllabus || [];
    const item = Array.isArray(syllabus)
      ? syllabus.find((s) => s.week === Number(week))
      : null;

    const urls = []
      .concat(item?.notesUrls || [])
      .concat(item?.notesUrl ? [item.notesUrl] : [])
      .filter(Boolean)
      .map((u) => ({ sourceUrl: normalizeUrl(u) }));

    res.json({ week: Number(week), pages: urls });
  } catch (e) {
    console.error('[read] getWeekReadRequirements', e);
    res.status(500).json({ error: 'failed to load week read requirements' });
  }
}
