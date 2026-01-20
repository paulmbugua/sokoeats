// apps/web/src/pages/MyEnrollments.web.tsx
import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useShopContext } from '@mytutorapp/shared/context';
import { useEnrollments } from '@mytutorapp/shared/hooks';
import type { Enrollment } from '@mytutorapp/shared/types';

type NormalizedEnrollment = {
  id: string;
  courseId: string;
  title: string;
  description: string;
  level: string;
  startedAt: string | null;
  status: string;
  progress: number;
};

/** Safely normalize mixed-case payloads without using `any`. */
function normalizeEnrollment(row: unknown): NormalizedEnrollment {
  const o = (row ?? {}) as Record<string, unknown>;

  const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

  const num = (v: unknown, fallback = 0): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;

  const id = str(o.id) || String(o.id ?? '');
  const courseId = str(o['courseId']) || str(o['course_id']);
  const title = str(o['title']) || str(o['courseTitle']) || 'Course';
  const description = str(o['description']);
  const level = str(o['level']) || 'All levels';
  const startedAt = str(o['started_at']) || str(o['enrolled_at']) || str(o['startedAt']) || null;
  const status = str(o['status']) || 'active';
  const progressRaw = o['progress'];
  const progress = num(progressRaw);

  return { id, courseId, title, description, level, startedAt, status, progress };
}

const MyEnrollmentsPage: React.FC = () => {
  const { backendUrl, token, profile, role: ctxRole } = useShopContext();

  // 🔒 Must be logged in
  if (!token) return <Navigate to="/login" replace />;

  // Prefer profile.role (like MyCourses), fall back to ctxRole
  const roleStr = String((profile as any)?.role ?? ctxRole ?? '').toLowerCase();

  // If we still don't know the role but user is logged in, show a lightweight placeholder
  const roleUnknown = !roleStr;
  if (roleUnknown) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-darkBg px-6">
        <p className="text-sm text-[#49739c] dark:text-darkTextSecondary">Checking your account…</p>
      </div>
    );
  }

  // Tutors: send to a valid route (NOT "/courses/:id/edit")
  if (roleStr === 'tutor') {
    return <Navigate to="/my-courses" replace />;
  }

  // Only non-students should see access denied
  if (roleStr !== 'student') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-darkBg px-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Access denied</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            This page is only available to student accounts.
          </p>
          <Link
            to="/"
            className="mt-4 inline-block rounded-xl h-10 px-4 bg-[#e7edf4] dark:bg-[#172534] text-sm font-semibold"
          >
            Go back home
          </Link>
        </div>
      </div>
    );
  }

  // ✅ Use "me" so backend resolves req.user.id from JWT
  const { enrollments, loading, error, setError, fetchMine, cancel, setEnrollments } =
    useEnrollments({ backendUrl, token, studentId: 'me' as unknown as string | number });

  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetchMine().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleStr]);

  const handleUnenroll = async (enrollmentId: string) => {
    setDeleting(enrollmentId);
    try {
      // optimistic UI
      setEnrollments((prev) =>
        prev.filter((e) => String((e as Enrollment).id) !== String(enrollmentId))
      );
      await cancel(enrollmentId);
    } catch {
      await fetchMine().catch(() => {});
      setError('Failed to unenroll. Please try again.');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div
      className="relative min-h-screen flex flex-col bg-slate-50 dark:bg-darkBg text-[#0d141c] dark:text-darkTextPrimary"
      style={{ fontFamily: `Manrope, "Noto Sans", sans-serif` }}
    >
      <div className="flex flex-1 justify-center py-6 px-4 sm:px-6 lg:px-10">
        <div className="w-full max-w-[1000px]">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-[28px] sm:text-[32px] font-bold leading-tight">My Enrollments</h1>
            <Link
              to="/resources?tab=courses"
              className="rounded-xl h-10 px-4 bg-[#3d99f5] text-white text-sm font-semibold hover:brightness-110"
            >
              Explore courses
            </Link>
          </div>

          {loading && (
            <p className="text-sm text-[#49739c] dark:text-darkTextSecondary">
              Loading your enrollments…
            </p>
          )}

          {!loading && error && (
            <p className="text-sm text-red-600 dark:text-red-400">{String(error)}</p>
          )}

          {!loading && !error && enrollments.length === 0 && (
            <div className="rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] p-6">
              <p className="text-base">You have no enrollments yet.</p>
              <p className="text-sm text-[#49739c] dark:text-darkTextSecondary mt-1">
                Browse the catalog to get started.
              </p>
              <div className="mt-4">
                <Link
                  to="/resources?tab=courses"
                  className="inline-flex rounded-xl h-10 px-4 bg-[#e7edf4] dark:bg-[#172534] text-sm font-semibold"
                >
                  Go to Catalog
                </Link>
              </div>
            </div>
          )}

          {!loading && !error && enrollments.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {enrollments.map((row) => {
                const n = normalizeEnrollment(row);

                return (
                  <div
                    key={n.id}
                    className="rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] p-4 flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold line-clamp-1">{n.title}</p>
                        <p className="text-[#49739c] dark:text-darkTextSecondary text-sm line-clamp-2">
                          {n.description}
                        </p>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-lg bg-[#e7edf4] dark:bg-[#172534]">
                        {n.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex-1 overflow-hidden rounded-sm bg-[#cedbe8] dark:bg-darkCard">
                        <div className="h-1.5 bg-[#3d99f5]" style={{ width: `${n.progress}%` }} />
                      </div>
                      <span className="text-xs font-medium">{n.progress}%</span>
                    </div>

                    <p className="text-xs text-[#49739c] dark:text-darkTextSecondary">
                      {n.startedAt ? `Started: ${new Date(n.startedAt).toLocaleDateString()}` : '—'}
                    </p>

                    <div className="mt-1 flex items-center gap-2">
                      <Link
                        to={`/courses/${n.courseId}`}
                        className="rounded-xl h-9 px-3 bg-[#e7edf4] dark:bg-[#172534] text-sm font-semibold"
                      >
                        View course
                      </Link>

                      <button
                        onClick={() => handleUnenroll(String(n.id))}
                        disabled={deleting === String(n.id)}
                        className="rounded-xl h-9 px-3 bg-red-50 dark:bg-[#2a0d11] text-red-600 dark:text-red-400 text-sm font-semibold disabled:opacity-60"
                      >
                        {deleting === String(n.id) ? 'Removing…' : 'Unenroll'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MyEnrollmentsPage;
