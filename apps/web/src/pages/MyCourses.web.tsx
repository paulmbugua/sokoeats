// apps/web/src/pages/MyCourses.tsx
import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAiCourse, useMyLibrary } from '@mytutorapp/shared/hooks';
import { useClassVault } from '@mytutorapp/shared/hooks';
import { useShopContext } from '@mytutorapp/shared/context';
import { pickImageUriForCourse } from '@mytutorapp/shared/utils/subjectImages';
import type { Course, RecordedVideo, TopCourse } from '@mytutorapp/shared/types';
import CourseHero from '../components/CourseHero';

/* ─────────────────────────────────────────────────────────
 * ✅ ID Normalization (same intent as native)
 * ───────────────────────────────────────────────────────── */
function getVaultId(v: any): number {
  const raw = v?.id ?? v?.class_id ?? v?.video_id ?? v?.recorded_video_id;
  const n = Number(raw);
  return Number.isFinite(n) ? n : -1;
}

function withNormalizedVaultId<T extends any>(v: T): T & { id: number } {
  const id = getVaultId(v);
  return { ...(v as any), id };
}

/* ─────────────────────────────────────────────────────────
 * URL helpers (prevents web trying to load relative asset paths from the SPA domain)
 * ───────────────────────────────────────────────────────── */
function resolveUrl(backendUrl: string, maybeUrl?: string | null) {
  const u = (maybeUrl ?? '').trim();
  if (!u) return '';
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  if (!backendUrl) return u; // fallback
  return `${backendUrl}${u.startsWith('/') ? u : `/${u}`}`;
}

function cacheBustKey(item: any) {
  return String(item?.updated_at || item?.updatedAt || item?.created_at || item?.createdAt || Date.now());
}

function withBust(url: string, bust: string) {
  if (!url) return '';
  return `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(bust)}`;
}

function courseThumb(c: any): string | null {
  return (
    c?.thumbnail_url ||
    c?.thumbnailUrl ||
    c?.thumb_url ||
    c?.thumbUrl ||
    c?.image_url ||
    c?.imageUrl ||
    c?.cover_url ||
    c?.coverUrl ||
    null
  );
}

/* ─────────────────────────────────────────────────────────
 * UI atoms
 * ───────────────────────────────────────────────────────── */
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

const TopCoursesPromoGrid: React.FC<{
  backendUrl?: string;
  authToken?: string;
  onPick: (course: TopCourse) => void;
}> = ({ backendUrl, authToken, onPick }) => {
  const { topCourses, loadTopCourses, hasMoreCourses, coursesCursor, error } = useAiCourse(
    backendUrl || '',
    authToken,
    { defaultQuizType: 'mcq' }
  );

  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoCursor, setPromoCursor] = useState<string | null>(null);
  const [promoHasMore, setPromoHasMore] = useState(false);
  const promoCursorRef = useRef<string | null>(null);

  const canLoadMore = promoHasMore || Boolean(promoCursor);

  useEffect(() => {
    setPromoCursor(coursesCursor ?? null);
    promoCursorRef.current = coursesCursor ?? null;
  }, [coursesCursor]);

  useEffect(() => {
    setPromoHasMore(Boolean(hasMoreCourses));
  }, [hasMoreCourses]);

  useEffect(() => {
    if (!error) return;
    setPromoError(error);
  }, [error]);

  const fetchTopCourses = useCallback(
    async (opts?: { append?: boolean }) => {
      if (!backendUrl || !authToken) return;
      setPromoLoading(true);
      setPromoError(null);
      try {
        await loadTopCourses({
          // ✅ 20 at a time
          limit: 20,
          append: opts?.append,
          cursor: opts?.append ? promoCursorRef.current ?? undefined : undefined,
        });
      } catch (e: any) {
        setPromoError(e?.message || 'Failed to load courses');
      } finally {
        setPromoLoading(false);
      }
    },
    [backendUrl, authToken, loadTopCourses]
  );

  useEffect(() => {
    fetchTopCourses({ append: false });
  }, [fetchTopCourses]);

  if (!topCourses.length && promoLoading) {
    return (
      <p className="text-sm text-[#5e738f] dark:text-darkTextSecondary mt-3">
        Loading top courses…
      </p>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-[#0d141c] dark:text-darkTextPrimary">
          Top AI courses
        </h3>
        <p className="text-xs text-[#49739c] dark:text-darkTextSecondary">
          Try one instantly with AI Tutor Studio
        </p>
      </div>

      {promoError ? (
        <div className="mt-3">
          <p className="text-sm text-red-600">{promoError}</p>
          <button
            type="button"
            onClick={() => fetchTopCourses({ append: false })}
            className="text-sm font-semibold text-blue-600 dark:text-blue-400 mt-2"
          >
            Retry
          </button>
        </div>
      ) : null}

      {/* ✅ 3 columns (prevents stretched cards) */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-3">
        {topCourses.map((course) => {
          const rawImage = courseThumb(course) || pickImageUriForCourse(course as any, backendUrl);
          const image = rawImage; // keep as-is; subjectImages should already be absolute / safe

          return (
            <button
              type="button"
              key={course.id}
              onClick={() => onPick(course)}
              className="text-left rounded-2xl ring-1 ring-[#e4ecf4] dark:ring-darkCard bg-white dark:bg-[#111b25] overflow-hidden hover:shadow-sm transition"
            >
              <div className="h-32 bg-slate-100 dark:bg-white/10">
                <img src={image} alt={course.title} className="h-full w-full object-cover" />
              </div>
              <div className="p-3">
                <p className="text-sm font-semibold line-clamp-2 text-[#0d141c] dark:text-darkTextPrimary">
                  {course.title || 'Untitled course'}
                </p>
                <p className="text-xs text-[#49739c] dark:text-darkTextSecondary mt-1 line-clamp-2">
                  {course.blurb || 'AI course'}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="pt-3">
        <button
          type="button"
          onClick={() => fetchTopCourses({ append: true })}
          disabled={promoLoading || !canLoadMore}
          className="px-4 py-2 text-sm font-semibold rounded-full bg-[#3d99f5] text-white disabled:opacity-60"
        >
          {promoLoading ? 'Loading…' : canLoadMore ? 'Load more' : 'All loaded'}
        </button>
      </div>
    </div>
  );
};


const ClassVaultCard: React.FC<{
  item: RecordedVideo; // expected to be normalized in parent, but also guarded inside
  backendUrl: string;
  isPurchased?: boolean;
  showTutorActions?: boolean;
  editTo?: string;
  onDelete?: () => void;
  deleting?: boolean;
}> = ({ item, backendUrl, isPurchased, showTutorActions, editTo, onDelete, deleting }) => {
  const bust = cacheBustKey(item);
  const idNum = getVaultId(item);
  const idStr = idNum > 0 ? String(idNum) : '';

  const isPdfOnly = Boolean((item as any)?.pdf_url) && !(item as any)?.video_url;

  // ✅ Resolve relative urls to backend + add cache-bust
  const pdf = withBust(resolveUrl(backendUrl, (item as any)?.pdf_url || ''), bust);
  const video = withBust(
    resolveUrl(backendUrl, (item as any)?.preview_url || (item as any)?.video_url || ''),
    bust
  );
  const poster = withBust(resolveUrl(backendUrl, (item as any)?.thumbnail_url || ''), bust);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [pdfBlocked, setPdfBlocked] = useState(false);

  // Best-effort autoplay (browsers may still block)
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!video) return;
    const t = window.setTimeout(() => {
      el.play().catch(() => {});
    }, 50);
    return () => window.clearTimeout(t);
  }, [video]);

  const to = idNum > 0 ? `/class-vault/${encodeURIComponent(String(idNum))}` : '#';

  return (
    <div className="relative">
      <Link
        to={to}
        onClick={(e) => {
          if (idNum <= 0) {
            e.preventDefault();
            alert('Invalid item id. Please refresh the page.');
          }
        }}
        className="block rounded-xl ring-1 ring-[#e4ecf4] dark:ring-darkCard bg-white dark:bg-[#111b25] overflow-hidden hover:shadow-sm transition"
      >
        {/* Preview area */}
        <div className="relative aspect-video bg-[#0b1220] overflow-hidden">
          {/* PDF-only: try iframe preview */}
          {isPdfOnly && pdf && !pdfBlocked ? (
            <iframe
              title="Notes preview"
              src={`${pdf}#page=1&view=FitH`}
              className="absolute inset-0 w-full h-full"
              onError={() => setPdfBlocked(true)}
            />
          ) : null}

          {/* Thumbnail fallback */}
          {poster && (!isPdfOnly || pdfBlocked) ? (
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${poster})` }}
            />
          ) : null}

          {/* Video preview */}
          {!isPdfOnly && video ? (
            <video
              key={video}
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              src={video}
              poster={poster || undefined}
              muted
              playsInline
              loop
              autoPlay
              preload="metadata"
            />
          ) : null}

          {/* Label chip */}
          <div className="absolute bottom-2 left-2 text-[11px] px-2 py-0.5 rounded-full bg-black/60 text-white">
            {isPdfOnly ? 'Notes' : 'Preview'}
          </div>

          {/* PDF fallback if iframe blocked */}
          {isPdfOnly && pdfBlocked ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-white p-3 text-center">
              <p className="text-xs font-semibold">Notes preview unavailable</p>
              <p className="text-[11px] opacity-80 mt-1">Tap to open and view the PDF.</p>
            </div>
          ) : null}
        </div>

        <div className="p-3">
          <p className="text-sm font-semibold line-clamp-2 text-[#0d141c] dark:text-darkTextPrimary">
            {(item as any)?.title || 'Untitled'}
          </p>
          <p className="text-xs text-[#49739c] dark:text-darkTextSecondary mt-1">
            {(item as any)?.subject || (item as any)?.grade_level || 'ClassVault'}
          </p>

          {isPurchased && (
            <span className="inline-flex mt-2 text-[11px] px-2 py-0.5 rounded-full bg-[#eaf2ff] text-[#2a6fd6]">
              Purchased
            </span>
          )}
        </div>
      </Link>

      {/* Tutor actions */}
      {showTutorActions && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
          <Link
          to={editTo || `/class-vault/upload?edit=${encodeURIComponent(idStr)}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center justify-center rounded-lg h-9 px-3 text-xs font-semibold
                    bg-[#e7edf4] dark:bg-[#172534] hover:brightness-105"
          title="Edit"
        >
          Edit
        </Link>


          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (idNum <= 0) {
                alert('Invalid item id. Please refresh.');
                return;
              }
              onDelete?.();
            }}
            disabled={deleting}
            className="inline-flex items-center justify-center rounded-lg h-9 px-3 text-xs font-semibold
                       bg-red-50 dark:bg-[#2a0d11] text-red-600 dark:text-red-400 hover:brightness-105 disabled:opacity-60"
            title="Delete"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  );
};

const CourseCard: React.FC<{
  course: Course;
  onOpen: () => void;
  label?: string;

  showTutorActions?: boolean;
  onDelete?: () => void;
  deleting?: boolean;
}> = ({ course, onOpen, label, showTutorActions, onDelete, deleting }) => (
  <div className="relative">
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-xl ring-1 ring-[#e4ecf4] dark:ring-darkCard bg-white dark:bg-[#111b25] overflow-hidden hover:shadow-sm transition"
    >
      <div className="h-28">
        <CourseHero course={course} className="h-full" />
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold line-clamp-2 text-[#0d141c] dark:text-darkTextPrimary">
          {course.title}
        </p>
        <p className="text-xs text-[#49739c] dark:text-darkTextSecondary mt-1">
          {(course as any).subject || 'Course'}
        </p>
        {label && (
          <span className="inline-flex mt-2 text-[11px] px-2 py-0.5 rounded-full bg-[#f0f7ff] text-[#2a6fd6]">
            {label}
          </span>
        )}
      </div>
    </button>

    {/* Tutor actions (top-right) */}
    {showTutorActions && (
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        <Link
          to={`/courses/${course.id}/edit`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center justify-center rounded-lg h-9 px-3 text-xs font-semibold
                     bg-[#e7edf4] dark:bg-[#172534] hover:brightness-105"
          title="Edit course"
        >
          Edit
        </Link>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.();
          }}
          disabled={deleting}
          className="inline-flex items-center justify-center rounded-lg h-9 px-3 text-xs font-semibold
                     bg-red-50 dark:bg-[#2a0d11] text-red-600 dark:text-red-400 hover:brightness-105 disabled:opacity-60"
          title="Delete course"
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    )}
  </div>
);

const MyCourses: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { backendUrl, token, orgToken, profile, role: ctxRole } = useShopContext();
  const { role, isTutor, sections } = useMyLibrary();
  const { remove: removeVault } = useClassVault();
  const authToken = token || orgToken;

  const title = 'My Library';

  // ---------- ownership helpers ----------
  const userId = useMemo(() => {
    const p: any = profile || {};
    return p?.user_id ?? p?.id ?? null;
  }, [profile]);

  const roleStr = useMemo(() => {
    const p: any = profile || {};
    return String(p?.role ?? ctxRole ?? role ?? '').toLowerCase();
  }, [profile, ctxRole, role]);

  const isOwnerCourse = useCallback(
    (c: any) => {
      if (!userId) return false;
      const owner = c?.tutorId ?? c?.tutor_id ?? c?.created_by_user_id ?? c?.createdByUserId;
      return owner != null && String(owner) === String(userId);
    },
    [userId]
  );

  const isOwnerClassVault = useCallback(
    (v: any) => {
      if (!userId) return false;
      const owner = v?.tutorId ?? v?.tutor_id ?? v?.created_by_user_id ?? v?.createdByUserId;
      return owner != null && String(owner) === String(userId);
    },
    [userId]
  );

  // ---------- local optimistic removal ----------
  const [deletedCourseIds, setDeletedCourseIds] = useState<Set<string>>(new Set());
  const [deletedVaultIds, setDeletedVaultIds] = useState<Set<string>>(new Set());

  const [deletingCourseId, setDeletingCourseId] = useState<string | null>(null);
  const [deletingVaultId, setDeletingVaultId] = useState<string | null>(null);

  const tryRefreshSection = useCallback(async (sec: any) => {
    try {
      if (typeof sec?.refresh === 'function') return await sec.refresh();
      if (typeof sec?.refetch === 'function') return await sec.refetch();
      if (typeof sec?.reload === 'function') return await sec.reload();
      if (typeof sec?.fetch === 'function') return await sec.fetch();
    } catch {}
  }, []);

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

  useEffect(() => {
    if (authToken) return;
    navigate('/login', {
      state: {
        reason: 'auth',
        message: 'Please sign in to view your library',
        returnTo: location.pathname,
      },
    });
  }, [authToken, navigate, location.pathname]);

  // ---------- delete handlers ----------
  const onDeleteCourse = useCallback(
    async (course: Course) => {
      if (!backendUrl || !token) {
        alert('Missing backend connection or session token.');
        return;
      }
      const id = String(course.id);
      const ok = window.confirm(`Delete "${course.title || 'this course'}"? This cannot be undone.`);
      if (!ok) return;

      setDeletingCourseId(id);
      setDeletedCourseIds((prev) => new Set(prev).add(id)); // optimistic hide

      try {
        const res = await fetch(`${backendUrl}/api/courses/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          let msg = 'Failed to delete course.';
          try {
            const j = await res.json();
            msg = j?.message || msg;
          } catch {}
          throw new Error(msg);
        }

        await tryRefreshSection(sections?.normalCourses);
      } catch (e: any) {
        setDeletedCourseIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        alert(e?.message || 'Failed to delete course.');
      } finally {
        setDeletingCourseId(null);
      }
    },
    [backendUrl, token, sections, tryRefreshSection]
  );

  const onDeleteClassVault = useCallback(
    async (item: RecordedVideo) => {
      if (!token) {
        alert('You must be logged in.');
        return;
      }

      const idNum = getVaultId(item);
      if (idNum <= 0) {
        alert('Invalid item id. Please refresh.');
        return;
      }

      const ok = window.confirm(`Delete "${(item as any).title || 'this item'}"? This cannot be undone.`);
      if (!ok) return;

      const id = String(idNum);
      setDeletingVaultId(id);
      setDeletedVaultIds((prev) => new Set(prev).add(id)); // optimistic hide

      try {
        // shared hook/api: DELETE /api/classvault/:id
        await removeVault(idNum);
        await tryRefreshSection(sections?.createdClassVault);
      } catch (e: any) {
        setDeletedVaultIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        alert(e?.message || 'Failed to delete ClassVault item.');
      } finally {
        setDeletingVaultId(null);
      }
    },
    [token, removeVault, sections, tryRefreshSection]
  );

  // ---------- filtered lists after optimistic deletes ----------
  const createdVaultItems = useMemo(() => {
    const raw = sections.createdClassVault.items || [];
    return raw
      .map(withNormalizedVaultId)
      .filter((x: any) => x.id > 0 && !deletedVaultIds.has(String(x.id)));
  }, [sections.createdClassVault.items, deletedVaultIds]);

  const purchasedVaultItems = useMemo(() => {
    const raw = sections.purchasedClassVault.items || [];
    return raw
      .map(withNormalizedVaultId)
      .filter((x: any) => x.id > 0 && !deletedVaultIds.has(String(x.id)));
  }, [sections.purchasedClassVault.items, deletedVaultIds]);

  const normalCourseItems = useMemo(() => {
    const raw = sections.normalCourses.items || [];
    return raw.filter((c: any) => !deletedCourseIds.has(String(c?.id)));
  }, [sections.normalCourses.items, deletedCourseIds]);

  const aiCourseItems = useMemo(() => {
    const raw = sections.aiCourses.items || [];
    return raw.filter((c: any) => !deletedCourseIds.has(String(c?.id)));
  }, [sections.aiCourses.items, deletedCourseIds]);

  const showTutorActionsForCourse = useCallback(
    (c: any) => roleStr === 'tutor' && (isOwnerCourse(c) || isTutor),
    [roleStr, isOwnerCourse, isTutor]
  );

  const showTutorActionsForVault = useCallback(
    (v: any) => roleStr === 'tutor' && (isOwnerClassVault(v) || isTutor),
    [roleStr, isOwnerClassVault, isTutor]
  );

  if (!authToken) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-darkBg text-[#0d141c] dark:text-darkTextPrimary">
        <main className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-sm text-[#49739c] dark:text-darkTextSecondary">
            Please sign in to view your library
          </p>
        </main>
      </div>
    );
  }

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
            <SectionShell title="Your ClassVault Videos & Notes" subtitle="Only your uploaded ClassVault content.">
              {sections.createdClassVault.loading && createdVaultItems.length === 0 ? (
                <p className="text-sm text-[#5e738f] dark:text-darkTextSecondary">Loading…</p>
              ) : sections.createdClassVault.error ? (
                <p className="text-sm text-red-600">{sections.createdClassVault.error}</p>
              ) : createdVaultItems.length === 0 ? (
                <EmptyState message="You haven’t uploaded any ClassVault videos or notes yet." />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {createdVaultItems.map((item: any) => {
                    const id = String(item.id); // ✅ normalized
                    return (
                      <ClassVaultCard
                        key={id}
                        item={item}
                        backendUrl={backendUrl}
                        showTutorActions={showTutorActionsForVault(item)}
                        editTo={`/class-vault/upload?edit=${encodeURIComponent(id)}&kind=${
                          (item as any)?.pdf_url && !(item as any)?.video_url ? 'pdf' : 'video'
                        }&returnTo=${encodeURIComponent('/courses')}`}
                        deleting={deletingVaultId === id}
                        onDelete={() => onDeleteClassVault(item)}
                      />
                    );
                  })}
                </div>
              )}
              {sections.createdClassVault.hasMore && (
                <LoadMoreButton
                  onClick={sections.createdClassVault.loadMore}
                  disabled={sections.createdClassVault.loading}
                />
              )}
            </SectionShell>

            <SectionShell title="Your Courses" subtitle="Courses you created for learners.">
              {sections.normalCourses.loading && normalCourseItems.length === 0 ? (
                <p className="text-sm text-[#5e738f] dark:text-darkTextSecondary">Loading…</p>
              ) : sections.normalCourses.error ? (
                <p className="text-sm text-red-600">{sections.normalCourses.error}</p>
              ) : normalCourseItems.length === 0 ? (
                <>
                  <EmptyState message="You haven’t created any courses yet." />
                  <TopCoursesPromoGrid
                    backendUrl={backendUrl}
                    authToken={authToken}
                    onPick={(course) =>
                      navigate(
                        `/robot-teach?courseId=${encodeURIComponent(String(course.id))}&courseTitle=${encodeURIComponent(
                          course.title || 'AI Course'
                        )}&source=top-courses`
                      )
                    }
                  />
                </>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {normalCourseItems.map((course: any) => {
                    const id = String(course.id);
                    return (
                      <CourseCard
                        key={id}
                        course={course}
                        onOpen={() => openCourse(course)}
                        showTutorActions={showTutorActionsForCourse(course)}
                        deleting={deletingCourseId === id}
                        onDelete={() => onDeleteCourse(course)}
                      />
                    );
                  })}
                </div>
              )}
              {sections.normalCourses.hasMore && (
                <LoadMoreButton
                  onClick={sections.normalCourses.loadMore}
                  disabled={sections.normalCourses.loading}
                />
              )}
            </SectionShell>

            <SectionShell title="Your AI Courses" subtitle="AI courses you personally unlocked.">
              {sections.aiCourses.loading && aiCourseItems.length === 0 ? (
                <p className="text-sm text-[#5e738f] dark:text-darkTextSecondary">Loading…</p>
              ) : sections.aiCourses.error ? (
                <p className="text-sm text-red-600">{sections.aiCourses.error}</p>
              ) : aiCourseItems.length === 0 ? (
                <EmptyState message="You haven’t unlocked any AI courses yet." />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {aiCourseItems.map((course: any) => (
                    <CourseCard
                      key={String(course.id)}
                      course={course}
                      onOpen={() => aiCourseCta(course)}
                      label="AI"
                      showTutorActions={false}
                    />
                  ))}
                </div>
              )}
              {sections.aiCourses.hasMore && (
                <LoadMoreButton onClick={sections.aiCourses.loadMore} disabled={sections.aiCourses.loading} />
              )}
            </SectionShell>
          </>
        ) : (
          <>
            <SectionShell title="Purchased Videos & Notes" subtitle="Your ClassVault purchases live here.">
              {sections.purchasedClassVault.loading && purchasedVaultItems.length === 0 ? (
                <p className="text-sm text-[#5e738f] dark:text-darkTextSecondary">Loading…</p>
              ) : sections.purchasedClassVault.error ? (
                <p className="text-sm text-red-600">{sections.purchasedClassVault.error}</p>
              ) : purchasedVaultItems.length === 0 ? (
                <EmptyState message="You haven’t purchased any videos or notes yet." />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {purchasedVaultItems.map((item: any) => (
                    <ClassVaultCard
                      key={String(item.id)} // ✅ normalized
                      item={item}
                      backendUrl={backendUrl}
                      isPurchased
                    />
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

            <SectionShell title="AI Courses" subtitle="AI-powered courses you unlocked.">
              {sections.aiCourses.loading && aiCourseItems.length === 0 ? (
                <p className="text-sm text-[#5e738f] dark:text-darkTextSecondary">Loading…</p>
              ) : sections.aiCourses.error ? (
                <p className="text-sm text-red-600">{sections.aiCourses.error}</p>
              ) : aiCourseItems.length === 0 ? (
                <EmptyState message="You haven’t unlocked any AI courses yet." />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {aiCourseItems.map((course: any) => (
                    <CourseCard key={String(course.id)} course={course} onOpen={() => aiCourseCta(course)} label="AI" />
                  ))}
                </div>
              )}
              {sections.aiCourses.hasMore && (
                <LoadMoreButton onClick={sections.aiCourses.loadMore} disabled={sections.aiCourses.loading} />
              )}
            </SectionShell>

            <SectionShell title="Courses" subtitle="Courses you enrolled in or purchased.">
              {sections.normalCourses.loading && normalCourseItems.length === 0 ? (
                <p className="text-sm text-[#5e738f] dark:text-darkTextSecondary">Loading…</p>
              ) : sections.normalCourses.error ? (
                <p className="text-sm text-red-600">{sections.normalCourses.error}</p>
              ) : normalCourseItems.length === 0 ? (
                <>
                  <EmptyState message="You haven’t enrolled in any courses yet." />
                  <TopCoursesPromoGrid
                    backendUrl={backendUrl}
                    authToken={authToken}
                    onPick={(course) =>
                      navigate(
                        `/robot-teach?courseId=${encodeURIComponent(String(course.id))}&courseTitle=${encodeURIComponent(
                          course.title || 'AI Course'
                        )}&source=top-courses`
                      )
                    }
                  />
                </>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {normalCourseItems.map((course: any) => (
                    <CourseCard key={String(course.id)} course={course} onOpen={() => openCourse(course)} />
                  ))}
                </div>
              )}
              {sections.normalCourses.hasMore && (
                <LoadMoreButton onClick={sections.normalCourses.loadMore} disabled={sections.normalCourses.loading} />
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
