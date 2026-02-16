import React from 'react';

type StickyStartBarProps = {
  show: boolean;
  canStartNow: boolean;
  busy: boolean;
  title: string;
  meta: { programTrackLabel: string; minutes: number; lessons: number; quiz: number };
  onStart: () => void;
  onOpenAllCourses?: () => void;
};

const StickyStartBar: React.FC<StickyStartBarProps> = ({
  show,
  canStartNow,
  busy,
  title,
  meta,
  onStart,
  onOpenAllCourses,
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-white/80 bg-white/95 p-3 shadow-2xl backdrop-blur md:sticky md:bottom-6 md:inset-auto dark:border-white/10 dark:bg-slate-950/90">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-gray-900 dark:text-white">{title}</div>
          <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-gray-600 dark:text-white/65">
            <span className="chip">{meta.programTrackLabel}</span>
            <span>{meta.minutes}m</span>
            <span>• {meta.lessons} lessons</span>
            <span>• {meta.quiz} quiz</span>
          </div>
          {!canStartNow ? <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">Select a course or enter a topic.</div> : null}
        </div>
        <div className="flex shrink-0 gap-2">
          {onOpenAllCourses ? (
            <button onClick={onOpenAllCourses} className="chip hidden sm:inline-flex">
              Browse courses
            </button>
          ) : null}
          <button
            onClick={onStart}
            disabled={!canStartNow || busy}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Starting…' : 'Start lesson'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StickyStartBar;
