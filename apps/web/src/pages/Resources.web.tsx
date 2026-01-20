import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import { useResourcesExplore } from '@mytutorapp/shared/hooks';
import type { Course, RecordedVideo } from '@mytutorapp/shared/types';
import type { OerBookItem, OerVideoItem } from '@mytutorapp/shared/api/resourcesApi';
import CourseHero from '../components/CourseHero';

const Tabs: React.FC<{
  value: 'videos' | 'courses';
  onChange: (next: 'videos' | 'courses') => void;
}> = ({ value, onChange }) => (
  <div className="flex gap-2 rounded-full bg-white dark:bg-[#0f1821] ring-1 ring-[#e4ecf4] dark:ring-darkCard p-1">
    {([
      { key: 'videos', label: 'Explore Videos & Notes' },
      { key: 'courses', label: 'Explore Courses' },
    ] as const).map((tab) => (
      <button
        key={tab.key}
        onClick={() => onChange(tab.key)}
        className={`px-4 py-2 text-sm font-semibold rounded-full transition ${
          value === tab.key
            ? 'bg-[#3d99f5] text-white'
            : 'text-[#5e738f] dark:text-darkTextSecondary'
        }`}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

const LoadMoreButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}> = ({ onClick, disabled, label = 'Load more' }) => (
  <div className="pt-3">
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 text-sm font-semibold rounded-full bg-[#3d99f5] text-white disabled:opacity-60"
    >
      {label}
    </button>
  </div>
);

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <p className="text-sm text-[#5e738f] dark:text-darkTextSecondary">{message}</p>
);

const ClassVaultCard: React.FC<{ item: RecordedVideo }> = ({ item }) => (
  <Link
    to={`/class-vault/${item.id}`}
    className="rounded-xl ring-1 ring-[#e4ecf4] dark:ring-darkCard bg-white dark:bg-[#111b25] overflow-hidden hover:shadow-sm transition"
  >
    <div
      className="aspect-video bg-cover bg-center"
      style={{ backgroundImage: `url(${item.thumbnail_url || ''})` }}
    />
    <div className="p-3">
      <p className="text-sm font-semibold line-clamp-2 text-[#0d141c] dark:text-darkTextPrimary">
        {item.title}
      </p>
      <p className="text-xs text-[#49739c] dark:text-darkTextSecondary mt-1">
        {item.subject || item.grade_level || 'ClassVault'}
      </p>
    </div>
  </Link>
);

const OerVideoCard: React.FC<{ item: OerVideoItem }> = ({ item }) => {
  const id = item.slug || item.title;
  return (
    <Link
      to={`/videos/${encodeURIComponent(String(id))}`}
      className="rounded-xl ring-1 ring-[#e4ecf4] dark:ring-darkCard bg-white dark:bg-[#111b25] overflow-hidden hover:shadow-sm transition"
    >
      <div
        className="aspect-video bg-cover bg-center"
        style={{ backgroundImage: `url(${item.thumbnail_url || ''})` }}
      />
      <div className="p-3">
        <p className="text-sm font-semibold line-clamp-2 text-[#0d141c] dark:text-darkTextPrimary">
          {item.title}
        </p>
        <p className="text-xs text-[#49739c] dark:text-darkTextSecondary mt-1">
          {item.provider || item.subject || 'OER Video'}
        </p>
      </div>
    </Link>
  );
};

const CourseCard: React.FC<{ course: Course }> = ({ course }) => (
  <Link
    to={`/courses/${encodeURIComponent(String(course.id))}`}
    className="rounded-xl ring-1 ring-[#e4ecf4] dark:ring-darkCard bg-white dark:bg-[#111b25] overflow-hidden hover:shadow-sm transition"
  >
    <div className="h-28">
      <CourseHero course={course} className="h-full" />
    </div>
    <div className="p-3">
      <p className="text-sm font-semibold line-clamp-2 text-[#0d141c] dark:text-darkTextPrimary">
        {course.title}
      </p>
      <p className="text-xs text-[#49739c] dark:text-darkTextSecondary mt-1">
        {course.subject || 'Course'}
      </p>
    </div>
  </Link>
);

const OerBookCard: React.FC<{ item: OerBookItem }> = ({ item }) => {
  const id = item.slug || item.id;
  return (
    <Link
      to={`/oer/${encodeURIComponent(String(id))}`}
      className="rounded-xl ring-1 ring-[#e4ecf4] dark:ring-darkCard bg-white dark:bg-[#111b25] overflow-hidden hover:shadow-sm transition"
    >
      <div
        className="aspect-[4/3] bg-cover bg-center"
        style={{ backgroundImage: `url(${item.cover_url || ''})` }}
      />
      <div className="p-3">
        <p className="text-sm font-semibold line-clamp-2 text-[#0d141c] dark:text-darkTextPrimary">
          {item.title}
        </p>
        <p className="text-xs text-[#49739c] dark:text-darkTextSecondary mt-1">OpenStax book</p>
      </div>
    </Link>
  );
};

const ResourcesPage: React.FC = () => {
  const [params] = useSearchParams();
  const initialTab = (params.get('tab') || '').toLowerCase() === 'library' ? 'videos' : 'courses';
  const [tab, setTab] = useState<'videos' | 'courses'>(initialTab as 'videos' | 'courses');
  const [query, setQuery] = useState<string>(params.get('q') ?? '');
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  const explore = useResourcesExplore(debouncedQuery, tab);

  const headerCopy = useMemo(
    () =>
      tab === 'videos'
        ? 'Discover ClassVault marketplace items and free OER videos.'
        : 'Browse tutor-led courses and free OER books.',
    [tab]
  );

  return (
    <div
      className="relative min-h-screen flex flex-col bg-slate-50 dark:bg-darkBg text-[#0d141c] dark:text-darkTextPrimary overflow-x-hidden"
      style={{ fontFamily: 'Manrope, "Noto Sans", sans-serif' }}
    >
      <main className="flex-1">
        <div className="mx-auto w-full max-w-screen-xl lg:max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
          <div className="flex flex-col gap-2">
            <h1 className="tracking-tight text-[28px] sm:text-[32px] font-bold">Explore</h1>
            <p className="text-sm text-[#49739c] dark:text-darkTextSecondary">{headerCopy}</p>
          </div>

          <div className="flex flex-col gap-3">
            <label className="flex h-12 w-full">
              <div className="flex w-full items-stretch rounded-xl ring-1 ring-[#e7edf4] dark:ring-darkCard bg-[#e7edf4] dark:bg-[#172534] focus-within:ring-primary transition">
                <div className="text-[#49739c] dark:text-darkTextSecondary flex items-center justify-center pl-4">
                  <FontAwesomeIcon icon={faMagnifyingGlass} />
                </div>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search videos, notes, or courses"
                  className="w-full bg-transparent h-full px-4 outline-none placeholder:text-[#49739c] dark:placeholder:text-darkTextSecondary"
                />
              </div>
            </label>

            <Tabs value={tab} onChange={setTab} />
          </div>

          {tab === 'videos' ? (
            <div className="space-y-6">
              <section className="rounded-2xl bg-white dark:bg-[#0f1821] ring-1 ring-[#e4ecf4] dark:ring-darkCard p-4 sm:p-5">
                <h2 className="text-lg font-semibold">ClassVault marketplace</h2>
                <p className="text-xs text-[#49739c] dark:text-darkTextSecondary mt-1">
                  Discover videos and notes from tutors.
                </p>
                <div className="mt-4">
                  {explore.classVault.loading && explore.classVault.items.length === 0 ? (
                    <p className="text-sm text-[#5e738f] dark:text-darkTextSecondary">Loading…</p>
                  ) : explore.classVault.error ? (
                    <p className="text-sm text-red-600">{explore.classVault.error}</p>
                  ) : explore.classVault.items.length === 0 ? (
                    <EmptyState message="No ClassVault results yet." />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {explore.classVault.items.map((item) => (
                        <ClassVaultCard key={String(item.id)} item={item} />
                      ))}
                    </div>
                  )}
                  {explore.classVault.hasMore && (
                    <LoadMoreButton
                      onClick={explore.classVault.loadMore}
                      disabled={explore.classVault.loading}
                    />
                  )}
                </div>
              </section>

              <section className="rounded-2xl bg-white dark:bg-[#0f1821] ring-1 ring-[#e4ecf4] dark:ring-darkCard p-4 sm:p-5">
                <h2 className="text-lg font-semibold">Free OER videos</h2>
                <p className="text-xs text-[#49739c] dark:text-darkTextSecondary mt-1">
                  Open resources from public providers.
                </p>
                <div className="mt-4">
                  {explore.oerVideos.loading && explore.oerVideos.items.length === 0 ? (
                    <p className="text-sm text-[#5e738f] dark:text-darkTextSecondary">Loading…</p>
                  ) : explore.oerVideos.error ? (
                    <p className="text-sm text-red-600">{explore.oerVideos.error}</p>
                  ) : explore.oerVideos.items.length === 0 ? (
                    <EmptyState message="No OER videos match that search." />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {explore.oerVideos.items.map((item) => (
                        <OerVideoCard key={String(item.slug || item.title)} item={item} />
                      ))}
                    </div>
                  )}
                  {explore.oerVideos.hasMore && (
                    <LoadMoreButton
                      onClick={explore.oerVideos.loadMore}
                      disabled={explore.oerVideos.loading}
                    />
                  )}
                </div>
              </section>
            </div>
          ) : (
            <div className="space-y-6">
              <section className="rounded-2xl bg-white dark:bg-[#0f1821] ring-1 ring-[#e4ecf4] dark:ring-darkCard p-4 sm:p-5">
                <h2 className="text-lg font-semibold">Courses</h2>
                <p className="text-xs text-[#49739c] dark:text-darkTextSecondary mt-1">
                  Explore tutor-led courses available to enroll.
                </p>
                <div className="mt-4">
                  {explore.normalCourses.loading && explore.normalCourses.items.length === 0 ? (
                    <p className="text-sm text-[#5e738f] dark:text-darkTextSecondary">Loading…</p>
                  ) : explore.normalCourses.error ? (
                    <p className="text-sm text-red-600">{explore.normalCourses.error}</p>
                  ) : explore.normalCourses.items.length === 0 ? (
                    <EmptyState message="No courses found yet." />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {explore.normalCourses.items.map((course) => (
                        <CourseCard key={String(course.id)} course={course} />
                      ))}
                    </div>
                  )}
                  {explore.normalCourses.hasMore && (
                    <LoadMoreButton
                      onClick={explore.normalCourses.loadMore}
                      disabled={explore.normalCourses.loading}
                    />
                  )}
                </div>
              </section>

              <section className="rounded-2xl bg-white dark:bg-[#0f1821] ring-1 ring-[#e4ecf4] dark:ring-darkCard p-4 sm:p-5">
                <h2 className="text-lg font-semibold">Free OER books</h2>
                <p className="text-xs text-[#49739c] dark:text-darkTextSecondary mt-1">
                  OpenStax and other openly licensed books.
                </p>
                <div className="mt-4">
                  {explore.oerBooks.loading && explore.oerBooks.items.length === 0 ? (
                    <p className="text-sm text-[#5e738f] dark:text-darkTextSecondary">Loading…</p>
                  ) : explore.oerBooks.error ? (
                    <p className="text-sm text-red-600">{explore.oerBooks.error}</p>
                  ) : explore.oerBooks.items.length === 0 ? (
                    <EmptyState message="No OER books match that search." />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {explore.oerBooks.items.map((item) => (
                        <OerBookCard key={String(item.slug || item.id)} item={item} />
                      ))}
                    </div>
                  )}
                  {explore.oerBooks.hasMore && (
                    <LoadMoreButton
                      onClick={explore.oerBooks.loadMore}
                      disabled={explore.oerBooks.loading}
                    />
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default ResourcesPage;
