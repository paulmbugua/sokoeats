import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMyLibrary } from '@mytutorapp/shared/hooks';
import { useShopContext } from '@mytutorapp/shared/context';
import type { Course, RecordedVideo } from '@mytutorapp/shared/types';
import CourseHero from '../components/CourseHero';

const SectionShell: React.FC<{
  title: string;
  subtitle: string;
  children: React.ReactNode;
}> = ({ title, subtitle, children }) => (
  <section className="rounded-2xl bg-white dark:bg-[#0f1821] ring-1 ring-[#e4ecf4] dark:ring-darkCard p-4 sm:p-5">
    <div className="flex flex-col gap-1 mb-4">
      <h2 className="text-lg sm:text-xl font-semibold text-[#0d141c] dark:text-darkTextPrimary">
        {title}
      </h2>
      <p className="text-xs sm:text-sm text-[#49739c] dark:text-darkTextSecondary">{subtitle}</p>
    </div>
    {children}
  </section>
);

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <p className="text-sm text-[#5e738f] dark:text-darkTextSecondary">{message}</p>
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

const ClassVaultCard: React.FC<{ item: RecordedVideo; isPurchased?: boolean }> = ({
  item,
  isPurchased,
}) => (
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
      {isPurchased && (
        <span className="inline-flex mt-2 text-[11px] px-2 py-0.5 rounded-full bg-[#eaf2ff] text-[#2a6fd6]">
          Purchased
        </span>
      )}
    </div>
  </Link>
);

const CourseCard: React.FC<{ course: Course; onOpen: () => void; label?: string }> = ({
  course,
  onOpen,
  label,
}) => (
  <button
    type="button"
    onClick={onOpen}
    className="text-left rounded-xl ring-1 ring-[#e4ecf4] dark:ring-darkCard bg-white dark:bg-[#111b25] overflow-hidden hover:shadow-sm transition"
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
      {label && (
        <span className="inline-flex mt-2 text-[11px] px-2 py-0.5 rounded-full bg-[#f0f7ff] text-[#2a6fd6]">
          {label}
        </span>
      )}
    </div>
  </button>
);

const MyCourses: React.FC = () => {
  const navigate = useNavigate();
  const { backendUrl } = useShopContext();
  const { role, isTutor, sections } = useMyLibrary();
  const title = 'My Library';

  const aiCourseCta = (course: Course) => {
    const cid = course.id;
    navigate(
      `/robot-teach?courseId=${encodeURIComponent(String(cid))}&title=${encodeURIComponent(
        course.title || 'AI Course'
      )}`
    );
  };

  const openCourse = (course: Course) => {
    navigate(`/progress/${encodeURIComponent(String(course.id))}`);
  };

  return (
    <div
      className="min-h-screen bg-slate-50 dark:bg-darkBg text-[#0d141c] dark:text-darkTextPrimary"
      style={{ fontFamily: 'Manrope, "Noto Sans", sans-serif' }}
    >
      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">{title}</h1>
          <p className="text-sm text-[#49739c] dark:text-darkTextSecondary mt-1">
            {isTutor
              ? 'Everything you created or unlocked lives here.'
              : 'Your purchased and enrolled learning content lives here.'}
          </p>
        </div>

        {role === 'tutor' ? (
          <>
            <SectionShell
              title="Your ClassVault Videos & Notes"
              subtitle="Only your uploaded ClassVault content."
            >
              {sections.createdClassVault.loading && sections.createdClassVault.items.length === 0 ? (
                <p className="text-sm text-[#5e738f] dark:text-darkTextSecondary">Loading…</p>
              ) : sections.createdClassVault.error ? (
                <p className="text-sm text-red-600">{sections.createdClassVault.error}</p>
              ) : sections.createdClassVault.items.length === 0 ? (
                <EmptyState message="You haven’t uploaded any ClassVault videos or notes yet." />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sections.createdClassVault.items.map((item) => (
                    <ClassVaultCard key={String(item.id)} item={item} />
                  ))}
                </div>
              )}
              {sections.createdClassVault.hasMore && (
                <LoadMoreButton
                  onClick={sections.createdClassVault.loadMore}
                  disabled={sections.createdClassVault.loading}
                />
              )}
            </SectionShell>

            <SectionShell
              title="Your Courses"
              subtitle="Courses you created for learners."
            >
              {sections.normalCourses.loading && sections.normalCourses.items.length === 0 ? (
                <p className="text-sm text-[#5e738f] dark:text-darkTextSecondary">Loading…</p>
              ) : sections.normalCourses.error ? (
                <p className="text-sm text-red-600">{sections.normalCourses.error}</p>
              ) : sections.normalCourses.items.length === 0 ? (
                <EmptyState message="You haven’t created any courses yet." />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sections.normalCourses.items.map((course) => (
                    <CourseCard
                      key={String(course.id)}
                      course={course}
                      onOpen={() => openCourse(course)}
                    />
                  ))}
                </div>
              )}
              {sections.normalCourses.hasMore && (
                <LoadMoreButton
                  onClick={sections.normalCourses.loadMore}
                  disabled={sections.normalCourses.loading}
                />
              )}
            </SectionShell>

            <SectionShell
              title="Your AI Courses"
              subtitle="AI courses you personally unlocked."
            >
              {sections.aiCourses.loading && sections.aiCourses.items.length === 0 ? (
                <p className="text-sm text-[#5e738f] dark:text-darkTextSecondary">Loading…</p>
              ) : sections.aiCourses.error ? (
                <p className="text-sm text-red-600">{sections.aiCourses.error}</p>
              ) : sections.aiCourses.items.length === 0 ? (
                <EmptyState message="You haven’t unlocked any AI courses yet." />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sections.aiCourses.items.map((course) => (
                    <CourseCard
                      key={String(course.id)}
                      course={course}
                      onOpen={() => aiCourseCta(course)}
                      label="AI"
                    />
                  ))}
                </div>
              )}
              {sections.aiCourses.hasMore && (
                <LoadMoreButton
                  onClick={sections.aiCourses.loadMore}
                  disabled={sections.aiCourses.loading}
                />
              )}
            </SectionShell>
          </>
        ) : (
          <>
            <SectionShell
              title="Purchased Videos & Notes"
              subtitle="Your ClassVault purchases live here."
            >
              {sections.purchasedClassVault.loading &&
              sections.purchasedClassVault.items.length === 0 ? (
                <p className="text-sm text-[#5e738f] dark:text-darkTextSecondary">Loading…</p>
              ) : sections.purchasedClassVault.error ? (
                <p className="text-sm text-red-600">{sections.purchasedClassVault.error}</p>
              ) : sections.purchasedClassVault.items.length === 0 ? (
                <EmptyState message="You haven’t purchased any videos or notes yet." />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sections.purchasedClassVault.items.map((item) => (
                    <ClassVaultCard key={String(item.id)} item={item} isPurchased />
                  ))}
                </div>
              )}
              {sections.purchasedClassVault.hasMore && (
                <LoadMoreButton
                  onClick={sections.purchasedClassVault.loadMore}
                  disabled={sections.purchasedClassVault.loading}
                />
              )}
            </SectionShell>

            <SectionShell
              title="AI Courses"
              subtitle="AI-powered courses you unlocked."
            >
              {sections.aiCourses.loading && sections.aiCourses.items.length === 0 ? (
                <p className="text-sm text-[#5e738f] dark:text-darkTextSecondary">Loading…</p>
              ) : sections.aiCourses.error ? (
                <p className="text-sm text-red-600">{sections.aiCourses.error}</p>
              ) : sections.aiCourses.items.length === 0 ? (
                <EmptyState message="You haven’t unlocked any AI courses yet." />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sections.aiCourses.items.map((course) => (
                    <CourseCard
                      key={String(course.id)}
                      course={course}
                      onOpen={() => aiCourseCta(course)}
                      label="AI"
                    />
                  ))}
                </div>
              )}
              {sections.aiCourses.hasMore && (
                <LoadMoreButton
                  onClick={sections.aiCourses.loadMore}
                  disabled={sections.aiCourses.loading}
                />
              )}
            </SectionShell>

            <SectionShell
              title="Courses"
              subtitle="Courses you enrolled in or purchased."
            >
              {sections.normalCourses.loading && sections.normalCourses.items.length === 0 ? (
                <p className="text-sm text-[#5e738f] dark:text-darkTextSecondary">Loading…</p>
              ) : sections.normalCourses.error ? (
                <p className="text-sm text-red-600">{sections.normalCourses.error}</p>
              ) : sections.normalCourses.items.length === 0 ? (
                <EmptyState message="You haven’t enrolled in any courses yet." />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sections.normalCourses.items.map((course) => (
                    <CourseCard
                      key={String(course.id)}
                      course={course}
                      onOpen={() => openCourse(course)}
                    />
                  ))}
                </div>
              )}
              {sections.normalCourses.hasMore && (
                <LoadMoreButton
                  onClick={sections.normalCourses.loadMore}
                  disabled={sections.normalCourses.loading}
                />
              )}
            </SectionShell>
          </>
        )}

        {!backendUrl && (
          <p className="text-sm text-[#5e738f] dark:text-darkTextSecondary">
            We couldn’t reach the library service right now.
          </p>
        )}
      </main>
    </div>
  );
};

export default MyCourses;
