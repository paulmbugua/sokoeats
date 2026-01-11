// apps/backend/controllers/certificatesController.js
import pool from '../config/db.js';
import { getEntitlement, isUuid, upsertEntitlement } from './_entitlements.js';
import {
  getCertificateEntitlement,
  upsertAiCertificateEntitlement,
} from './_aiCourseEntitlements.js';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function looksExtendedSku(skuOrCodeOrTitle) {
  const s = (v) => (typeof v === 'string' ? v.toLowerCase() : '');
  const title = s(skuOrCodeOrTitle?.title);
  const code = s(skuOrCodeOrTitle?.code ?? skuOrCodeOrTitle);
  const tier = s(
    skuOrCodeOrTitle?.tier ||
      skuOrCodeOrTitle?.plan ||
      skuOrCodeOrTitle?.level ||
      skuOrCodeOrTitle?.kind,
  );
  const tags = Array.isArray(skuOrCodeOrTitle?.tags)
    ? skuOrCodeOrTitle.tags.map(s)
    : [];
  return (
    tier.includes('extended') ||
    title.includes('extended') ||
    title.includes('transcript') ||
    /\b(ext|extended|xtra|plus)\b/.test(code) ||
    tags.includes('extended') ||
    tags.includes('transcript')
  );
}

function isExtendedSkuRow(row) {
  const s = (v) => (typeof v === 'string' ? v.toLowerCase() : '');
  const title = s(row?.title);
  const code = s(row?.code);
  const tier = s(row?.tier);
  return (
    tier === 'extended' ||
    /extended|transcript/.test(title) ||
    /\bext\b|extended|transcript/.test(code)
  );
}

// ─────────────────────────────────────────────────────────────
// Admin: list issued certs
// ─────────────────────────────────────────────────────────────
export async function listIssuedCertificates(req, res) {
  const L = Math.min(Number(req.query.limit) || 50, 200);
  const O = Math.max(Number(req.query.offset) || 0, 0);

  const sql = `
    SELECT id,
           student_id,
           course_id,
           url,
           issued_at,
           quiz_attempt_id,
           status,
           created_at
    FROM public.certificates
    ORDER BY COALESCE(issued_at, created_at) DESC
    LIMIT $1 OFFSET $2
  `;

  try {
    const { rows } = await pool.query(sql, [L, O]);
    res.json({ ok: true, items: rows });
  } catch (err) {
    const missing = /relation "([^"]+)"/i.exec(err.message)?.[1];
    console.error('[certs.list] SQL failed', { code: err.code, missing, sql });
    const msg =
      err.code === '42P01'
        ? `Missing relation${missing ? `: ${missing}` : ''}.`
        : 'Failed to list certificates.';
    res.status(500).json({ ok: false, error: msg });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/ai/certificates/issue  (kept here if you route it here)
// Deduct tokens, record issuance, and upsert entitlement
// ─────────────────────────────────────────────────────────────
export async function issueCertificate(req, res) {
  const userId = req.user?.users_id ?? req.user?.id;
  const { code, courseId } = req.body || {};
  if (!userId)
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  if (!code)
    return res
      .status(400)
      .json({ ok: false, message: 'Missing certificate code' });

  const normalizedCourseId = isUuid(courseId) ? courseId : null;
  if (!normalizedCourseId)
    return res.status(400).json({ ok: false, message: 'Invalid courseId' });

  try {
    const certQ = await pool.query(
      `SELECT id, code, title, tier, price_tokens
         FROM ai_certificates
        WHERE code = $1 AND active = true`,
      [code],
    );
    if (!certQ.rowCount) {
      return res
        .status(404)
        .json({ ok: false, message: 'Certificate not found/active' });
    }
    const cert = certQ.rows[0];
    const priceTokens = Number(cert.price_tokens) || 0;
    const extendedTier = isExtendedSkuRow(cert) || looksExtendedSku(cert);

    // Idempotent: if entitlement already exists, return success without charging again.
    const existingEntitlement = await getCertificateEntitlement(
      userId,
      normalizedCourseId,
    ).catch(() => null);

    const existingCourseEntitlement = await getEntitlement(
      pool,
      userId,
      normalizedCourseId,
    ).catch(() => null);

    if (existingEntitlement) {
      const tier =
        existingCourseEntitlement?.tier || (extendedTier ? 'extended' : 'standard');

      return res.status(200).json({
        ok: true,
        courseId: normalizedCourseId,
        purchased: true,
        tier,
        lessons_used: existingEntitlement.lessons_used ?? 0,
        lesson_cap: existingEntitlement.max_lessons ?? 60,
      });
    }

    // Org coverage shortcut
    const cov = await pool.query(
      `SELECT 1
         FROM org_quiz_attempts
        WHERE user_id=$1
          AND (submitted_at IS NOT NULL)
          AND passed = TRUE
        ORDER BY submitted_at DESC
        LIMIT 1`,
      [userId],
    );

    let aiEntitlementRow = null;
    let courseEntitlement = existingCourseEntitlement;

    if (cov.rowCount) {
      await pool.query(
        `INSERT INTO ai_certificate_issuances (user_id, course_id, certificate_id, price_tokens)
         VALUES ($1, $2, $3, 0)
         RETURNING id, created_at`,
        [userId, normalizedCourseId, cert.id],
      );

      try {
        await upsertEntitlement(pool, {
          userId,
          courseId: normalizedCourseId,
          extended: true, // org covers transcript
        });
        aiEntitlementRow = await upsertAiCertificateEntitlement({
          userId,
          courseId: normalizedCourseId,
          courseSource: 'catalog',
          maxLessons: 60,
        });
        courseEntitlement = await getEntitlement(
          pool,
          userId,
          normalizedCourseId,
        ).catch(() => courseEntitlement);
      } catch (e) {
        console.warn('[aiCert] upsertEntitlement (org) failed:', e.message);
      }

      const tier = courseEntitlement?.tier || 'extended';

      return res.status(200).json({
        ok: true,
        courseId: normalizedCourseId,
        purchased: true,
        tier,
        lessons_used: aiEntitlementRow?.lessons_used ?? 0,
        lesson_cap: aiEntitlementRow?.max_lessons ?? 60,
      });
    }

    // Tokens flow
    await pool.query('BEGIN');

    const uQ = await pool.query(
      'SELECT tokens FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );
    if (!uQ.rowCount) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'User not found' });
    }

    const current = Number(uQ.rows[0].tokens) || 0;
    if (current < priceTokens) {
      await pool.query('ROLLBACK');
      return res
        .status(400)
        .json({ ok: false, message: 'Insufficient tokens' });
    }

    await pool.query('UPDATE users SET tokens = tokens - $1 WHERE id = $2', [
      priceTokens,
      userId,
    ]);

    await pool.query(
      `INSERT INTO ai_certificate_issuances (user_id, course_id, certificate_id, price_tokens)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [userId, normalizedCourseId, cert.id, priceTokens],
    );

    await pool.query('COMMIT');

    // Entitlement AFTER commit
    try {
      await upsertEntitlement(pool, {
        userId,
        courseId: normalizedCourseId,
        extended: Boolean(extendedTier), // true => can_transcript + can_certificate
      });
      aiEntitlementRow = await upsertAiCertificateEntitlement({
        userId,
        courseId: normalizedCourseId,
        courseSource: 'catalog',
        maxLessons: 60,
      });
      courseEntitlement = await getEntitlement(
        pool,
        userId,
        normalizedCourseId,
      ).catch(() => courseEntitlement);
    } catch (e) {
      console.warn('[aiCert] upsertEntitlement failed:', e.message);
    }

    const tier =
      courseEntitlement?.tier || (extendedTier ? 'extended' : 'standard');

    return res.status(200).json({
      ok: true,
      courseId: normalizedCourseId,
      purchased: true,
      tier,
      lessons_used: aiEntitlementRow?.lessons_used ?? 0,
      lesson_cap: aiEntitlementRow?.max_lessons ?? 60,
    });
  } catch (e) {
    await pool.query('ROLLBACK').catch(() => {});
    console.error('[aiCert] issueCertificate:', e);
    res.status(500).json({ ok: false, message: 'Internal server error' });
  }
}

// ─────────────────────────────────────────────────────────────
export async function listAICertificateSKUs(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT id, code, title, tier, price_tokens
         FROM ai_certificates
        WHERE active = true
        ORDER BY id DESC`,
    );
    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error('[aiCert] listAICertificateSKUs:', e);
    res.status(500).json({ ok: false, message: 'Internal server error' });
  }
}
