// apps/web/src/pages/CourseDetails.web.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import debounce from 'lodash.debounce';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useShopContext } from '@mytutorapp/shared/context';
import { useCourses, useEnrollments, useOerMeta } from '@mytutorapp/shared/hooks';
import { useCourseReviews } from '@mytutorapp/shared/hooks/useCourseReviews';
import type { Course } from '@mytutorapp/shared/types';

interface MaybeInstructor {
  tutorName?: string;
  instructor?: { name?: string; bio?: string };
}

const StarRow: React.FC<{ avg?: number; count?: number }> = ({ avg = 0, count = 0 }) => {
  const a = Math.round(avg * 2) / 2;
  const stars = [1, 2, 3, 4, 5].map((i) => (a >= i ? '★' : a + 0.5 === i ? '☆' : '☆')).join('');
  return (
    <span
      className="text-sm text-[#49739c] dark:text-darkTextSecondary"
      title={`${avg.toFixed(1)} (${count})`}
    >
      {stars} {avg.toFixed(1)} ({count})
    </span>
  );
};

/** Coerce any price-like value to whole tokens (non-negative int) */
function toTokens(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v) : 0;
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

const CourseDetails: React.FC = () => {
  const navigate = useNavigate();
  const { courseId } = useParams<{ courseId: string }>();
  const { backendUrl, token, profile, tokens: walletTokens = 0 } = useShopContext();
  const role = String(profile?.role ?? '').toLowerCase();
  const myId = String(profile?.id ?? '');

  // --- Fetch course details ---
  const {
    selectedCourse,
    loading: loadingCourse,
    error: courseError,
    fetchCourseById,
  } = useCourses({ backendUrl, token });

  useEffect(() => {
    if (courseId) void fetchCourseById(courseId);
  }, [courseId, fetchCourseById]);

  const c: Course | null | undefined = selectedCourse ?? null;

  // --- Enrollments + Purchase flow ---
  const {
    enroll, // kept for symmetry / fallback usages
    cancel,
    enrollments,
    loading: enrollmentsLoading,
    error: enrollError,
    fetchMine,
    purchaseCourseAndEnroll, // ✅ purchase + auto-enroll
  } = useEnrollments({
    backendUrl,
    token: token ?? '',
    studentId: 'me' as unknown as string | number,
  });

  useEffect(() => {
    if (token) void fetchMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const myEnrollment = useMemo(() => {
    if (!courseId) return undefined;
    return enrollments.find((e: any) => String(e?.course_id ?? e?.courseId) === String(courseId));
  }, [enrollments, courseId]);

  // Always treat price as tokens
  const priceTokens = useMemo(() => toTokens(c?.price), [c?.price]);
  const hasEnough = walletTokens >= priceTokens;

  // Tutor block
  const mi = (c ?? {}) as Course & MaybeInstructor;
  const tutorName = mi.tutorName || mi.instructor?.name || 'Your tutor';
  const tutorBio = mi.instructor?.bio || 'Experienced educator';
  const oerMeta = useOerMeta(courseId);
  // -------- Reviews wiring --------
  const { avg, count, hasMyReview, reload, submit, posting } = useCourseReviews(
    backendUrl,
    courseId,
    { myStudentId: myId, token: token ?? '' }
  );
  const debouncedReload = useMemo(
    () =>
      debounce(() => {
        void reload();
      }, 200),
    [reload]
  );
  useEffect(() => () => debouncedReload.cancel(), [debouncedReload]);

  const [openReview, setOpenReview] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  // ----- Actions -----
  const onPurchaseAndEnroll = async () => {
    if (!courseId || !c) return;

    const proceed = window.confirm(
      `You are about to purchase "${c.title}" for ${priceTokens} tokens.\n\n` +
        `This amount will be deducted from your balance (${walletTokens} tokens). Continue?`
    );
    if (!proceed) return;

    // If balance is insufficient → deep-link to Profile payment section
    if (!hasEnough) {
      const goBuy = window.confirm('Not enough tokens. Would you like to buy more now?');
      if (goBuy) navigate('/profile/me?openPayment=1');
      return;
    }

    try {
      await purchaseCourseAndEnroll(courseId, priceTokens);
      navigate(`/progress/${courseId}`);
    } catch (e: any) {
      const msg: string = e?.message || '';
      if (/insufficient/i.test(msg)) {
        const go = window.confirm('Not enough tokens. Would you like to buy more now?');
        if (go) navigate('/profile/me?openPayment=1');
      }
      // Hook surfaces other errors via enrollError below
    }
  };

  const onContinue = () => {
    if (!courseId) return;
    navigate(`/progress/${courseId}`);
  };

  const onUnenroll = async () => {
    if (!myEnrollment?.id) return;
    try {
      await cancel(String(myEnrollment.id));
      debouncedReload();
    } catch {}
  };

  const onSubmitReview = useCallback(async () => {
    if (rating < 1 || !courseId) return;
    await submit(rating, comment);
    setOpenReview(false);
    setRating(0);
    setComment('');
  }, [submit, rating, comment, courseId]);

  // ----- Guards / states -----
  if (!courseId) {
    return <div className="max-w-4xl mx-auto p-6 text-red-600">Missing course id.</div>;
  }
  if (loadingCourse && !c) {
    return <div className="max-w-4xl mx-auto p-6">Loading course…</div>;
  }
  if (courseError && !c) {
    return <div className="max-w-4xl mx-auto p-6 text-red-600">Failed to load course.</div>;
  }
  if (!c) {
    return <div className="max-w-4xl mx-auto p-6">Course not found.</div>;
  }

  const isEnrolled = Boolean(myEnrollment);
  const disablePrimary = !token || enrollmentsLoading;

  return (
    <div
      className="min-h-screen bg-slate-50 dark:bg-darkBg text-[#0d141c] dark:text-darkTextPrimary"
      style={{ fontFamily: `Manrope, "Noto Sans", sans-serif` }}
    >
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] sm:text-[34px] font-extrabold tracking-[-0.02em]">
              {c.title}
            </h1>
            {c.description && (
              <p className="mt-2 text-[#49739c] dark:text-darkTextSecondary">{c.description}</p>
            )}

            {oerMeta && (
              <span className="inline-flex items-center rounded-lg bg-[#e7edf4] dark:bg-[#172534] px-3 h-8">
                OER • {oerMeta.catalog_provider.toUpperCase()}
              </span>
            )}

            {/* ⭐ Rating row */}
            <div className="mt-2">
              <StarRow avg={avg} count={count} />
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              {c.level && (
                <span className="inline-flex items-center rounded-lg bg-[#e7edf4] dark:bg-[#172534] px-3 h-8">
                  Level: {c.level}
                </span>
              )}
              {c.duration && (
                <span className="inline-flex items-center rounded-lg bg-[#e7edf4] dark:bg-[#172534] px-3 h-8">
                  Duration: {c.duration}
                </span>
              )}
              <span className="inline-flex items-center rounded-lg bg-[#e7edf4] dark:bg-[#172534] px-3 h-8">
                Price: {priceTokens} tokens
              </span>
            </div>

            {/* Balance helper like ClassVaultDetail */}
            <div className="mt-2 text-sm text-[#49739c] dark:text-darkTextSecondary">
              Your balance: {walletTokens} tokens
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {/* Primary CTA varies by role and enrollment */}
            {role === 'tutor' ? (
              <Link
                to="/my-courses"
                className="rounded-xl h-10 px-4 bg-[#e7edf4] dark:bg-[#172534] text-sm font-semibold flex items-center justify-center"
                title="Go to your course list"
              >
                Manage / Share
              </Link>
            ) : isEnrolled ? (
              <>
                <button
                  onClick={onContinue}
                  className="rounded-xl h-10 px-5 bg-[#3d99f5] text-white text-sm font-semibold hover:brightness-110"
                >
                  Continue Course
                </button>
                <button
                  onClick={onUnenroll}
                  className="rounded-xl h-10 px-4 bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard text-sm font-semibold"
                >
                  Unenroll
                </button>
                {oerMeta && (
                  <a
                    href={`${backendUrl}/api/oer/transcript/${courseId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl h-10 px-4 bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard text-sm font-semibold"
                  >
                    Download Transcript (Free)
                  </a>
                )}

                {/* Review button when enrolled & not yet reviewed */}
                {!hasMyReview && (
                  <button
                    onClick={() => setOpenReview(true)}
                    className="rounded-xl h-10 px-4 bg-[#e7edf4] dark:bg-[#172534] text-sm font-semibold"
                  >
                    Review this course
                  </button>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={onPurchaseAndEnroll}
                  disabled={disablePrimary}
                  className="rounded-xl h-10 px-5 bg-[#3d99f5] text-white text-sm font-semibold hover:brightness-110 disabled:opacity-60"
                >
                  {enrollmentsLoading ? 'Checking…' : 'Purchase & Enroll'}
                </button>
                {!hasEnough && (
                  <button
                    onClick={() => navigate('/profile/me?openPayment=1')}
                    className="rounded-xl h-10 px-4 bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard text-sm font-semibold"
                  >
                    Buy Tokens
                  </button>
                )}
              </div>
            )}

            {/* Achievements quick link */}
            <Link
              to="/achievements"
              className="rounded-xl h-10 px-4 bg-[#e7edf4] dark:bg-[#172534] text-sm font-semibold flex items-center justify-center"
              title="See achievements"
            >
              Achievements
            </Link>

            {/* Back */}
            <button
              onClick={() => navigate(-1)}
              className="rounded-xl h-10 px-4 bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard text-sm font-semibold"
            >
              Back
            </button>

            {enrollError && <p className="text-xs text-red-600 mt-1">{String(enrollError)}</p>}
          </div>
        </div>

        {/* Tutor card */}
        <section className="mt-6 rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] p-4">
          <h2 className="text-lg font-bold mb-3">About the tutor</h2>
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-full bg-[#e7edf4] dark:bg-[#172534]" />
            <div className="flex flex-col">
              <p className="font-semibold">{tutorName}</p>
              <p className="text-sm text-[#49739c] dark:text-darkTextSecondary">{tutorBio}</p>
            </div>
          </div>
        </section>

        {/* Syllabus preview */}
        <section className="mt-6 rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] p-4">
          <h2 className="text-lg font-bold mb-3">Syllabus</h2>
          {Array.isArray(c.syllabus) && c.syllabus.length > 0 ? (
            <ol className="space-y-2 list-decimal pl-5">
              {c.syllabus.slice(0, 12).map((w) => (
                <li key={w.week} className="break-words">
                  <span className="font-medium">Week {w.week}:</span> {w.topic || 'TBA'}
                  {w.assignment && (
                    <span className="block text-sm text-[#49739c] dark:text-darkTextSecondary">
                      Assignment: {w.assignment}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[#49739c] dark:text-darkTextSecondary">No syllabus yet.</p>
          )}
        </section>
      </main>

      {/* Review modal */}
      {openReview && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0f1821] p-4 ring-1 ring-[#cedbe8] dark:ring-darkCard">
            <h3 className="text-lg font-bold mb-2">Rate this course</h3>
            <p className="text-sm text-[#49739c] dark:text-darkTextSecondary mb-3">{c.title}</p>
            <div className="flex items-center gap-2 mb-3">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(n)}
                  className={n <= rating ? 'text-yellow-500 text-2xl' : 'text-[#49739c] text-2xl'}
                  aria-label={`${n} star`}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optional comment (max 500 chars)"
              maxLength={500}
              className="w-full text-sm rounded-lg p-2 bg-[#e7edf4] dark:bg-[#172534]"
            />
            <div className="mt-4 flex items-center gap-2">
              <button
                disabled={posting || rating < 1}
                onClick={onSubmitReview}
                className="px-4 h-10 rounded-xl bg-[#3d99f5] text-white text-sm font-semibold disabled:opacity-60"
              >
                {posting ? 'Saving…' : 'Submit'}
              </button>
              <button
                onClick={() => setOpenReview(false)}
                className="px-4 h-10 rounded-xl bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CourseDetails;
