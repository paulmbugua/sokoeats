// apps/web/src/components/RobotTeacherControls.tsx
import React from 'react';

export type SizePresetKey = 'quick' | 'standard' | 'extended' | 'intensive' | 'marathon';
export type TrackKey = 'module' | 'certificate' | 'diploma' | 'degree';

type CourseOption = { id: string; title: string };

/* Minimal dropdown (unchanged styling) */
const CourseSelect: React.FC<{
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}> = React.memo(({ options, value, onChange, placeholder = 'Select a course…' }) => {
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
        {selected ? (
          selected.label
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
        className={`${open ? 'block' : 'hidden'} absolute left-0 right-0 top-[calc(100%+6px)] max-h-64 overflow-auto rounded-xl ring-1 ring-gray-200 bg-white shadow-lg dark:ring-white/10 dark:bg-[#0f1821]`}
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
  } = props;

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
              {busy ? 'Preparing…' : hasAIContent ? 'Continue lesson' : 'Start with A.I'}
            </button>
          </div>
        </div>
      ) : (
        /* ───────────── Full controls (self-serve) ───────────── */
        <>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
            {/* Course */}
            <div className="lg:col-span-2">
              <label className="text-xs text-gray-600 dark:text-white/70">Course</label>
              <div className="mt-1 relative z-[20]">
                {isLockedLearner ? (
                  <div className="input bg-gray-100 dark:bg-white/10 cursor-not-allowed">
                   {selectedCourse?.title || 'Assigned course'}

                  </div>
                ) : (
                  <CourseSelect
                    value={selectedCourse?.id || ''}
                    onChange={(id) => onSelectCourse(id)}
                    options={(topCourses || []).map((c) => ({ value: c.id, label: c.title }))}
                    placeholder={(topCourses || []).length ? 'Select a course…' : 'Loading…'}
                  />
                )}
              </div>
            </div>

            {/* Program Track */}
            <div className="lg:col-span-3">
              <label className="text-xs text-gray-600 dark:text-white/70">Program track</label>
              <div className="mt-1 flex flex-wrap gap-1">
                {TRACKS.map((t) => {
                  const active = programTrack === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => {
                        if (!isLockedLearner) setProgramTrack(t.key);
                      }}
                      disabled={isLockedLearner}
                      className={`chip ${active ? 'chip-active' : ''} ${isLockedLearner ? 'opacity-50 pointer-events-none' : ''}`}
                      title={`${t.label}: ~${t.lessons} lessons`}
                    >
                      {t.label} ({t.lessons})
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[11px] text-gray-600 dark:text-white/60">
                Track controls lesson count. We generate ~{trackLessons} lessons for this course.
              </p>
            </div>

            {/* Lesson size + minutes */}
            <div className="lg:col-span-3">
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
                          // NOTE: child uses value setter (not functional) by design
                          setMinutes(capMinutes(minutes < p.min ? p.min : minutes));
                        }}
                        disabled={isLockedLearner}
                        className={`chip ${active ? 'chip-active' : ''} ${isLockedLearner ? 'opacity-50 pointer-events-none' : ''}`}
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
                    className={`input !w-24 !py-1.5 !px-2 text-[12px] ${knobsDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  />
                </div>
              </div>
            </div>

            {/* Level */}
            <div className="lg:col-span-2">
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

            {/* Start/Continue + Refresh + Share */}
            <div className="lg:col-span-3 flex items-end gap-2">
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
                {busy ? 'Preparing…' : hasAIContent ? 'Continue lesson' : 'Start with A.I'}
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
                    className={`input !py-2 !px-3 text-sm w-full ${knobsDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                    className={`input !py-2 !px-3 text-sm w-full ${knobsDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                    className={`input !py-2 !px-3 text-sm w-full ${knobsDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                <label className="text-xs text-gray-600 dark:text-white/70">
                  Or type any topic
                </label>
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
                  {busy ? 'Preparing…' : 'Teach me'}
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
