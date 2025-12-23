// apps/web/src/pages/org/OrgLearnerHome.web.tsx
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import { useShopContext } from '@mytutorapp/shared/context';
import { useOrgLearnerFees } from '@mytutorapp/shared/hooks/useOrgLearnerFees';
import { apiListLearnerNewsletters } from '@mytutorapp/shared/api/orgProApi';


const card = 'rounded-2xl ring-1 ring-white/10 bg-white/5 p-4 sm:p-5';

function moneyFromCents(cents?: number, currency?: string) {
  const cur = (currency || 'USD').toUpperCase();
  const v = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(v);
  } catch {
    return `${cur} ${v.toFixed(2)}`;
  }
}

function sumCents(items: any[]) {
  return (items || []).reduce((acc, it) => acc + Number(it?.amount_cents ?? it?.amountCents ?? 0), 0);
}


const OrgLearnerHome: React.FC = () => {
  const { org, role, currentUser } = (useOrg?.() ?? {}) as any;
  const [params] = useSearchParams();
  const navigate = useNavigate();

  // ⬇️ Pull everything we can from ShopContext
  const {
    orgLogout,
    userId: ctxUserId,
    user: shopUser,
    orgLearner: ctxOrgLearner,
    orgUser: ctxOrgUser,
    backendUrl,
     orgToken,
  } = useShopContext() as any;

  const orgId = org?.id;

const fees = useOrgLearnerFees({ backendUrl, token: orgToken, orgId: orgId || undefined });


const feeLoading = (fees as any)?.loading ?? (fees as any)?.isLoading ?? false;
const feeError = (fees as any)?.error ?? null;

const feeStructure =
  (fees as any)?.structure ??
  (fees as any)?.feeStructure ??
  (fees as any)?.myFeeStructure ??
  null;

const feeItems: any[] = feeStructure?.items ?? feeStructure?.structure_items ?? [];
const feeCurrency: string =
  feeStructure?.currency ||
  (fees as any)?.currency ||
  (fees as any)?.balances?.currency ||
  'USD';

const totalStructureCents = sumCents(feeItems);

const newslettersQ = useQuery({
  queryKey: ['learner-newsletters', orgId],
  queryFn: async () => {
    if (!backendUrl || !orgId) return { items: [] };
    return apiListLearnerNewsletters(backendUrl, String(orgId), orgToken);
  },
  enabled: !!backendUrl && !!orgToken && !!orgId,
});

const learnerNewsletters = newslettersQ.data?.items || [];
const newslettersLoading = newslettersQ.isLoading;


React.useEffect(() => {
  if (backendUrl && orgToken && orgId && fees?.refresh) fees.refresh();

}, [backendUrl, orgToken, orgId]); // eslint-disable-line

  // 🔐 support studentId coming from QR / login link
  const rawStudentIdParam = params.get('studentId') ?? params.get('student_id') ?? '';

  // Optional subject hint coming from URL (e.g. /org/learner-home?subject=Maths)
  const subjectParam =
    params.get('subject') ?? params.get('subjectKey') ?? params.get('subject_key') ?? '';

  const orgName: string = org?.name || org?.org_name || 'Your Institution';

  const planLabel: string = org?.tier ? org.tier.toString().toUpperCase() : 'STARTER';
  const isProTier = (org?.tier || '').toLowerCase() === 'pro' || (org?.tier || '').toLowerCase() === 'enterprise';

  const portalLabel = role ? `${String(role).toUpperCase()} PORTAL` : 'LEARNER PORTAL';

  // ─────────────────────────────────────────────
  // Learner identity derived fields
  // ─────────────────────────────────────────────

  // Candidate learner profiles from Org + Shop context
  const learnerProfileFromOrg =
    (currentUser as any)?.org_learner_profile ||
    (currentUser as any)?.orgLearnerProfile ||
    (currentUser as any)?.org_learner_profiles?.[0] ||
    null;

  const learnerProfileFromShop =
    (shopUser as any)?.org_learner_profile ||
    (shopUser as any)?.orgLearnerProfile ||
    (shopUser as any)?.org_learner_profiles?.[0] ||
    null;

  // ✅ Single canonical learner object
  const learner: any =
    learnerProfileFromOrg ||
    learnerProfileFromShop ||
    ctxOrgLearner ||
    ctxOrgUser ||
    shopUser ||
    currentUser ||
    null;

  const learnerUserBase: any = shopUser || currentUser || ctxOrgUser || null;

  // Canonical learner user id (this is what exam sheets use as student_user_id)
  const learnerUserId: number | string | null =
    learner?.user_id ??
    learner?.student_user_id ??
    learner?.userId ?? // 👈 from your `{ success, userId, ... }` payload
    learner?.id ??
    ctxUserId ??
    shopUser?.id ??
    shopUser?.user_id ??
    shopUser?.userId ??
    null;

  // ✅ Canonical learner student id for exams:
  // 1) prefer ?studentId= from URL (QR / login sheet)
  // 2) then learnerUserId (e.g. 846)
  const learnerStudentId: string =
    rawStudentIdParam && rawStudentIdParam.trim() !== ''
      ? rawStudentIdParam.trim()
      : learnerUserId != null
        ? String(learnerUserId)
        : '';

 const learnerFeesHref = learnerStudentId
  ? `/org/learn/fees?studentId=${encodeURIComponent(learnerStudentId)}`
  : `/org/learn/fees`;

  // Optional: treat "no learner yet" + no studentId param as loading
  const isLoading = !learner && !rawStudentIdParam;

  // Log transitions in an effect (still may run twice in StrictMode)
  React.useEffect(() => {
    console.log('[OrgLearnerHome] learner ids', {
      rawStudentIdParam,
      learnerUserId,
      learnerStudentId,
      hasProfile: !!learner,
      learner,
      orgCurrentUser: currentUser,
      shopUser,
      ctxOrgLearner,
      ctxOrgUser,
      ctxUserId: ctxUserId ?? null,
    });
  }, [
    rawStudentIdParam,
    learnerUserId,
    learnerStudentId,
    learner,
    currentUser,
    shopUser,
    ctxOrgLearner,
    ctxOrgUser,
    ctxUserId,
  ]);

  // Single URL used everywhere (exam portal learner view)
  const examsHref = learnerStudentId
    ? `/org/exams?view=learner&studentId=${encodeURIComponent(learnerStudentId)}`
    : '/org/exams?view=learner';

  // ── Display fields: all derived from `learner` ────────────────────────────
  const learnerName: string =
    learnerUserBase?.name ||
    learner?.name ||
    learner?.full_name ||
    learner?.fullName ||
    learnerUserBase?.email ||
    learner?.email ||
    'Learner';

  const learnerEmail: string =
    learnerUserBase?.email || // primary: actual login email
    learner?.email || // in case learner is already user-shaped
    learnerUserBase?.email_address ||
    learner?.email_address ||
    learner?.guardian_email || // fallback to guardian email
    '';



  const learnerGrade: string | null =
    learner?.class_label || learner?.classLabel || learner?.grade || null;



  // NEW: Try to resolve a default subject for this learner
  const learnerSubject: string | null =
    (subjectParam && subjectParam.trim() !== '' ? subjectParam.trim() : null) ||
    learner?.subject ||
    learner?.subject_name ||
    learner?.subject_label ||
    null;

  const admissionCode: string | null = learner?.admission_code || learner?.admissionCode || null;

  const learnerPhotoFromProfile: string | null =
    (learnerProfileFromOrg &&
      (learnerProfileFromOrg.photo_url || learnerProfileFromOrg.photoUrl)) ||
    (learnerProfileFromShop &&
      (learnerProfileFromShop.photo_url || learnerProfileFromShop.photoUrl)) ||
    null;

  const learnerPhoto: string | null =
    learnerPhotoFromProfile || learner?.photo_url || learner?.photoUrl || null;

  const learnerInitial = (learnerName || 'L').trim().charAt(0).toUpperCase();

  const handleLogout = React.useCallback(async () => {
    if (orgLogout) {
      await orgLogout(); // clear orgToken + org storage
    }
    navigate('/org/login', { replace: true }); // go to institution login
  }, [orgLogout, navigate]);


const toolsQueryParts: string[] = [];
toolsQueryParts.push('view=learner', 'tab=tools');
if (learnerStudentId) toolsQueryParts.push(`studentId=${encodeURIComponent(learnerStudentId)}`);
if (learnerGrade) toolsQueryParts.push(`class=${encodeURIComponent(learnerGrade)}`);
if (learnerSubject) toolsQueryParts.push(`subject=${encodeURIComponent(learnerSubject)}`);

const learnerToolsHref = `/org/portal${toolsQueryParts.length ? `?${toolsQueryParts.join('&')}` : ''}`;


  // 🧭 Course library URL – learner-aware (view=learner, studentId, class, subject)
  const courseQueryParts: string[] = [];
  courseQueryParts.push('view=learner');
  if (learnerStudentId) {
    courseQueryParts.push(`studentId=${encodeURIComponent(learnerStudentId)}`);
  }
  if (learnerGrade) {
    courseQueryParts.push(`class=${encodeURIComponent(learnerGrade)}`);
  }
  if (learnerSubject) {
    courseQueryParts.push(`subject=${encodeURIComponent(learnerSubject)}`);
  }
  const coursesHref = `/courses${courseQueryParts.length ? `?${courseQueryParts.join('&')}` : ''}`;

  // 🔐 Assignments: learner-restricted view (only what teachers share)
  // Now also passes class + subject hints to /org/portal
  const assignQueryParts: string[] = [];
  assignQueryParts.push('view=learner', 'tab=assign');
  if (learnerStudentId) {
    assignQueryParts.push(`studentId=${encodeURIComponent(learnerStudentId)}`);
  }
  if (learnerGrade) {
    assignQueryParts.push(`class=${encodeURIComponent(learnerGrade)}`);
  }
  if (learnerSubject) {
    assignQueryParts.push(`subject=${encodeURIComponent(learnerSubject)}`);
  }
  const assignmentsHref = `/org/portal${
    assignQueryParts.length ? `?${assignQueryParts.join('&')}` : ''
  }`;

  // 🔐 Results & certificates: Robot Tutor + legacy (certificates from Robot Tutor only)
  const resultsHref = learnerStudentId
    ? `/results?studentId=${encodeURIComponent(learnerStudentId)}`
    : '/results';

  // 🔍 NEW: log how the learner will pull courses/assignments/results
  React.useEffect(() => {
    console.log('[OrgLearnerHome] navigation + filters', {
      learnerStudentId,
      learnerUserId,
      learnerGrade,
      learnerSubject,
      coursesHref,
      assignmentsHref,
      resultsHref,
      examsHref,
    });
  }, [
    learnerStudentId,
    learnerUserId,
    learnerGrade,
    learnerSubject,
    coursesHref,
    assignmentsHref,
    resultsHref,
    examsHref,
  ]);

  // Optional: simple loading view while contexts boot
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0b1220] text-white px-3 sm:px-4 py-6 flex items-center justify-center">
        <div className="max-w-md w-full text-center space-y-3">
          <p className="text-xs uppercase tracking-[0.16em] text-white/50">LEARNER PORTAL</p>
          <p className="text-lg font-semibold">Preparing your learner dashboard…</p>
          <p className="text-xs text-white/60">
            Please wait a moment while we load your institution profile and learner account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-white px-3 sm:px-4 py-6">
      <div className="max-w-screen-lg mx-auto space-y-4">
        {/* Header */}
        <header className={`${card} flex items-center justify-between gap-3`}>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/60">
              {portalLabel}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold truncate mt-0.5">{orgName}</h1>
            <div className="text-xs text-white/60 mt-0.5">{planLabel} plan</div>
          </div>

          <div className="shrink-0 flex flex-col items-end gap-2">
            {/* Logout – compact, learner-friendly */}
            <button
              type="button"
              onClick={handleLogout}
              className="text-[11px] sm:text-xs px-3 py-1.5 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-white/80 font-medium transition"
              title="Sign out from this learner portal"
            >
              Not you? <span className="font-semibold">Sign out</span>
            </button>
          </div>
        </header>

        {/* Learner identity – always shows who is logged in */}
        <section className={card}>
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Avatar */}
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-gradient-to-br from-emerald-500/60 to-sky-500/60 flex items-center justify-center text-lg sm:text-xl font-bold shadow-inner overflow-hidden">
              {learnerPhoto ? (
                <img src={learnerPhoto} alt={learnerName} className="h-full w-full object-cover" />
              ) : (
                <span>{learnerInitial}</span>
              )}
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-[0.16em] text-white/60">
                Signed in learner
              </p>

              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <div className="text-base sm:text-lg font-semibold truncate">{learnerName}</div>

                {learnerGrade && (
                  <span className="text-[11px] sm:text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-200 border border-emerald-400/30">
                    Grade / Class: {learnerGrade}
                  </span>
                )}

                {learnerSubject && (
                  <span className="text-[11px] sm:text-xs px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-200 border border-sky-400/30">
                    Subject focus: {learnerSubject}
                  </span>
                )}
              </div>

              <div className="mt-2 space-y-0.5 text-xs text-white/70">
                <div className="flex flex-wrap gap-1 items-baseline">
                  <span className="opacity-80">📧 Email:</span>
                  <span className="font-mono break-all">
                    {learnerEmail || 'No email on file yet – ask your teacher to update it.'}
                  </span>
                </div>

                {admissionCode && (
                  <div className="flex flex-wrap gap-1 items-baseline">
                    <span className="opacity-80">🆔 Admission No:</span>
                    <span className="font-mono">{admissionCode}</span>
                  </div>
                )}

                <p className="mt-1 text-[11px] text-white/50">
                  If this name or grade doesn&apos;t look correct, sign out and ask your teacher to
                  confirm your login card.
                </p>
              </div>
            </div>
          </div>
        </section>

{/* Fees & fee structure */}
<section className={card}>
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
    <div>
      <h2 className="text-lg font-semibold">Fees &amp; balances</h2>
      <p className="text-sm text-white/70">
        View your fee structure and current balance from the school office.
      </p>
    </div>

    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => fees?.refresh?.()}
        className="text-[11px] sm:text-xs px-3 py-1.5 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-white/80 font-medium transition"
      >
        Refresh
      </button>

      <Link
        to={learnerFeesHref}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 font-semibold text-sm"
      >
        <span>💳</span>
        Open fees
      </Link>
    </div>
  </div>

  {!isProTier ? (
    <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-900/20 p-3 text-sm text-amber-100">
      This institution’s fees module is available on <b>Pro/Enterprise</b>. If you need fee access, ask your admin.
    </div>
  ) : feeLoading ? (
    <div className="mt-3 text-sm text-white/70">Loading your fee structure…</div>
  ) : feeError ? (
    <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-900/20 p-3 text-sm text-rose-100">
      Could not load fees.{" "}
      <span className="text-white/70">
        {String((feeError as any)?.message || feeError)}
      </span>
    </div>
  ) : !feeStructure ? (
    <div className="mt-3 text-sm text-white/70">
      No fee structure has been assigned to your class yet. Please ask the school office.
    </div>
  ) : (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-white/70">
          Fee structure:{" "}
          <span className="text-white font-semibold">
            {feeStructure?.name || feeStructure?.title || `Structure #${feeStructure?.id ?? ''}`}
          </span>
        </div>

        <div className="text-sm">
          <span className="text-white/60">Total:</span>{" "}
          <span className="font-semibold">
            {moneyFromCents(totalStructureCents, feeCurrency)}
          </span>
        </div>
      </div>

      {feeItems?.length ? (
        <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="divide-y divide-white/10">
            {feeItems.slice(0, 6).map((it, idx) => (
              <div key={it?.id ?? idx} className="px-3 py-2 flex items-center justify-between gap-2">
                <div className="text-sm text-white/80 truncate">
                  {it?.label || it?.name || it?.title || `Item ${idx + 1}`}
                </div>
                <div className="text-sm font-semibold">
                  {moneyFromCents(it?.amount_cents ?? it?.amountCents ?? 0, feeCurrency)}
                </div>
              </div>
            ))}
          </div>

          {feeItems.length > 6 && (
            <div className="px-3 py-2 text-xs text-white/60">
              + {feeItems.length - 6} more items (open fees to view all)
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-white/70">This structure has no items yet.</div>
      )}
    </div>
  )}
</section>


        {/* Exam results & report cards (institution legacy exams) */}
        <section className={card}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Exam results &amp; report cards</h2>
              <p className="text-sm text-white/70">
                View your official institution exam marks and download report cards as PDF for each
                term or exam session.
              </p>
            </div>
            {/* 🔐 learner-only mode with studentId param when available */}
            <Link
              to={examsHref}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-sky-600 hover:bg-sky-500 font-semibold text-sm"
            >
              <span>📄</span>
              Open my results
            </Link>
          </div>
          <p className="mt-2 text-xs text-white/60">
            Results are powered by your institution&apos;s DayBreak exams workspace. You can save or
            print the downloaded report cards.
          </p>
        </section>

        {/* General learner tools */}
        <section className={card}>
          <h3 className="text-base font-semibold mb-2">Learning tools</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Assignments – legacy / file-based only */}
            <Link
              to={assignmentsHref}
              className="group rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-3 flex flex-col justify-between transition"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">Assignments (files)</h4>
                  <span className="text-[11px] text-indigo-300 group-hover:translate-x-0.5 transition">
                    Open →
                  </span>
                </div>
                <p className="mt-1 text-xs text-white/70">
                  See only file-based assignments (PDFs, docs, images) that your teachers have
                  shared with you using the classic / legacy flow.
                </p>
              </div>
            </Link>

            {/* Results & certificates (Robot Tutor + legacy overview) */}
            <Link
              to={resultsHref}
              className="group rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-3 flex flex-col justify-between transition"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">Results &amp; certificates</h4>
                  <span className="text-[11px] text-indigo-300 group-hover:translate-x-0.5 transition">
                    View →
                  </span>
                </div>
                <p className="mt-1 text-xs text-white/70">
                  Check your quiz results from Robot Tutor and legacy exams. Certificates are
                  currently available for Robot Tutor quizzes only.
                </p>
              </div>
            </Link>

            {/* Announcements & newsletters (preview) */}
          <div
            className={`rounded-xl px-3 py-3 flex flex-col justify-between transition border ${
              isProTier
                ? 'bg-white/5 hover:bg-white/10 border-white/10'
                : 'bg-amber-900/20 border-amber-500/30'
            }`}
          >
           <div className="flex items-start justify-between gap-2">
  <div className="min-w-0">
    <h4 className="text-sm font-semibold">School newsletters</h4>
    <p className="mt-1 text-xs text-white/70">
      Read end-of-term newsletters from your school. Download as PDF anytime.
    </p>
  </div>

  <Link
    to="/org/learner/newsletters"
    className="text-[11px] text-indigo-300 hover:text-indigo-200 whitespace-nowrap"
  >
    Open →
  </Link>
</div>


          </div>

            {/* Course library – learner-aware */}
            <Link
              to={coursesHref}
              className="group rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-3 flex flex-col justify-between transition"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">Course library</h4>
                  <span className="text-[11px] text-indigo-300 group-hover:translate-x-0.5 transition">
                    Browse →
                  </span>
                </div>
                <p className="mt-1 text-xs text-white/70">
                  Explore courses, OER resources, and AI lessons that are connected to your account,
                  class
                  {learnerGrade ? ` (${learnerGrade})` : ''} and
                  {learnerSubject ? ` subject (${learnerSubject}).` : ' subjects.'}
                </p>
              </div>
            </Link>

            {/* Messages / help */}
            <Link
              to="/messages"
              className="group rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-3 flex flex-col justify-between transition"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">Messages &amp; help</h4>
                  <span className="text-[11px] text-indigo-300 group-hover:translate-x-0.5 transition">
                    Open →
                  </span>
                </div>
                <p className="mt-1 text-xs text-white/70">
                  Reach your instructors or support and keep all school communication in one place.
                </p>
              </div>
            </Link>
          </div>
        </section>

        {/* Helpful quick links / chips */}
        <section className={card}>
          <h3 className="text-base font-semibold mb-2">Helpful</h3>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link
              to={assignmentsHref}
              className="bg-white/5 border border-white/10 text-xs px-3 py-1 rounded-full hover:bg-white/10"
            >
              Assignments
            </Link>
            {/* 🔐 chips go to learner view too, with studentId when available */}
            <Link
              to={examsHref}
              className="bg-white/5 border border-white/10 text-xs px-3 py-1 rounded-full hover:bg-white/10"
            >
              Exam results
            </Link>
            <Link
              to={resultsHref}
              className="bg-white/5 border border-white/10 text-xs px-3 py-1 rounded-full hover:bg-white/10"
            >
              Certificates
            </Link>
            <Link
              to={coursesHref}
              className="bg-white/5 border border-white/10 text-xs px-3 py-1 rounded-full hover:bg-white/10"
            >
              Course library
            </Link>
            <Link
              to="/org/profile"
              className="bg-white/5 border border-white/10 text-xs px-3 py-1 rounded-full hover:bg-white/10"
            >
              Institution profile
            </Link>
            <Link
              to="/help"
              className="bg-white/5 border border-white/10 text-xs px-3 py-1 rounded-full hover:bg-white/10"
            >
              Help
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
};

export default OrgLearnerHome;
