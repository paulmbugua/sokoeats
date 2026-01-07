// apps/web/src/pages/org/OrgInviteLanding.tsx
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useShopContext } from '@mytutorapp/shared/context';
import { useOrgInvite } from '@mytutorapp/shared/hooks';
import { acceptOrgInvite, acceptOrgMembershipInvite } from '@mytutorapp/shared/api';
import type { OrgInviteInfo } from '@mytutorapp/shared/types';

const ROBOT_ROUTE = '/robot-teach';

type QuizType = 'mcq' | 'short';
const normalizeQuizType = (v: unknown): QuizType | null => {
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (['mcq', 'multiple', 'multiple_choice', 'multiple-choice', 'choice', 'choices'].includes(s))
    return 'mcq';
  if (
    [
      'short',
      'open',
      'free',
      'shortanswer',
      'short-answer',
      'short_answer',
      'written',
      'fill',
      'fill_in',
      'fill-in',
    ].includes(s)
  )
    return 'short';
  return null;
};

const resolveLockedConfig = (meta: any) =>
  meta?.lockedConfig ??
  meta?.locked_config ??
  meta?.meta?.lockedConfig ??
  meta?.meta?.locked_config ??
  meta?.assignment?.lockedConfig ??
  meta?.assignment?.locked_config ??
  meta?.enrollment?.lockedConfig ??
  meta?.enrollment?.locked_config ??
  null;


const resolveQuizType = (meta: any): QuizType | null => {
  const lc = resolveLockedConfig(meta);
  const raw = lc?.quizType ?? meta?.quiz_type ?? meta?.quizType ?? null;
  return normalizeQuizType(raw);
};

const resolveQuizSize = (meta: any): number | null => {
  const lc = resolveLockedConfig(meta);
  const raw = lc?.quizSize ?? meta?.quiz_size ?? meta?.quizSize ?? null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export default function OrgInviteLanding() {
  const { code = '' } = useParams();
  const { backendUrl, token, orgToken } = useShopContext() as any;
  const learnerToken = token || orgToken;
  const nav = useNavigate();

  // NEW: consume kind + error from the hook
  const { kind, data: meta, error: hookError, loading } = useOrgInvite(code);

  const [error, setError] = React.useState<string>('');
  React.useEffect(() => {
    setError(hookError || '');
  }, [hookError]);

  // Policy only exists for ASSIGNMENT invites
  const policy = React.useMemo(() => (meta as any)?.policy || {}, [meta]);
  const allowedDomains: string[] = React.useMemo(
    () => (Array.isArray(policy?.allowed_domains) ? policy.allowed_domains : []),
    [policy]
  );
  const domainRestricted = !!policy?.domain_restricted && allowedDomains.length > 0;

  const onAccept = async () => {
    setError('');
    if (!code) {
      setError('Invalid invite.');
      return;
    }

    // Require sign-in; remember return target
    if (!learnerToken) {
      const next = `/org/join/${code}`;
      try {
        sessionStorage.setItem('auth:returnTo', next);
      } catch {}
      // Send to InstitutionLogin (with a hint it's from an invite)
      nav(`/org/login?from=invite&code=${encodeURIComponent(code)}`, {
        replace: true,
      });
      return;
    }

    try {
      if (kind === 'membership') {
        const resp = await acceptOrgMembershipInvite(backendUrl, learnerToken, code);
        if (!resp?.ok) {
          // No `message` on this type — let the catch block surface API errors.
          throw new Error('Failed to join organization.');
        }
        nav('/org/portal', { replace: true });
        return;
      }

      // Default/assignment path
      const resp: any = await acceptOrgInvite(backendUrl, learnerToken, code);
      if (!resp?.ok) throw new Error(resp?.message || 'Failed to accept invite.');

      const enrollment = resp.enrollment ?? resp.attempt ?? resp;
      const lockedConfig =
      enrollment?.lockedConfig ??
      enrollment?.locked_config ??
      resolveLockedConfig(meta as any);


      const assignmentId =
        enrollment?.assignmentId ??
        (meta as OrgInviteInfo | undefined)?.assignment?.id ??
        (meta as OrgInviteInfo | undefined)?.id ??
        null;
      const courseId =
        enrollment?.courseId ??
        (meta as OrgInviteInfo | undefined)?.assignment?.course_id ??
        (meta as OrgInviteInfo | undefined)?.course_id ??
        '';

      if (!assignmentId) throw new Error('Invite accepted, but no assignment found.');
      if (!courseId) throw new Error('Shared course not found.');

      // Pass hints to classroom (assignment still enforced server-side)
      const qt = normalizeQuizType(lockedConfig?.quizType);
      const qs = Number.isFinite(Number(lockedConfig?.quizSize)) ? Number(lockedConfig.quizSize) : null;


      const params = new URLSearchParams({
        assignmentId: String(assignmentId),
        ...(courseId ? { courseId: String(courseId) } : {}),
        lock: '1',
        flow: 'org',
        ...(qt ? { qt } : {}),
        ...(qs ? { qs: String(qs) } : {}),
      });

      nav(`${ROBOT_ROUTE}?${params.toString()}`, { replace: true });
    } catch (e: any) {
      const apiMsg = e?.response?.data?.message || e?.message;
      const apiCode = e?.response?.data?.code;
      if (apiCode === 'EMAIL_DOMAIN_BLOCKED' && domainRestricted) {
        setError(
          `You're signed in with an email that isn’t allowed for this organization. Allowed domain(s): ${allowedDomains.join(
            ', '
          )}. Please sign in using an email on one of those domains, or ask your admin to add your domain.`
        );
      } else {
        setError(apiMsg || 'Failed to accept invite.');
      }
    }
  };

  // Labels for ASSIGNMENT invites (membership has none)
  const passMarkLabel = React.useMemo(() => {
    if (!meta || kind !== 'assignment') return '—';
    const assess = (meta as any)?.policy?.assessment || {};
    const fallback = (meta as any)?.pass_mark ?? (meta as any)?.default_pass_mark;
    const pass = assess.default_pass_mark ?? fallback;
    return pass != null ? `${pass}%` : '—';
  }, [meta, kind]);

  const timerLabel = React.useMemo(() => {
    if (!meta || kind !== 'assignment') return '—';
    const assess = (meta as any)?.policy?.assessment || {};
    const secs =
      assess.quiz_time_limit_s ?? (meta as any)?.timer_s ?? (meta as any)?.quiz_time_limit_s;
    if (!secs) return '—';
    return secs % 60 === 0 ? `${secs / 60} min` : `${secs}s`;
  }, [meta, kind]);

  const dueLabel = React.useMemo(() => {
    if (kind !== 'assignment') return null;
    const dRaw = (meta as OrgInviteInfo | undefined)?.due_at;
    if (!dRaw) return null;
    try {
      const d = new Date(dRaw);
      return d.toLocaleString();
    } catch {
      return dRaw;
    }
  }, [meta, kind]);

  const quizType = React.useMemo(
    () => (kind === 'assignment' ? resolveQuizType(meta as any) : null),
    [meta, kind]
  );
  const quizSize = React.useMemo(
    () => (kind === 'assignment' ? resolveQuizSize(meta as any) : null),
    [meta, kind]
  );

  const quizTypeLabel = React.useMemo(() => {
    if (!quizType) return '—';
    return quizType === 'short' ? 'Short answers (typed)' : 'Multiple choice (MCQ)';
  }, [quizType]);

  const quizTypeDesc = React.useMemo(() => {
    if (!quizType) return '';
    return quizType === 'short'
      ? 'You’ll type your answers. You can use subscripts/superscripts (e.g., H₂SO₄, SO₄²⁻). We’ll auto-mark.'
      : 'You’ll choose one of four options for each question.';
  }, [quizType]);

  // UI title/subtitle vary by kind
  const title =
    kind === 'membership'
      ? 'Join organization'
      : (meta as OrgInviteInfo | undefined)?.title_override || 'Assigned Course';

  const subtitle =
    kind === 'membership'
      ? 'You have been invited to join this organization.'
      : 'Invitation to learn';

  const orgName = (meta as OrgInviteInfo | undefined)?.org_name || 'Organization';

  const primaryCta = learnerToken
    ? kind === 'membership'
      ? 'Join Organization'
      : 'Accept & Join'
    : domainRestricted
      ? 'Sign in with allowed email'
      : 'Sign in to continue';

  return (
    <div className="min-h-screen bg-[#0b1220] text-white px-3 sm:px-4 py-6 grid place-items-center">
      <div className="w-full max-w-md sm:max-w-xl rounded-2xl ring-1 ring-white/10 bg-white/5 p-4 sm:p-5">
        {/* Loading / invalid */}
        {loading ? (
          <div className="text-white/80 text-sm sm:text-base">Loading…</div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3">
              {kind === 'assignment' && (meta as OrgInviteInfo)?.logo_url && (
                <img
                  src={(meta as OrgInviteInfo).logo_url!}
                  alt={`${orgName} logo`}
                  className="h-10 w-10 rounded object-cover"
                />
              )}
              <div className="min-w-0">
                <div className="text-[13px] text-white/70">{subtitle}</div>
                <div className="text-lg sm:text-xl font-semibold truncate">{title}</div>
                <div className="text-white/70 text-sm truncate">{orgName}</div>
              </div>
            </div>

            {/* Meta row — only for assignment invites */}
            {kind === 'assignment' && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="px-2 py-1 rounded-full bg-white/10 text-xs">
                  Pass mark: <b>{passMarkLabel}</b>
                </span>
                <span className="px-2 py-1 rounded-full bg-white/10 text-xs">
                  Timer: <b>{timerLabel}</b>
                </span>

                {typeof (meta as OrgInviteInfo)?.max_attempts === 'number' && (
                  <span className="px-2 py-1 rounded-full bg-white/10 text-xs">
                    Attempts:{' '}
                    <b>
                      {(meta as OrgInviteInfo).max_attempts === 0
                        ? '∞'
                        : (meta as OrgInviteInfo).max_attempts}
                    </b>
                  </span>
                )}

                {dueLabel && (
                  <span className="px-2 py-1 rounded-full bg-white/10 text-xs">
                    Due: <b>{dueLabel}</b>
                  </span>
                )}

                <span className="px-2 py-1 rounded-full bg-white/10 text-xs">
                  Answer type: <b>{quizTypeLabel}</b>
                </span>

                {quizSize != null && (
                  <span className="px-2 py-1 rounded-full bg-white/10 text-xs">
                    Questions: <b>{quizSize}</b>
                  </span>
                )}
              </div>
            )}

            {/* “What to expect” card */}
            <div className="mt-3 rounded-xl ring-1 ring-white/10 bg-white/5 p-3 flex items-start gap-3">
              <span
                className={`h-8 w-8 shrink-0 rounded-lg grid place-items-center text-white
                  ${quizType === 'short' ? 'bg-emerald-600' : 'bg-indigo-600'}
                `}
                aria-hidden
              >
                {quizType === 'short' ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 5H4c-1.1 0-2 .9-2 2v8a2 2 0 002 2h16a2 2 0 002-2V7c0-1.1-.9-2-2-2zm0 10H4V7h16v8zM6 9h2v2H6V9zm3 0h2v2H9V9zm3 0h2v2h-2V9zm3 0h2v2h-2V9zM6 12h8v2H6v-2zm9 0h3v2h-3v-2z" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 5h14v2H7V5zm0 6h14v2H7v-2zm0 6h14v2H7v-2zM3 5h2v2H3V5zm0 6h2v2H3v-2zm0 6h2v2H3v-2z" />
                  </svg>
                )}
              </span>
              <div className="text-sm">
                <div className="font-medium mb-0.5">
                  {kind === 'membership' ? 'Organization access' : quizTypeLabel}
                </div>
                <div className="text-white/70">
                  {kind === 'membership'
                    ? 'You will be added to this organization. Your admins can assign courses to you afterwards.'
                    : quizTypeDesc || 'Your organization set the answer format for this quiz.'}
                </div>
              </div>
            </div>

            {/* Domain restriction (assignment-only) */}
            {kind === 'assignment' && domainRestricted && (
              <div className="mt-3 rounded-lg bg-amber-500/10 text-amber-200 ring-1 ring-amber-400/20 p-3 text-xs">
                <div className="font-medium">Restricted invite</div>
                <div className="mt-0.5">
                  Only emails from <b>{allowedDomains.join(', ')}</b> can accept this invite.
                  {learnerToken ? (
                    <>
                      {' '}
                      If this isn’t your organization email, sign out and sign back in with the
                      permitted address.
                    </>
                  ) : (
                    <> Please sign in using an email on one of those domains.</>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <button
                onClick={onAccept}
                disabled={loading}
                className="btn bg-emerald-600 hover:bg-emerald-500 w-full sm:w-auto disabled:opacity-60"
              >
                {primaryCta}
              </button>
              <button onClick={() => nav(-1)} className="chip w-full sm:w-auto" title="Go back">
                Cancel
              </button>
            </div>

            {/* Signature (assignment-only, optional) */}
            {kind === 'assignment' && (meta as OrgInviteInfo)?.signature_url && (
              <div className="mt-4">
                <img
                  src={(meta as OrgInviteInfo).signature_url!}
                  alt="Authorized signature"
                  className="h-10 opacity-70"
                />
              </div>
            )}

            {/* Error */}
            {!!error && (
              <div className="mt-3 text-amber-300 text-xs whitespace-pre-line">{error}</div>
            )}

            {/* Footnote */}
            <p className="mt-4 text-[12px] text-white/60">
              {kind === 'membership' ? (
                <>
                  By joining, you’ll be added to <b>{orgName}</b>. Your admins may assign courses to
                  you.
                </>
              ) : (
                <>
                  By starting, you’ll be added as a learner in <b>{orgName}</b> for this course.
                  Your attempt may be timed and limited by your organization’s policy.
                </>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
