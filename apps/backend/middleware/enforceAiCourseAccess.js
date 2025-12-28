import { getCertificateEntitlement } from '../controllers/_aiCourseEntitlements.js';

export async function enforceAiCourseAccess(req, res, next) {
  const userId = req.user?.id || null;
  const courseId = req.body?.courseId;
  const assignmentOrgId = res.locals?.assignment?.orgId || null;

  // org pays -> do not require personal purchase
  if (assignmentOrgId) return next();

  // self-serve requires auth if you want purchase-based access
  if (!userId) {
    return res.status(401).json({ error: 'LOGIN_REQUIRED' });
  }

  const start = Number(req.body?.start ?? 0);
  const count = Number(req.body?.count ?? 1);

  const isPreview = start === 0 && count === 1;

  const ent = await getCertificateEntitlement(userId, courseId);
  if (!ent && !isPreview) {
    return res.status(402).json({
      error: 'COURSE_NOT_PURCHASED',
      cost_tokens: 20,
      message: 'Buy course access to unlock full narration and lesson generation.',
    });
  }

  res.locals.aiEntitlement = ent || null;
  next();
}
