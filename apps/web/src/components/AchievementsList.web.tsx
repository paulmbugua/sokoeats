// apps/web/src/components/AchievementsList.web.tsx
import React from 'react';
import { useShopContext } from '@mytutorapp/shared/context';
import { useAchievements } from '@mytutorapp/shared/hooks/useAchievements';

type Props = { studentId?: number; title?: string };

const AchievementsList: React.FC<Props> = ({ studentId, title = 'Achievements' }) => {
  const { backendUrl, token } = useShopContext();
  const { achievements, loading, error, refetch } = useAchievements({
    backendUrl,
    token,
    studentId,
  });

  // Skeleton card (for loading state)
  const Skeleton: React.FC = () => (
    <div className="rounded-xl border border-[#cedbe8] dark:border-darkCard p-4 bg-white dark:bg-[#0f1821] animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded bg-[#e7edf4] dark:bg-[#172534]" />
        <div className="flex-1">
          <div className="h-4 w-40 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-2 h-3 w-28 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
      <div className="mt-3 h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
    </div>
  );

  return (
    <section aria-labelledby="achievements-heading" className="space-y-4">
      <header className="flex items-center justify-between">
        <h2
          id="achievements-heading"
          className="text-xl font-bold text-gray-900 dark:text-gray-100"
        >
          {title}
        </h2>
        {!loading && (
          <button
            onClick={() => refetch()}
            className="rounded-lg h-9 px-3 bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard text-sm font-semibold"
            aria-label="Refresh achievements"
          >
            Refresh
          </button>
        )}
      </header>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-[#2b0f10] dark:text-red-300 p-4"
        >
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm">{error}</p>
            <button
              onClick={() => refetch()}
              className="rounded-lg h-8 px-3 bg-red-600 text-white text-xs font-semibold hover:brightness-110"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      )}

      {/* Empty */}
      {!loading && !error && achievements.length === 0 && (
        <div className="rounded-xl border border-[#cedbe8] dark:border-darkCard p-6 bg-white dark:bg-[#0f1821]">
          <p className="text-sm text-gray-700 dark:text-gray-300">No achievements yet.</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Start a course or complete a week to earn your first badge.
          </p>
        </div>
      )}

      {/* List */}
      {!loading && !error && achievements.length > 0 && (
        <ul
          className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4"
          role="list"
          aria-label="Achievement badges"
        >
          {achievements.map((a) => (
            <li key={a.id}>
              <article
                className="rounded-xl border border-[#cedbe8] dark:border-darkCard p-4 bg-white dark:bg-[#0f1821] h-full"
                aria-label={a.title}
              >
                <div className="flex items-center gap-3">
                  {a.icon_url ? (
                    <img
                      src={a.icon_url}
                      alt={`${a.title} badge`}
                      className="w-10 h-10 rounded object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="w-10 h-10 rounded bg-[#e7edf4] dark:bg-[#172534]"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {a.title}
                    </p>
                    <p className="text-xs text-[#49739c] dark:text-[#89a7c2]">
                      {new Date(a.earned_at).toLocaleString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>

                {a.course_id && (
                  <p className="text-xs text-[#49739c] dark:text-[#89a7c2] mt-2">
                    Course: <span className="font-medium">{a.course_id}</span>
                  </p>
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default AchievementsList;
