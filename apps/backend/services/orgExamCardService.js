import pool from '../config/db.js';

const percentOf = (score, max) => {
  const s = Number(score);
  const m = Number(max);
  if (!Number.isFinite(s) || !Number.isFinite(m) || m <= 0) return null;
  return (s / m) * 100;
};

// Plain numeric rank – no st/nd/rd/th
const computeOrdinalRank = (n) => {
  const num = Number(n);
  if (!Number.isFinite(num) || num <= 0) return null;
  return String(num); // "1", "2", "13" etc.
};

export async function getStudentExamCard({ orgId, sessionId, studentUserId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── ORG META (now includes signature_url) ──
    const orgRes = await client.query(
      `select
        id,
        name,
        slug,
        logo_url,
        signature_url,
        instructor_signature_url,
        address_line1,
        address_line2,
        phone_number,
        contact_email,
        website_url,
        exam_report_title
      from organizations
      where id = $1
      limit 1`,
      [orgId],
    );

    if (!orgRes.rows.length) {
      await client.query('ROLLBACK');
      return null;
    }

    const orgRow = orgRes.rows[0];
    const org = {
      id: orgRow.id,
      name: orgRow.name,
      slug: orgRow.slug,
      logo_url: orgRow.logo_url || null,
      signature_url: orgRow.signature_url || null,
      instructor_signature_url: orgRow.instructor_signature_url || null,
      address_line1: orgRow.address_line1 || null,
      address_line2: orgRow.address_line2 || null,
      phone_number: orgRow.phone_number || null,
      contact_email: orgRow.contact_email || null,
      website_url: orgRow.website_url || null,
    };

    // 1) Resolve term + session meta
    const sessionMetaRes = await client.query(
      `
        select
          s.id              as session_id,
          s.label           as exam_label,
          s.term_id         as term_id,
          t.label           as term_label,
          t.year            as term_year
        from org_exam_sessions s
        join org_exam_terms t
          on t.id = s.term_id
        where s.org_id = $1
          and s.id     = $2
        limit 1
      `,
      [orgId, sessionId],
    );

    if (!sessionMetaRes.rows.length) {
      await client.query('ROLLBACK');
      return null;
    }

    const sessionMeta = sessionMetaRes.rows[0];

    // In apps/backend/services/orgExamCardService.js
    // 2) Load all result rows for THIS learner in THIS exam
    const resultsRes = await client.query(
      `
    select
      r.subject,
      r.score,
      r.max_score,
      r.cat_score,
      r.exam_score,
      r.grade,
      r.remark,
      r.teacher_initials,
      r.extra,                    -- ✅ include extra
      u.id              as student_id,
      u.name            as student_name,
      u.email           as student_email,
      p.class_label,
      p.admission_code,
      p.house_label,
      p.dorm_label,
      p.club_label,
      p.photo_url,
       p.class_teacher_signature_url
    from org_exam_results r
    join users u
      on u.id = r.student_user_id
    left join org_learner_profiles p
      on p.org_id = r.org_id
     and p.user_id = r.student_user_id
    where r.org_id         = $1
      and r.session_id     = $2
      and r.student_user_id = $3
    order by r.subject asc
  `,
      [orgId, sessionId, studentUserId],
    );

    if (!resultsRes.rows.length) {
      await client.query('ROLLBACK');
      return null;
    }

    const firstRow = resultsRes.rows[0];

    const student = {
      id: firstRow.student_id,
      name: firstRow.student_name,
      email: firstRow.student_email,
      admission_code: firstRow.admission_code,
      class_label: firstRow.class_label,
      house_label: firstRow.house_label,
      dorm_label: firstRow.dorm_label,
      club_label: firstRow.club_label,
      photo_url: firstRow.photo_url,
      class_teacher_signature_url: firstRow.class_teacher_signature_url || null,
    };

    const effectiveClassLabel = (firstRow.class_label || '').toString().trim();

    // 3) Load ALL rows in this exam + class for positions
    const classRowsRes = await client.query(
      `
        select
          r.student_user_id,
          r.subject,
          r.score,
          r.max_score,
          p.class_label
        from org_exam_results r
        left join org_learner_profiles p
          on p.org_id  = r.org_id
         and p.user_id = r.student_user_id
        where r.org_id     = $1
          and r.session_id = $2
          and (
            $3::text is null
            or lower(coalesce(p.class_label, '')) = lower($3::text)
          )
      `,
      [orgId, sessionId, effectiveClassLabel || null],
    );

    const classRows = classRowsRes.rows;

    // 4) Overall totals (for the whole class)
    const totalsByStudent = new Map();
    for (const r of classRows) {
      const sid = Number(r.student_user_id);
      if (!Number.isFinite(sid)) continue;
      const s = Number(r.score) || 0;
      const m = Number(r.max_score) || 0;

      const prev = totalsByStudent.get(sid) || {
        totalScore: 0,
        totalMax: 0,
        percent: 0,
      };
      const totalScore = prev.totalScore + s;
      const totalMax = prev.totalMax + m;
      const percent = totalMax > 0 ? (totalScore / totalMax) * 100 : 0;
      totalsByStudent.set(sid, { totalScore, totalMax, percent });
    }

    const overallSorted = Array.from(totalsByStudent.entries()).sort(
      (a, b) => b[1].percent - a[1].percent,
    );
    const classSize = overallSorted.length;
    const overallIdx = overallSorted.findIndex(
      ([sid]) => Number(sid) === Number(studentUserId),
    );
    const overallRank = overallIdx >= 0 ? overallIdx + 1 : null;

    const myTotals = overallIdx >= 0 ? overallSorted[overallIdx][1] : null;
    const totalScore = myTotals?.totalScore ?? null;
    const totalMax = myTotals?.totalMax ?? null;
    const totalPercent = myTotals ? myTotals.percent : null;

    // 5) Subject-wise positions in this class
    const rowsBySubject = new Map();
    for (const r of classRows) {
      const key = (r.subject || '').toString().toLowerCase();
      if (!rowsBySubject.has(key)) rowsBySubject.set(key, []);
      rowsBySubject.get(key).push(r);
    }

    const subjectPositions = {};
    for (const [key, rows] of rowsBySubject.entries()) {
      if (!rows.length) continue;
      const withPerc = rows
        .map((r) => ({
          studentId: Number(r.student_user_id),
          percent: percentOf(r.score, r.max_score) ?? 0,
        }))
        .sort((a, b) => b.percent - a.percent);

      const size = withPerc.length;
      const idx = withPerc.findIndex(
        (row) => row.studentId === Number(studentUserId),
      );
      const rank = idx >= 0 ? idx + 1 : null;
      const meanPercent =
        withPerc.reduce((acc, r) => acc + r.percent, 0) / size || null;
      subjectPositions[key] = { rank, size, meanPercent };
    }

    // 6) Build subject array + find best / weakest
    const subjects = [];
    let best = null;
    let weakest = null;

    for (const r of resultsRes.rows) {
      const pct = percentOf(r.score, r.max_score);
      const key = (r.subject || '').toString().toLowerCase();
      const pos = subjectPositions[key] || {
        rank: null,
        size: 0,
        meanPercent: null,
      };

      const extra =
        r.extra && typeof r.extra === 'object' && !Array.isArray(r.extra)
          ? r.extra
          : null;

      const enriched = {
        subject: r.subject,
        score: Number(r.score),
        max_score: Number(r.max_score),
        cat_score: r.cat_score != null ? Number(r.cat_score) : null,
        exam_score: r.exam_score != null ? Number(r.exam_score) : null,
        grade: r.grade,
        percent: pct,
        classRank: pos.rank,
        classSize: pos.size,
        classMeanPercent: pos.meanPercent,
        remark: r.remark || null,
        teacher_initials: r.teacher_initials || null,
        extra, // ✅ carry extras (Effort, NextStep, Homework, etc.)
      };

      subjects.push(enriched);

      if (pct != null) {
        if (!best || pct > best.percent) {
          best = { subject: r.subject, percent: pct };
        }
        if (!weakest || pct < weakest.percent) {
          weakest = { subject: r.subject, percent: pct };
        }
      }
    }

    // 7) Build simple progress/history series for this learner
    const historyRes = await client.query(
      `
        select
          s.id          as session_id,
          s.label       as exam_label,
          t.id          as term_id,
          t.label       as term_label,
          t.year        as term_year,
          sum(r.score)  as total_score,
          sum(r.max_score) as total_max
        from org_exam_results r
        join org_exam_sessions s
          on s.id = r.session_id
        join org_exam_terms t
          on t.id = s.term_id
        where r.org_id           = $1
          and r.student_user_id  = $2
        group by s.id, s.label, t.id, t.label, t.year
        order by t.year asc, t.label asc, s.label asc
      `,
      [orgId, studentUserId],
    );

    const progressSeries = historyRes.rows.map((row) => {
      const ts = Number(row.total_score) || 0;
      const tm = Number(row.total_max) || 0;
      const p = tm > 0 ? (ts / tm) * 100 : 0;
      const label = `${row.term_year} ${row.term_label} – ${row.exam_label}`;
      return {
        termId: row.term_id,
        sessionId: row.session_id,
        label,
        percent: p,
        isCurrent: row.session_id === sessionMeta.session_id,
      };
    });

    // 8) Attendance / behaviour block (optional table)
    let attendance = null;
    try {
      const attRes = await client.query(
        `
          select
            lessons_held,
            lessons_attended,
            behavior_rating,
            punctuality_rating,
            teacher_comment
          from org_learner_attendance
          where org_id = $1
            and user_id = $2
            and term_id = $3
          limit 1
        `,
        [orgId, studentUserId, sessionMeta.term_id],
      );

      if (attRes.rows.length) {
        const att = attRes.rows[0];
        const lh = Number(att.lessons_held) || 0;
        const la = Number(att.lessons_attended) || 0;
        const attendancePercent =
          lh > 0 ? Math.round((la / lh) * 1000) / 10 : null;

        attendance = {
          lessonsHeld: lh || null,
          lessonsAttended: la || null,
          attendancePercent,
          behaviorRating: att.behavior_rating ?? null,
          punctualityRating: att.punctuality_rating ?? null,
          teacherComment: att.teacher_comment ?? null,
        };
      }
    } catch (err) {
      // If table doesn't exist, we silently ignore; everything else should still work.
      if (
        !/relation .*org_learner_attendance.* does not exist/i.test(
          err.message || '',
        )
      ) {
        throw err;
      }
    }

    // 8.5) Load any saved principal remark (optional)
    let principalRemark = null;
    try {
      const overallRes = await client.query(
        `
          select principal_remark
          from org_exam_student_overall
          where org_id = $1
            and session_id = $2
            and student_user_id = $3
          limit 1
        `,
        [orgId, sessionId, studentUserId],
      );
      if (overallRes.rows.length) {
        principalRemark = overallRes.rows[0].principal_remark || null;
      }
    } catch (err) {
      // optional: log, but don't block report card if this fails

      console.warn(
        '[getStudentExamCard] principal_remark query failed',
        err.message,
      );
    }

    await client.query('COMMIT');

    const summary = {
      totalScore,
      totalMax,
      totalPercent,
      overallGrade: null,
      classRank: overallRank,
      classSize,
      principalRemark,
      overallRemark: null,
    };

    // 🔹 Manual org-level title from settings (OrgExamSetupTab “Report card title”)
    const orgReportTitle = (orgRow.exam_report_title || '').toString().trim();

    // 🔹 Auto title based on term + exam, like before
    const autoTitle = [
      sessionMeta.term_year,
      sessionMeta.term_label,
      '–',
      sessionMeta.exam_label,
      'Report Card',
    ]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    // 🔹 Final title: manual > auto > hard default
    const reportTitle = orgReportTitle || autoTitle || 'TERM REPORT CARD';

    const classTeacherSig =
      student.class_teacher_signature_url || // 👈 per-class (per learner)
      org.instructor_signature_url || // org-level instructor sig
      null;

    return {
      org,
      student,
      term: {
        id: sessionMeta.term_id,
        year: sessionMeta.term_year,
        label: sessionMeta.term_label,
      },
      session: {
        id: sessionMeta.session_id,
        label: sessionMeta.exam_label,
      },
      subjects,
      summary,
      computed: {
        bestSubject: best?.subject ?? null,
        bestPercent: best?.percent ?? null,
        weakestSubject: weakest?.subject ?? null,
        weakestPercent: weakest?.percent ?? null,
      },
      progressSeries,
      attendance,
      reportTitle,
      // 👇 NEW: flattened signature helpers for the PDF layer
      class_teacher_signature_url: classTeacherSig,
      instructor_signature_url: org.instructor_signature_url || null,
      helpers: {
        ordinalRank: computeOrdinalRank,
      },
    };
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
