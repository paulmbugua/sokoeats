import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useShopContext } from '@mytutorapp/shared/context';
import { useCourses } from '@mytutorapp/shared/hooks/useCourses';
import type { Course, CoursePayload, SyllabusItem } from '@mytutorapp/shared/types';

/* ---------- helpers ---------- */
const levels = ['Beginner', 'Intermediate', 'Advanced', 'All Levels'] as const;
const clampPrice = (n: number) => (Number.isFinite(n) && n >= 0 ? Number(n.toFixed(2)) : 0);
const parseWeeks = (input: string): number => {
  const m = String(input || '').match(/(\d{1,2})/);
  const n = m ? Number(m[1]) : 0;
  return Math.max(1, Math.min(52, Number.isFinite(n) ? n : 1));
};
const normalizeSyllabus = (list: SyllabusItem[] = []): SyllabusItem[] =>
  list
    .filter(
      (w) =>
        w.topic?.trim() ||
        '' ||
        w.assignment?.trim() ||
        '' ||
        w.videoUrl?.trim() ||
        '' ||
        w.notesUrl?.trim() ||
        ''
    )
    .map((w, i) => ({ ...w, week: i + 1 }));

/* ---------- reusable sidebar list ---------- */
function CoursesList({
  courses,
  q,
  setQ,
  selectedId,
  setSelectedId,
  onDelete,
  loading,
  error,
}: {
  courses: Course[];
  q: string;
  setQ: (s: string) => void;
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  onDelete: (id: string) => void;
  loading: boolean;
  error: string | null;
}) {
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return courses;
    return courses.filter((c) => {
      const title = (c.title ?? '').toLowerCase();
      const level = (c.level ?? '').toLowerCase();
      const duration = (c.duration ?? '').toLowerCase();
      return title.includes(qq) || level.includes(qq) || duration.includes(qq);
    });
  }, [q, courses]);

  return (
    <div className="flex flex-col h-full">
      <div className="mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by title, level, duration…"
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        />
      </div>

      {loading && <div className="text-sm text-[#49739c]">Loading your courses…</div>}
      {!loading && error && <div className="text-sm text-red-600 break-words">{error}</div>}

      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="font-medium">No courses yet.</div>
          <div className="text-sm text-[#49739c] mt-1">Create your first course.</div>
          <div className="mt-3">
            <Link
              to="/create-course"
              className="inline-flex h-10 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
            >
              Create Course
            </Link>
          </div>
        </div>
      )}

      <ul className="mt-2 grid gap-2 overflow-y-auto min-h-0">
        {filtered.map((c) => {
          const active = c.id === selectedId;
          return (
            <li
              key={c.id}
              className={`rounded-xl border px-3 py-2 flex items-start gap-3 break-words ${
                active
                  ? 'border-blue-300 bg-[#e7edf4] dark:bg-[#172534]'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0f1821]'
              }`}
            >
              <button
                className="flex-1 text-left"
                onClick={() => setSelectedId(c.id)}
                title="Edit this course"
              >
                <div className="font-semibold line-clamp-2">{c.title || 'Untitled course'}</div>
                <div className="text-xs text-[#49739c] dark:text-darkTextSecondary">
                  {c.level ?? 'All Levels'} • {c.duration || '—'}
                </div>
              </button>

              <div className="flex flex-col gap-1">
                <button
                  onClick={() => setSelectedId(c.id)}
                  className="h-9 px-3 rounded-lg bg-[#e7edf4] dark:bg-[#172534] text-xs font-semibold"
                  title="Edit"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(c.id)}
                  className="h-9 px-3 rounded-lg bg-red-600/90 hover:bg-red-700 text-white text-xs"
                  title="Delete"
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------- page ---------- */
const EditCoursePage: React.FC = () => {
  const { backendUrl, token } = useShopContext();

  const {
    courses,
    selectedCourse,
    fetchMyCourses,
    fetchCourseById,
    editCourse,
    removeCourse,
    loading,
    error,
  } = useCourses({ backendUrl, token });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<CoursePayload>>({
    title: '',
    description: '',
    level: 'Beginner',
    duration: '',
    price: 0,
    prerequisites: '',
    syllabus: [],
  });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [q, setQ] = useState('');
  const [showMobileList, setShowMobileList] = useState(false);

  /* load tutor courses, then select first */
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const list = await fetchMyCourses();
        if (!ignore) setSelectedId((prev) => prev ?? list[0]?.id ?? null);
      } catch {}
    })();
    return () => {
      ignore = true;
    };
  }, [fetchMyCourses]);

  /* when selectedId changes, fetch that course */
  useEffect(() => {
    if (!selectedId) return;
    fetchCourseById(selectedId).catch(() => {});
  }, [selectedId, fetchCourseById]);

  /* seed the editor when selectedCourse arrives */
  useEffect(() => {
    if (!selectedCourse) return;
    const c = selectedCourse as Course;
    setForm({
      title: c.title ?? '',
      description: c.description ?? '',
      level: (levels as unknown as string[]).includes(c.level as string)
        ? (c.level as any)
        : 'Beginner',
      duration: c.duration ?? '',
      price: Number(c.price ?? 0),
      prerequisites: c.prerequisites ?? '',
      syllabus: Array.isArray(c.syllabus) ? c.syllabus : [],
    });
    setDirty(false);
  }, [selectedCourse]);

  const syllabusWeeks = useMemo(() => parseWeeks(String(form.duration || '')), [form.duration]);

  /* keep syllabus array length in sync if duration changes */
  useEffect(() => {
    setForm((prev) => {
      const current = Array.isArray(prev.syllabus) ? prev.syllabus : [];
      const trimmed = current.slice(0, syllabusWeeks).map((w, i) => ({ ...w, week: i + 1 }));
      const next = [...trimmed];
      for (let i = trimmed.length; i < syllabusWeeks; i++) {
        next.push({ week: i + 1, topic: '', assignment: '' });
      }
      return { ...prev, syllabus: next };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syllabusWeeks]);

  const onChange: React.ChangeEventHandler<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  > = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: name === 'price' ? Number(value) : value }));
    setDirty(true);
  };

  const onSyllabusChange = (i: number, field: keyof SyllabusItem, value: string) => {
    setForm((prev) => {
      const base = Array.isArray(prev.syllabus) ? prev.syllabus : [];
      const next = base.map((w, idx) => (idx === i ? { ...w, [field]: value } : w));
      return { ...prev, syllabus: next };
    });
    setDirty(true);
  };

  const canSave =
    !!selectedId &&
    (form.title ?? '').trim().length >= 3 &&
    (form.level ?? '').length > 0 &&
    Number.isFinite(Number(form.price)) &&
    Number(form.price) >= 0;

  const doSave = async () => {
    if (!canSave || !selectedId) return;
    setSaving(true);
    try {
      const patch = {
        title: (form.title ?? '').trim(),
        description: (form.description ?? '').trim(),
        level: form.level,
        duration: (form.duration ?? '').trim(),
        price: clampPrice(Number(form.price ?? 0)),
        prerequisites: (form.prerequisites ?? '').trim(),
        syllabus: normalizeSyllabus(form.syllabus as SyllabusItem[]),
      };
      await editCourse(selectedId, patch);
      setDirty(false);
      alert('✅ Saved');
    } catch {
      alert('Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async (id: string) => {
    const ok = confirm('Delete this course? This action cannot be undone.');
    if (!ok) return;
    try {
      await removeCourse(id);
      alert('🗑️ Course deleted');
      if (id === selectedId) {
        const remaining = courses.filter((c) => c.id !== id);
        setSelectedId(remaining[0]?.id ?? null);
      }
    } catch {
      alert('Failed to delete course.');
    }
  };

  return (
    <div
      className="min-h-[100dvh] bg-slate-50 dark:bg-[#0b121a] text-[#0d141c] dark:text-darkTextPrimary"
      style={{ fontFamily: `Manrope, "Noto Sans", sans-serif` }}
    >
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/60 dark:border-white/10 backdrop-blur bg-white/80 dark:bg-[#0b121a]/80 supports-[padding:max(0px,env(safe-area-inset-top))]:pt-[max(0px,env(safe-area-inset-top))]">
        <div className="max-w-[1200px] mx-auto px-3 sm:px-4 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Link
              to="/profile/me"
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0f1821] h-10 px-3 inline-flex items-center"
            >
              ← Profile
            </Link>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-extrabold">My Courses</h1>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
                Edit details, update syllabus, or delete
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mobile: open courses drawer */}
            <button
              onClick={() => setShowMobileList(true)}
              className="md:hidden inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0f1821] px-3 h-10"
            >
              Courses
            </button>
            <Link
              to="/create-course"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-4 h-10 shadow-sm"
            >
              + New course
            </Link>
            <button
              onClick={doSave}
              disabled={!canSave || loading || saving}
              className={`hidden sm:inline-flex items-center gap-2 rounded-xl px-4 h-10 text-white ${
                canSave && !saving ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-400'
              }`}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </header>

      {/* Layout */}
      <div className="max-w-[1200px] mx-auto px-3 sm:px-4 py-4 sm:py-6 grid grid-cols-1 md:grid-cols-[22rem_1fr] gap-4">
        {/* Sidebar (desktop/tablet) */}
        <aside
          className="hidden md:flex rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] p-4 md:sticky md:top-[88px] lg:top-[96px] self-start"
          style={{ maxHeight: 'calc(100dvh - 120px)' }}
        >
          <CoursesList
            courses={courses}
            q={q}
            setQ={setQ}
            selectedId={selectedId}
            setSelectedId={(id) => {
              setSelectedId(id);
              // ensure editor visible on narrow tablet
              const el = document.getElementById('editor-top');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            onDelete={doDelete}
            loading={loading}
            error={error}
          />
        </aside>

        {/* Editor */}
        <section id="editor-top" className="min-h-[60vh]">
          {!selectedId && (
            <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f1821] p-6">
              <div className="text-base">Select a course to edit.</div>
              <div className="mt-3 md:hidden">
                <button
                  onClick={() => setShowMobileList(true)}
                  className="inline-flex h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700"
                >
                  Open my courses
                </button>
              </div>
            </div>
          )}

          {selectedId && (
            <>
              {/* Basics */}
              <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f1821] p-4 sm:p-5 lg:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4">
                  <h2 className="text-base sm:text-lg font-bold">Basics</h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => doDelete(selectedId)}
                      disabled={loading || saving}
                      className="inline-flex items-center gap-2 rounded-xl bg-red-600/90 hover:bg-red-700 text-white px-3 h-10 text-sm disabled:opacity-60"
                    >
                      Delete
                    </button>
                    <button
                      onClick={doSave}
                      disabled={!canSave || loading || saving}
                      className={`inline-flex items-center gap-2 rounded-xl px-4 h-10 text-white text-sm ${
                        canSave && !saving ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-400'
                      }`}
                    >
                      {saving ? 'Saving…' : 'Save changes'}
                    </button>
                  </div>
                </div>

                <div className="grid gap-4">
                  <label className="grid gap-2">
                    <span className="text-sm font-medium">Title</span>
                    <input
                      name="title"
                      value={form.title ?? ''}
                      onChange={onChange}
                      placeholder="Course title"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-blue-600 break-words"
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-medium">Description</span>
                    <textarea
                      name="description"
                      value={form.description ?? ''}
                      onChange={onChange}
                      rows={5}
                      placeholder="What will learners achieve?"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-blue-600 resize-y break-words"
                    />
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <label className="grid gap-2">
                      <span className="text-sm font-medium">Level</span>
                      <select
                        name="level"
                        value={form.level ?? 'Beginner'}
                        onChange={onChange}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        {levels.map((l) => (
                          <option key={l}>{l}</option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm font-medium">Duration</span>
                      <input
                        name="duration"
                        value={form.duration ?? ''}
                        onChange={onChange}
                        placeholder="e.g., 8 weeks"
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      />
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Weeks auto-size syllabus. Currently: <b>{syllabusWeeks}</b>
                      </span>
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm font-medium">Price (USD)</span>
                      <input
                        name="price"
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.price ?? 0}
                        onChange={onChange}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      />
                    </label>
                  </div>

                  <label className="grid gap-2">
                    <span className="text-sm font-medium">Prerequisites (optional)</span>
                    <textarea
                      name="prerequisites"
                      value={form.prerequisites ?? ''}
                      onChange={onChange}
                      rows={3}
                      placeholder="What should learners know first?"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-blue-600 resize-y break-words"
                    />
                  </label>
                </div>
              </div>

              {/* Syllabus */}
              <div className="mt-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f1821] p-4 sm:p-5 lg:p-6">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-base sm:text-lg font-bold">Syllabus</h2>
                  <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    Showing {syllabusWeeks} week{syllabusWeeks === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="grid gap-3">
                  {(form.syllabus ?? []).map((w, i) => (
                    <details
                      key={i}
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0f1821] [&_summary::-webkit-details-marker]:hidden"
                      open={i < 2}
                    >
                      <summary className="cursor-pointer px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-blue-600/10 text-blue-700 dark:text-blue-300 text-xs font-semibold">
                            {i + 1}
                          </span>
                          <span className="text-sm font-semibold truncate">
                            {w.topic?.trim() || `Week ${i + 1}`}
                          </span>
                        </div>
                        <svg
                          className="h-4 w-4 text-slate-500 transition"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M5.23 7.21a.75.75 0 011.06.02L10 11.106l3.71-3.875a.75.75 0 111.08 1.04l-4.24 4.43a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </summary>
                      <div className="grid gap-3 px-4 pb-4">
                        <input
                          value={w.topic ?? ''}
                          onChange={(e) => onSyllabusChange(i, 'topic', e.target.value)}
                          placeholder="Topic"
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-blue-600 break-words"
                        />
                        <textarea
                          value={w.assignment ?? ''}
                          onChange={(e) => onSyllabusChange(i, 'assignment', e.target.value)}
                          rows={3}
                          placeholder="Notes / Assignment"
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-blue-600 resize-y break-words"
                        />
                        <div className="grid sm:grid-cols-2 gap-2">
                          <input
                            value={w.videoUrl ?? ''}
                            onChange={(e) => onSyllabusChange(i, 'videoUrl', e.target.value)}
                            placeholder="Video URL (optional)"
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-blue-600 break-all"
                          />
                          <input
                            value={w.notesUrl ?? ''}
                            onChange={(e) => onSyllabusChange(i, 'notesUrl', e.target.value)}
                            placeholder="Notes URL (optional)"
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-blue-600 break-all"
                          />
                        </div>
                      </div>
                    </details>
                  ))}
                </div>

                {/* Mobile sticky actions */}
                <div className="mt-4 sm:hidden sticky bottom-2 z-10">
                  <div className="rounded-xl bg-white/90 dark:bg-[#0f1821]/90 backdrop-blur border border-slate-200 dark:border-slate-700 p-2 flex items-center justify-end gap-2">
                    <button
                      onClick={doSave}
                      disabled={!canSave || loading || saving}
                      className={`inline-flex items-center gap-2 rounded-xl px-4 h-10 text-white text-sm ${
                        canSave && !saving ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-400'
                      }`}
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Mobile drawer for courses list */}
      {showMobileList && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="My courses list"
        >
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowMobileList(false)} />
          <div
            className="absolute inset-y-0 left-0 w-[85%] max-w-sm bg-white dark:bg-[#0f1821] shadow-xl border-r border-slate-200 dark:border-slate-700 p-4 flex flex-col"
            style={{
              paddingTop: 'max(1rem, env(safe-area-inset-top))',
              paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold">My Courses</h2>
              <button
                onClick={() => setShowMobileList(false)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 h-9 px-3"
                aria-label="Close"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <CoursesList
                courses={courses}
                q={q}
                setQ={setQ}
                selectedId={selectedId}
                setSelectedId={(id) => {
                  setSelectedId(id);
                  setShowMobileList(false);
                  setTimeout(() => {
                    const el = document.getElementById('editor-top');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 0);
                }}
                onDelete={(id) => {
                  doDelete(id);
                  // keep drawer open if deleting non-selected; otherwise close
                  if (id === selectedId) setShowMobileList(false);
                }}
                loading={loading}
                error={error}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditCoursePage;
