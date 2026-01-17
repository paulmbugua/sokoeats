// apps/web/src/components/RobotTeacherControls.tsx
import React, { useState } from 'react';
import type { ProgramTrack } from '@mytutorapp/shared/types';

// ─────────────────────────────────────────────────────────────
// Program Track UI (web parity with native cards + info modal)
// ─────────────────────────────────────────────────────────────
type MIName =
  | 'view-module'
  | 'verified'
  | 'school'
  | 'account-balance'
  | 'info-outline'
  | 'close';

function MIIcon({ name, className }: { name: MIName; className?: string }) {
  // Simple inline SVGs (no deps). Styled via "currentColor".
  switch (name) {
    case 'view-module':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="4" y="4" width="7" height="7" rx="1.5" fill="currentColor" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" fill="currentColor" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" fill="currentColor" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" fill="currentColor" />
        </svg>
      );

    case 'verified':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19Zm-1.1 12.6-2.5-2.5a1 1 0 1 1 1.4-1.4l1.8 1.8 4.6-4.6a1 1 0 1 1 1.4 1.4l-5.3 5.3a1 1 0 0 1-1.4 0Z"
          />
        </svg>
      );

    case 'school':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 3 1 9l11 6 9-4.9V17h2V9L12 3Zm0 13L4.5 11.9V15c0 2.2 3.1 4 7.5 4s7.5-1.8 7.5-4v-3.1L12 16Z"
          />
        </svg>
      );

    case 'account-balance':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path
            fill="currentColor"
            d="M4 10v8H2v2h20v-2h-2v-8H4Zm3 8H6v-6h1v6Zm4 0h-1v-6h1v6Zm4 0h-1v-6h1v6Zm4 0h-1v-6h1v6ZM12 2 2 7v2h20V7L12 2Z"
          />
        </svg>
      );

    case 'info-outline':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19Zm0 4.3a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Zm1.4 12h-2.8v-1.8h1V12h-1v-1.8h2.8v6.8Z"
          />
        </svg>
      );

    case 'close':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path
            fill="currentColor"
            d="M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7A1 1 0 0 0 5.7 7.1l4.9 4.9-4.9 4.9a1 1 0 1 0 1.4 1.4l4.9-4.9 4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4Z"
          />
        </svg>
      );

    default:
      return null;
  }
}

export type SizePresetKey = 'quick' | 'standard' | 'extended' | 'intensive' | 'marathon';
export type TrackKey = ProgramTrack;

const TRACK_UI: Partial<
  Record<
    TrackKey,
    {
      icon: MIName;
      blurb: string;
      outcome: string;
    }
  >
> = {
  module: {
    icon: 'view-module',
    blurb: 'Focused unit. Great for quick revision or one topic.',
    outcome: 'Best for: targeted learning & practice.',
  },
  certificate: {
    icon: 'verified',
    blurb: 'Structured short program with clear outcomes.',
    outcome: 'Best for: finishing a skill and getting certified.',
  },
  diploma: {
    icon: 'school',
    blurb: 'Career-oriented pathway covering multiple modules.',
    outcome: 'Best for: depth + real-world readiness.',
  },
  degree: {
    icon: 'account-balance',
    blurb: 'Full curriculum-style path with broad coverage.',
    outcome: 'Best for: comprehensive mastery over time.',
  },
};

type CourseOption = { id: string; title: string };

/* Minimal dropdown (unchanged styling) */
const CourseSelect: React.FC<{
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;

  // ✅ show custom/synthetic label even if not in options
  fallbackLabel?: string;
}> = React.memo(({ options, value, onChange, placeholder = 'Select a course…', fallbackLabel }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const selected = React.useMemo(() => options.find((o) => o.value === value), [options, value]);

  const displayLabel =
    selected?.label ||
    (fallbackLabel && String(fallbackLabel).trim() ? String(fallbackLabel).trim() : '');

  return (
    <div ref={ref} className="relative z-[30]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="
          block w-full rounded-xl px-3 pr-9 py-2 text-sm text-left
          border border-gray-300 bg-white text-darkText
          focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500
          dark:border-darkCard dark:bg-[#172534] dark:text-white
        "
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {displayLabel ? (
          displayLabel
        ) : (
          <span className="text-gray-500 dark:text-white/60">{placeholder}</span>
        )}
      </button>

      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/60">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </span>

      <div
        className={`${
          open ? 'block' : 'hidden'
        } absolute left-0 right-0 top-[calc(100%+6px)] max-h-64 overflow-auto rounded-xl ring-1 ring-gray-200 bg-white shadow-lg dark:ring-white/10 dark:bg-[#0f1821]`}
        role="listbox"
      >
        {options.length === 0 ? (
          <div className="px-3 py-2 text-sm text-gray-500 dark:text-white/60">
            No courses available
          </div>
        ) : (
          options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                role="option"
                aria-selected={active}
                className={`w-full text-left px-3 py-2 text-sm ${
                  active
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-600/30 dark:text-white'
                    : 'text-darkText hover:bg-gray-50 dark:text-white dark:hover:bg-white/10'
                }`}
              >
                {opt.label}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
});
CourseSelect.displayName = 'CourseSelect';

// Props for ControlsPanel
interface ControlsPanelProps {
  // modes
  showMinimalControls: boolean;
  isLockedLearner: boolean;
  programTrackLocked: boolean;
  canShareUi: boolean;
  restrictStarter: boolean;
  knobsDisabled: boolean;
  displayCourseTitle?: string;

  // data
  topCourses: CourseOption[];
  selectedCourse: CourseOption | null;
  onSelectCourse: (id: string) => void;

  // track + size + level
  PRESETS: ReadonlyArray<{ key: SizePresetKey; label: string; min: number }>;
  TRACKS: ReadonlyArray<{ key: TrackKey; label: string; lessons: number }>;
  trackLessons: number;
  sizePreset: SizePresetKey;
  setSizePreset: (k: SizePresetKey) => void;
  minutes: number;
  setMinutes: (n: number) => void;
  classLevel: 'beginner' | 'intermediate' | 'advanced';
  setClassLevel: (lv: 'beginner' | 'intermediate' | 'advanced') => void;
  programTrack: TrackKey;
  setProgramTrack: (k: TrackKey) => void;
  capMinutes: (m?: number) => number;

  // custom topic
  customTitle: string;
  setCustomTitle: (s: string) => void;
  overrideLessons: boolean;
  setOverrideLessons: (b: boolean) => void;
  overrideQuiz: boolean;
  setOverrideQuiz: (b: boolean) => void;

  // actions
  busy: boolean;
  hasAIContent: boolean;
  onStart: () => Promise<void> | void;
  onRefreshSelectedAI: () => Promise<void> | void;
  onOpenShare: () => void;

  // extras row
  totalLessons: number;
  setTotalLessons: (n: number) => void;
  quizCount: number;
  setQuizCount: (n: number) => void;
  canStartNow: boolean;
}

const ControlsPanel: React.FC<ControlsPanelProps> = React.memo((props) => {
  const {
    showMinimalControls,
    isLockedLearner,
    programTrackLocked,
    canShareUi,
    restrictStarter,
    knobsDisabled,
    topCourses,
    selectedCourse,
    displayCourseTitle,
    onSelectCourse,
    PRESETS,
    TRACKS,
    trackLessons,
    sizePreset,
    setSizePreset,
    minutes,
    setMinutes,
    classLevel,
    setClassLevel,
    programTrack,
    setProgramTrack,
    capMinutes,
    customTitle,
    setCustomTitle,
    busy,
    hasAIContent,
    onStart,
    onRefreshSelectedAI,
    onOpenShare,
    totalLessons,
    setTotalLessons,
    quizCount,
    setQuizCount,
    canStartNow,
    overrideLessons,
    overrideQuiz,
  } = props;

  const [trackInfoOpen, setTrackInfoOpen] = useState(false);
    const startBtnLabel = busy ? 'Preparing…' : hasAIContent ? 'Continue lesson' : 'Start with A.I';
  const teachBtnLabel = busy ? 'Preparing…' : 'Teach me';


  return (
    <section className="panel p-3 sm:p-4 relative z-10 overflow-visible">
      {showMinimalControls ? (
        /* ───────────── Minimal controls for invited learners ───────────── */
        <div className="flex flex-col gap-3">
          <div className="text-sm text-gray-600 dark:text-white/70">
            This lesson was assigned by your organization. Settings are fixed.
          </div>

          {/* Assigned course is read-only */}
          <div>
            <label className="text-xs text-gray-600 dark:text-white/70">Course</label>
            <div className="mt-1 input bg-gray-100 dark:bg-white/10 cursor-not-allowed">
              {selectedCourse?.title || displayCourseTitle || 'Assigned course'}
            </div>
          </div>

          {/* Primary CTA only */}
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => onStart?.()}
              disabled={busy || !canStartNow}
              className={`w-full sm:w-auto px-4 py-2 rounded-xl text-sm font-semibold transition ring-1 ${
                busy
                  ? 'opacity-60 cursor-not-allowed bg-indigo-50 text-indigo-700 ring-indigo-300 dark:bg-indigo-600/30 dark:text-white dark:ring-indigo-500'
                  : 'bg-indigo-50 text-indigo-700 ring-indigo-300 hover:bg-indigo-100 dark:bg-indigo-600/40 dark:text-white dark:ring-indigo-500 dark:hover:bg-indigo-600/50'
              }`}
              title="AI will generate outline + narration"
            >
             <span className="inline-flex items-center justify-center gap-2">
            {busy ? (
              <span className="h-4 w-4 rounded-full border-2 border-indigo-400/30 border-t-indigo-600 animate-spin dark:border-white/30 dark:border-t-white" />
            ) : null}
            {startBtnLabel}
          </span>


            </button>
          </div>
        </div>
      ) : (
        /* ───────────── Full controls (self-serve) ───────────── */
        <>
          {/* ✅ Desktop fix:
              - Remove the "tall row" that made Course look like it had empty space.
              - Put Course + Lesson Size in row 1, Level + CTA in row 2.
              - Put Program Track in its own row (full width) and render as a compact 2×2 grid on desktop. */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
            {/* Course (row 1 left) */}
            <div className="lg:col-span-2 lg:row-start-1 lg:col-start-1">
              <label className="text-xs text-gray-600 dark:text-white/70">Course</label>
              <div className="mt-1 relative z-[20]">
                {isLockedLearner ? (
                  <div className="input bg-gray-100 dark:bg-white/10 cursor-not-allowed">
                    {selectedCourse?.title || displayCourseTitle || 'Assigned course'}
                  </div>
                ) : (
                  (() => {
                    const custom = customTitle.trim();
                    const courseSelectValue = selectedCourse?.id || (custom ? '__custom__' : '');

                    return (
                      <CourseSelect
                        value={courseSelectValue}
                        onChange={(id) => onSelectCourse(id)}
                        options={(topCourses || []).map((c) => ({ value: c.id, label: c.title }))}
                        placeholder={(topCourses || []).length ? 'Select a course…' : 'Loading…'}
                        fallbackLabel={selectedCourse?.title || custom || displayCourseTitle || ''}
                      />
                    );
                  })()
                )}
              </div>

              {restrictStarter ? (
                <div className="mt-2 text-[11px] text-gray-600 dark:text-white/60">
                  Some options may be limited on Starter.
                </div>
              ) : null}
            </div>

            {/* Program track (mobile: right after Course; desktop: full-width row 3) */}
            <div className="lg:col-span-5 lg:row-start-3 lg:col-start-1">
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-gray-600 dark:text-white/70">Program track</div>

                <button
                  type="button"
                  onClick={() => setTrackInfoOpen(true)}
                  aria-label="What are program tracks?"
                  className="h-7 w-7 rounded-lg flex items-center justify-center
                             bg-gray-100 dark:bg-white/5 ring-1 ring-gray-200 dark:ring-white/10"
                >
                  <MIIcon name="info-outline" className="h-4 w-4 text-slate-400" />
                </button>
              </div>

              {/* ✅ Compact, premium cards: 1 col on mobile, 2 cols from sm+ (2×2 on desktop) */}
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {TRACKS.map((t) => {
                  const active = programTrack === t.key;
                  const disabled = isLockedLearner || programTrackLocked;

                  const meta =
                    TRACK_UI[t.key] ??
                    ({
                      icon: 'school',
                      blurb: 'Structured learning track.',
                      outcome: 'Choose what fits your goal.',
                    } as const);

                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => {
                        if (!disabled) setProgramTrack(t.key);
                      }}
                      disabled={disabled}
                      aria-pressed={active}
                      aria-label={`${t.label}. Approximately ${t.lessons} lessons.`}
                      className={[
                        'w-full text-left rounded-2xl border p-3 transition',
                        'backdrop-blur-sm ring-1 ring-transparent',
                        active
                          ? 'bg-gradient-to-br from-indigo-50 to-white border-indigo-200 ring-indigo-300/40 shadow-sm dark:from-indigo-500/10 dark:to-white/5 dark:border-indigo-500/40 dark:ring-indigo-500/20'
                          : 'bg-white/80 border-gray-200 hover:bg-white dark:bg-white/5 dark:border-white/10 dark:hover:bg-white/10',
                        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:-translate-y-[1px]',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className={[
                              'h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ring-1',
                              active
                                ? 'bg-indigo-600 text-white ring-indigo-500/40'
                                : 'bg-gray-100 text-slate-700 ring-gray-200 dark:bg-white/5 dark:text-white/70 dark:ring-white/10',
                            ].join(' ')}
                          >
                            <MIIcon name={meta.icon} className="h-[18px] w-[18px]" />
                          </div>

                          <div className="min-w-0">
                            <div
                              className={[
                                'text-sm font-semibold leading-tight',
                                active ? 'text-indigo-700 dark:text-white' : 'text-gray-900 dark:text-white',
                              ].join(' ')}
                            >
                              {t.label}
                            </div>

                            {/* ✅ no truncation — keep info visible */}
                            <div className="mt-0.5 text-[11px] leading-snug text-gray-700 dark:text-white/70">
                              {meta.outcome}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0">
                          <div className="px-2 py-1 rounded-full bg-gray-100/80 dark:bg-white/5 ring-1 ring-gray-200 dark:ring-white/10">
                            <div className="text-[11px] text-gray-900 dark:text-white">
                              {t.lessons} lessons
                            </div>
                          </div>
                          {active ? (
                            <div className="mt-1 text-[10px] text-indigo-700 dark:text-indigo-200 text-right">
                              Selected
                            </div>
                          ) : (
                            <div className="mt-1 text-[10px] text-transparent select-none text-right">.</div>
                          )}
                        </div>
                      </div>

                      <div className="mt-2 text-[11px] leading-snug text-gray-600 dark:text-white/60">
                        {meta.blurb}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* ✅ Compact helper line(s) */}
              <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                <div className="text-[11px] text-gray-600 dark:text-white/60">
                  Track controls lesson count. We generate ~{trackLessons} lessons for this course.
                </div>

                {overrideLessons || overrideQuiz ? (
                  <div className="text-[11px] text-amber-700 dark:text-amber-200">
                    Custom lessons/quiz active — tap “Use track defaults” below to resync.
                  </div>
                ) : null}
              </div>

              {/* Info modal */}
              {trackInfoOpen ? (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                  <button
                    type="button"
                    className="absolute inset-0 bg-black/40"
                    aria-label="Close"
                    onClick={() => setTrackInfoOpen(false)}
                  />

                  <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white dark:bg-[#0f1821] ring-1 ring-gray-200 dark:ring-white/10">
                    <div className="px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-white/10">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">
                        What are program tracks?
                      </div>
                      <button
                        type="button"
                        onClick={() => setTrackInfoOpen(false)}
                        aria-label="Close"
                        className="h-8 w-8 rounded-lg flex items-center justify-center
                                   bg-gray-100 dark:bg-white/5 ring-1 ring-gray-200 dark:ring-white/10"
                      >
                        <MIIcon name="close" className="h-4 w-4 text-slate-400" />
                      </button>
                    </div>

                    <div className="max-h-[70vh] overflow-auto p-4 space-y-3">
                      {TRACKS.map((t) => {
                        const meta =
                          TRACK_UI[t.key] ??
                          ({
                            icon: 'school',
                            blurb: 'Structured learning track.',
                            outcome: 'Choose what fits your goal.',
                          } as const);

                        return (
                          <div
                            key={t.key}
                            className="rounded-2xl p-3 bg-gray-50 dark:bg-white/5 ring-1 ring-gray-200 dark:ring-white/10"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <MIIcon
                                  name={meta.icon}
                                  className="h-[18px] w-[18px] text-slate-500 dark:text-white/70"
                                />
                                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                                  {t.label}
                                </div>
                              </div>
                              <div className="text-[11px] text-gray-600 dark:text-white/60">
                                ~{t.lessons} lessons
                              </div>
                            </div>

                            <div className="mt-1 text-[11px] text-gray-600 dark:text-white/60">
                              {meta.outcome}
                            </div>
                            <div className="mt-1 text-[11px] text-gray-600 dark:text-white/60">
                              {meta.blurb}
                            </div>
                          </div>
                        );
                      })}

                      <div className="text-[11px] text-gray-600 dark:text-white/60">
                        Tip: If you override Lessons/Quiz, you’re no longer using track defaults
                        until you tap “Use track defaults”.
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Lesson size + minutes (row 1 right) */}
            <div className="lg:col-span-3 lg:row-start-1 lg:col-start-3">
              <label className="text-xs text-gray-600 dark:text-white/70">Lesson size</label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-1">
                  {PRESETS.map((p) => {
                    const active = sizePreset === p.key;
                    return (
                      <button
                        key={p.key}
                        onClick={() => {
                          if (isLockedLearner) return;
                          setSizePreset(p.key);
                          setMinutes(capMinutes(minutes < p.min ? p.min : minutes));
                        }}
                        disabled={isLockedLearner}
                        className={`chip ${active ? 'chip-active' : ''} ${
                          isLockedLearner ? 'opacity-50 pointer-events-none' : ''
                        }`}
                        title={`${p.label} (~${p.min} min+)`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-gray-600 dark:text-white/70">Minutes</label>
                  <input
                    type="number"
                    min={8}
                    max={600}
                    step={1}
                    value={minutes}
                    onChange={(e) => {
                      if (knobsDisabled) return;
                      const v = Math.max(8, Math.min(600, Number(e.target.value) || 0));
                      setMinutes(v);
                      const next = [...PRESETS].reverse().find((x) => v >= x.min) ?? PRESETS[0];
                      setSizePreset(next.key as SizePresetKey);
                    }}
                    disabled={knobsDisabled}
                    readOnly={knobsDisabled}
                    className={`input !w-24 !py-1.5 !px-2 text-[12px] ${
                      knobsDisabled ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* Level (row 2 left) */}
            <div className="lg:col-span-2 lg:row-start-2 lg:col-start-1">
              <label className="text-xs text-gray-600 dark:text-white/70">Level</label>
              <div className="mt-1 flex rounded-lg ring-1 ring-gray-200 overflow-hidden dark:ring-white/15">
                {(['beginner', 'intermediate', 'advanced'] as const).map((lv) => {
                  const active = classLevel === lv;
                  return (
                    <button
                      key={lv}
                      onClick={() => {
                        if (!isLockedLearner) setClassLevel(lv);
                      }}
                      disabled={isLockedLearner}
                      className={`flex-1 px-2.5 py-1.5 text-[11px] capitalize transition ${
                        active
                          ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 dark:bg-white/20 dark:text-white dark:ring-white/30'
                          : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-white/10 dark:text-white/80 dark:hover:bg-white/15'
                      } ${isLockedLearner ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                      aria-pressed={active}
                      title={lv}
                    >
                      {lv}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Start/Continue + Refresh + Share (row 2 right) */}
            <div className="lg:col-span-3 lg:row-start-2 lg:col-start-3 flex items-end gap-2">
              <button
                type="button"
                onClick={() => onStart?.()}
                disabled={busy || !canStartNow}
                className={`w-full sm:w-auto px-4 py-2 rounded-xl text-sm font-semibold transition ring-1 ${
                  busy
                    ? 'opacity-60 cursor-not-allowed bg-indigo-50 text-indigo-700 ring-indigo-300 dark:bg-indigo-600/30 dark:text-white dark:ring-indigo-500'
                    : 'bg-indigo-50 text-indigo-700 ring-indigo-300 hover:bg-indigo-100 dark:bg-indigo-600/40 dark:text-white dark:ring-indigo-500 dark:hover:bg-indigo-600/50'
                }`}
                title="AI will generate outline + narration"
              >
                <span className="inline-flex items-center justify-center gap-2">
                  {busy ? (
                    <span className="h-4 w-4 rounded-full border-2 border-indigo-400/30 border-t-indigo-600 animate-spin dark:border-white/30 dark:border-t-white" />
                  ) : null}
                  {startBtnLabel}

                </span>
              </button>

              {/* Hide these when locked */}
              {selectedCourse && !isLockedLearner && (
                <button
                  onClick={() => onRefreshSelectedAI()}
                  className="chip"
                  title="Clear this course’s cache (outline, narration, quiz) and regenerate"
                >
                  Refresh AI
                </button>
              )}

              {/* Button gate */}
              {canShareUi && !isLockedLearner && (
                <button
                  onClick={onOpenShare}
                  disabled={!selectedCourse?.id && !customTitle.trim()}
                  className={`chip ${selectedCourse?.id ? 'chip-active' : ''}`}
                  title={
                    selectedCourse?.id
                      ? 'Share this course with your learners'
                      : 'Select or generate a course first'
                  }
                >
                  Share with learners
                </button>
              )}
            </div>
          </div>

          {/* Simple extra knobs row — hide in minimal */}
          {!showMinimalControls && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <label className="text-sm">
                  Minutes
                  <input
                    type="number"
                    min={3}
                    max={5000}
                    value={minutes}
                    onChange={(e) => {
                      if (knobsDisabled) return;
                      const v = Math.max(3, Number(e.target.value) || 0);
                      setMinutes(v);
                      const next = [...PRESETS].reverse().find((x) => v >= x.min) ?? PRESETS[0];
                      setSizePreset(next.key as SizePresetKey);
                    }}
                    disabled={knobsDisabled}
                    readOnly={knobsDisabled}
                    className={`input !py-2 !px-3 text-sm w-full ${
                      knobsDisabled ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  />
                </label>

                <label className="text-sm">
                  Lessons
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={totalLessons}
                    onChange={(e) => {
                      if (knobsDisabled) return;
                      const v = Math.max(1, Number(e.target.value) || 0);
                      /* ✅ start using custom lessons */
                      props.setOverrideLessons(true);
                      setTotalLessons(v);
                    }}
                    disabled={knobsDisabled}
                    readOnly={knobsDisabled}
                    className={`input !py-2 !px-3 text-sm w-full ${
                      knobsDisabled ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  />
                </label>

                <label className="text-sm">
                  Quiz questions
                  <input
                    type="number"
                    min={4}
                    max={400}
                    value={quizCount}
                    onChange={(e) => {
                      if (knobsDisabled) return;
                      const v = Math.max(4, Number(e.target.value) || 0);
                      /* ✅ start using custom quiz size */
                      props.setOverrideQuiz(true);
                      setQuizCount(v);
                    }}
                    disabled={knobsDisabled}
                    readOnly={knobsDisabled}
                    className={`input !py-2 !px-3 text-sm w-full ${
                      knobsDisabled ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  />
                </label>
              </div>

              {/* “Use track defaults” chip — only when any override is active */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {(props.overrideLessons || props.overrideQuiz) && (
                  <button
                    type="button"
                    onClick={() => {
                      props.setOverrideLessons(false);
                      props.setOverrideQuiz(false);
                      // snap visible fields back to current track defaults
                      setTotalLessons(trackLessons);
                      setQuizCount(Math.max(4, Math.floor(trackLessons * 2)));
                    }}
                    className="px-3 py-1.5 rounded-full text-xs bg-gray-100 dark:bg-[#172534] ring-1 ring-gray-200 dark:ring-white/15"
                    title="Revert to track defaults"
                  >
                    Use track defaults
                  </button>
                )}
              </div>
            </>
          )}

          {/* Custom topic */}
          {!isLockedLearner && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="md:col-span-2">
                <label className="text-xs text-gray-600 dark:text-white/70">Or type any topic</label>
                <input
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.currentTarget.value)}
                  placeholder="e.g., Linear Algebra crash course"
                  className="input mt-1"
                />
              </div>
              <div className="flex flex-col items-start">
                <button
                  type="button"
                  className={`w-full md:w-auto px-4 py-2 rounded-xl text-sm font-semibold transition ring-1 ${
                    !customTitle.trim() || busy || !canStartNow
                      ? 'opacity-60 cursor-not-allowed bg-indigo-50 text-indigo-700 ring-indigo-300 dark:bg-indigo-600/30 dark:text-white dark:ring-indigo-500'
                      : 'bg-indigo-50 text-indigo-700 ring-indigo-300 hover:bg-indigo-100 dark:bg-indigo-600/40 dark:text-white dark:ring-indigo-500 dark:hover:bg-indigo-600/50'
                  }`}
                  onClick={() => onStart()}
                  disabled={!customTitle.trim() || busy || !canStartNow}
                  title="Spin up an AI sandbox course for this topic"
                >
                 <span className="inline-flex items-center justify-center gap-2">
                  {busy ? (
                    <span className="h-4 w-4 rounded-full border-2 border-indigo-400/30 border-t-indigo-600 animate-spin dark:border-white/30 dark:border-t-white" />
                  ) : (
                    <span className="text-base">✨</span>
                  )}
                  {teachBtnLabel}
                </span>

                </button>

                {!selectedCourse && !customTitle.trim() && (
                  <p className="mt-1 text-xs text-red-500">
                    Pick a course or enter a custom topic first.
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {false /* error displayed in container when needed */ && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-300">Error</p>
      )}
    </section>
  );
});
ControlsPanel.displayName = 'RobotTeacherControls';
export default ControlsPanel;
