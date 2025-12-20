// apps/web/src/pages/CourseEnrollment.web.tsx
import React, { useEffect, useMemo } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useShopContext } from '@mytutorapp/shared/context';
import { useEnrollments } from '@mytutorapp/shared/hooks/useEnrollments';
import { useCourses } from '@mytutorapp/shared/hooks';
import type { Course } from '@mytutorapp/shared/types';

interface Props {
  /** Optional: preloaded course; if not provided we fetch by id */
  course?: Course;
}

/** Helper to coerce price into whole tokens */
function toTokens(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v) : 0;
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

const CourseEnrollment: React.FC<Props> = ({ course }) => {
  const navigate = useNavigate();
  const { courseId } = useParams<{ courseId: string }>();
  const { backendUrl, token, role, tokens: walletTokens = 0 } = useShopContext();

  // 🔒 Gate: must be logged in + student role
  if (!token) return <Navigate to="/login" replace />;
  if (role !== 'student') return <Navigate to="/" replace />;

  // Use "me" so backend resolves req.user.id from JWT
  const { purchaseCourseAndEnroll, fetchMine, enrollments, loading, error } = useEnrollments({
    backendUrl,
    token,
    studentId: 'me' as unknown as string | number,
  });

  const {
    selectedCourse,
    loading: loadingCourse,
    error: courseError,
    fetchCourseById,
  } = useCourses({ backendUrl, token });

  useEffect(() => {
    if (!course && courseId) {
      void fetchCourseById(courseId);
    }
  }, [course, courseId, fetchCourseById]);

  // Keep local enrollments up to date so we can render "Already enrolled"
  useEffect(() => {
    if (token) void fetchMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, courseId]);

  const c: Course | undefined = course ?? selectedCourse ?? undefined;

  // Fast lookup for enrolled state
  const alreadyEnrolled = useMemo(() => {
    if (!courseId) return false;
    return enrollments.some((e: any) => String(e.course_id ?? e.courseId) === String(courseId));
  }, [enrollments, courseId]);

  // Price is always in tokens (from MyCourses)
  const priceTokens = useMemo(() => toTokens(c?.price), [c?.price]);
  const hasEnough = walletTokens >= priceTokens;

  const handlePurchase = async () => {
    if (!courseId || !c) return;

    const proceed = window.confirm(
      `You are about to purchase "${c.title}" for ${priceTokens} tokens.\n\n` +
        `This amount will be deducted from your balance (${walletTokens} tokens). Continue?`
    );
    if (!proceed) return;

    // Client-side insufficient balance guard
    if (!hasEnough) {
      const buy = window.confirm('Not enough tokens. Would you like to buy more now?');
      if (buy) navigate('/buy-tokens');
      return;
    }

    try {
      await purchaseCourseAndEnroll(courseId, priceTokens);
      navigate(`/progress/${courseId}`);
    } catch (e: any) {
      const msg: string = e?.message || '';
      if (/insufficient/i.test(msg)) {
        const buy = window.confirm('Not enough tokens. Would you like to buy more now?');
        if (buy) navigate('/buy-tokens');
      }
      // otherwise error is shown below from hook state
    }
  };

  if (!courseId) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-red-600 dark:text-red-400">Missing course id.</div>
    );
  }
  if (loadingCourse && !c) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-gray-700 dark:text-gray-300">Loading course…</div>
    );
  }
  if (courseError && !c) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-red-600 dark:text-red-400">
        Failed to load course.
      </div>
    );
  }
  if (!c) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-gray-700 dark:text-gray-300">
        Course not found.
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] p-6">
        <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-gray-100">{c.title}</h1>

        {c.description && <p className="text-gray-700 dark:text-gray-300 mb-4">{c.description}</p>}

        <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400 mb-4">
          {c.level && <span>Level: {c.level}</span>}
          {c.duration && <span>Duration: {c.duration}</span>}
        </div>

        {/* Price + balance like ClassVaultDetail gating */}
        <div className="mb-4 flex flex-col gap-1">
          <p className="font-semibold text-gray-900 dark:text-gray-100">
            Price: {priceTokens} tokens
          </p>
          <p className="text-sm text-[#49739c] dark:text-darkTextSecondary">
            Your balance: {walletTokens} tokens
          </p>
        </div>

        {alreadyEnrolled ? (
          <button
            onClick={() => navigate(`/progress/${courseId}`)}
            className="rounded-xl h-10 px-4 bg-[#e7edf4] dark:bg-[#172534] text-[#0d141c] dark:text-darkTextPrimary text-sm font-semibold hover:bg-slate-100"
          >
            Go to Course
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={handlePurchase}
              disabled={loading}
              className="rounded-xl h-10 px-4 bg-[#3d99f5] text-white text-sm font-semibold hover:brightness-110 disabled:opacity-60"
            >
              {loading ? 'Purchasing…' : `Purchase & Enroll`}
            </button>

            {!hasEnough && (
              <button
                onClick={() => navigate('/buy-tokens')}
                className="rounded-xl h-10 px-4 bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard text-sm font-semibold"
              >
                Buy Tokens
              </button>
            )}
          </div>
        )}

        {error && <p className="text-red-600 dark:text-red-400 mt-4 text-sm">{String(error)}</p>}

        {/* Syllabus preview */}
        {Array.isArray(c.syllabus) && c.syllabus.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-gray-100">
              Syllabus
            </h2>
            <ul className="list-disc list-inside text-gray-800 dark:text-gray-200">
              {c.syllabus.map((s) => (
                <li key={s.week} className="mb-1">
                  <strong>Week {s.week}:</strong> {s.topic}{' '}
                  {s.assignment && <span>- {s.assignment}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default CourseEnrollment;
