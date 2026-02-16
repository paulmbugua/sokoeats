import React from 'react';

type StudioSidePanelProps = {
  displayTitle: string;
  programTrackLabel: string;
  minutes: number;
  lessons: number;
  quiz: number;
  step: string;
  grade?: { scorePct?: number; passMark?: number; passed?: boolean } | null;
  outline: any[];
  currentIdx: number;
  onJumpToIndex?: (idx: number) => void;
  canShareUi: boolean;
  onOpenShare: () => void;
  isLockedLearner: boolean;
  showDegradedNotice?: boolean;
};

const StudioSidePanel: React.FC<StudioSidePanelProps> = ({
  displayTitle,
  programTrackLabel,
  minutes,
  lessons,
  quiz,
  step,
  grade,
  outline,
  currentIdx,
  onJumpToIndex,
  canShareUi,
  onOpenShare,
  isLockedLearner,
  showDegradedNotice,
}) => {
  return (
    <aside className="panel h-full space-y-4 p-4">
      <div>
        <div className="text-xs uppercase tracking-[0.18em] text-gray-500 dark:text-white/60">Studio dashboard</div>
        <div className="mt-1 text-base font-semibold text-gray-900 dark:text-white line-clamp-2">{displayTitle}</div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="chip">{programTrackLabel}</span>
          <span className="chip">⏱ {minutes} min</span>
          <span className="chip">📚 {lessons} lessons</span>
          <span className="chip">📝 {quiz} quiz</span>
        </div>
      </div>
      {showDegradedNotice ? <div className="rounded-xl bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">AI service is in fallback mode. You can continue learning.</div> : null}
      <div className="rounded-xl border border-gray-200 p-3 dark:border-white/10">
        <div className="text-xs text-gray-500 dark:text-white/60">Current step</div>
        <div className="text-sm font-semibold capitalize text-gray-900 dark:text-white">{step || 'idle'}</div>
      </div>
      <div className="rounded-xl border border-gray-200 p-3 dark:border-white/10">
        <div className="text-xs text-gray-500 dark:text-white/60">Certificate</div>
        <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
          {grade?.passed ? 'Certificate unlocked 🎉' : `Score ≥${grade?.passMark ?? 70}% to unlock certificate`}
        </div>
        {typeof grade?.scorePct === 'number' ? <div className="text-xs text-gray-600 dark:text-white/70">Your score: {grade.scorePct}%</div> : null}
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs text-gray-500 dark:text-white/60">Outline navigator</div>
          {canShareUi && !isLockedLearner ? (
            <button onClick={onOpenShare} className="chip chip-active">
              Share
            </button>
          ) : null}
        </div>
        <div className="max-h-[320px] space-y-2 overflow-auto pr-1">
          {outline.map((item, idx) => {
            const label = item?.title || item?.name || `Lesson ${idx + 1}`;
            const active = idx === currentIdx;
            return (
              <button
                key={`${label}-${idx}`}
                onClick={() => onJumpToIndex?.(idx)}
                className={`w-full rounded-lg px-2 py-2 text-left text-xs ${active ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-100' : 'bg-gray-50 text-gray-700 dark:bg-white/5 dark:text-white/80'}`}
              >
                {idx + 1}. {label}
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
};

export default StudioSidePanel;
