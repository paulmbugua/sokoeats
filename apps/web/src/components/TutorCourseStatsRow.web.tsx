// apps/web/src/components/TutorCourseStatsRow.web.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useShopContext } from '@mytutorapp/shared/context';
import { useEnrollments } from '@mytutorapp/shared/hooks';
import type { Enrollment } from '@mytutorapp/shared/types';

type Props = { courseId: string; title?: string };

export default function TutorCourseStatsRow({ courseId, title }: Props) {
  const { backendUrl, token } = useShopContext();
  const { enrollments, fetchByCourse, loading, error } = useEnrollments({
    backendUrl,
    token: token ?? '',
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetchByCourse(courseId).finally(() => setReady(true));
  }, [courseId, fetchByCourse]);

  const avgPct = useMemo(() => {
    if (!enrollments.length) return 0;
    const sum = enrollments.reduce((acc, e: Enrollment) => acc + (Number(e.progress) || 0), 0);
    return Math.round(sum / enrollments.length);
  }, [enrollments]);

  return (
    <div className="rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold line-clamp-1">{title ?? `Course #${courseId}`}</p>
          <p className="text-[#49739c] dark:text-darkTextSecondary text-sm">Quick stats</p>
        </div>
        <Link
          to={`/courses/${courseId}/edit`}
          className="rounded-lg h-8 px-3 flex items-center bg-[#e7edf4] dark:bg-[#172534] font-semibold"
        >
          Edit
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-[#cedbe8] dark:border-darkCard p-3">
          <div className="text-[#49739c] dark:text-darkTextSecondary">Enrollments</div>
          <div className="text-lg font-bold">{loading && !ready ? '…' : enrollments.length}</div>
        </div>
        <div className="rounded-xl border border-[#cedbe8] dark:border-darkCard p-3">
          <div className="text-[#49739c] dark:text-darkTextSecondary">Avg completion</div>
          <div className="text-lg font-bold">{error ? '—' : `${avgPct}%`}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <Link
          to={`/tutor/courses/${courseId}/students`}
          className="rounded-lg h-8 px-3 flex items-center bg-[#e7edf4] dark:bg-[#172534] font-semibold"
        >
          Manage students
        </Link>
        <Link
          to={`/courses/${courseId}`}
          className="rounded-lg h-8 px-3 flex items-center bg-[#3d99f5] text-white font-semibold"
        >
          View
        </Link>
      </div>
    </div>
  );
}
