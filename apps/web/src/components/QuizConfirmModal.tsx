import React, { useEffect } from 'react';

type QuizConfirmModalProps = {
  open: boolean;
  lessons: number;
  questions: number;
  /** Optional total time (in seconds). If provided, the modal will render HH:MM:SS and a progress bar. */
  timerSec?: number | string | null;
  /** Optional elapsed time in ms (e.g., if a pre-quiz timer is already running). Defaults to 0. */
  elapsedMs?: number | string | null;
  /** Back-compat label (used only if `timerSec` is not provided). */
  timeLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  isOrgUser?: boolean;
};

const fmtHMS = (totalSeconds: number | string | null | undefined) => {
  const n = Number(totalSeconds);
  const s = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

const QuizConfirmModal: React.FC<QuizConfirmModalProps> = ({
  open,
  lessons,
  questions,
  timerSec,
  elapsedMs,
  timeLabel,
  onCancel,
  onConfirm,
  isOrgUser = false,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  // Normalize timing like AntiCheatGuard
  const safeTimer = (() => {
    const n = Number(timerSec ?? 0);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  })();

  const elapsedS = (() => {
    const n = Number(elapsedMs ?? 0);
    return Math.max(0, Math.floor(Number.isFinite(n) ? n / 1000 : 0));
  })();

  const remainingS = safeTimer > 0 ? Math.max(0, Math.floor(safeTimer - elapsedS)) : 0;
  const pct =
    safeTimer > 0 ? Math.min(100, Math.max(0, (elapsedS / Math.max(1, safeTimer)) * 100)) : 0;

  const primaryTimeLabel = safeTimer > 0 ? fmtHMS(safeTimer) : (timeLabel ?? 'No limit');

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quiz-confirm-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white ring-1 ring-gray-200 shadow-2xl dark:bg-[#0f1821] dark:ring-white/10">
        {/* Header */}
        <div className="px-5 pt-5">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <h3
            id="quiz-confirm-title"
            className="mt-3 text-xl font-bold text-darkText dark:text-white"
          >
            Ready to start your quiz?
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-white/70">
            Make sure you’ve reviewed the lesson. The timer (if any) starts immediately.
          </p>
          {!isOrgUser && (
            <p className="mt-1 text-sm text-gray-600 dark:text-white/70">
              Note: Questions are generated from the lesson count.
            </p>
          )}
        </div>

        {/* Optional timer bar (matches AntiCheatGuard behavior) */}
        {safeTimer > 0 && (
          <div className="px-5 mt-4">
            <div className="flex items-center justify-between text-[11px] text-gray-600 dark:text-white/60">
              <span>Time limit</span>
              <span className="font-medium text-darkText dark:text-white">
                {fmtHMS(remainingS)} left
              </span>
            </div>
            <div className="mt-1 h-2 w-full rounded-full bg-gray-200/70 dark:bg-white/10">
              <div
                className="h-2 rounded-full transition-[width]"
                style={{
                  width: `${pct}%`,
                  background:
                    'linear-gradient(90deg, rgba(99,102,241,1) 0%, rgba(139,92,246,1) 100%)',
                }}
              />
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="px-5 mt-4">
          <div className="grid grid-cols-3 gap-2">
            <Tile label="Lessons" value={lessons} />
            <Tile label="Questions" value={questions} />
            <Tile label="Time" value={primaryTimeLabel} />
          </div>

          {/* If a timer exists, mirror the AntiCheatGuard metrics style */}
          {safeTimer > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MiniMetric label="Elapsed" value={fmtHMS(elapsedS)} />
              <MiniMetric label="Remaining" value={fmtHMS(remainingS)} />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm font-medium ring-1 ring-gray-300 text-gray-700 hover:bg-gray-50 dark:text-white/90 dark:ring-white/15 dark:hover:bg-white/10"
          >
            Not now
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500 focus:outline-none"
            autoFocus
          >
            Start quiz
          </button>
        </div>
      </div>
    </div>
  );
};

function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl ring-1 ring-gray-200 bg-white p-3 text-center dark:bg-white/5 dark:ring-white/10">
      <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/60">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold text-darkText dark:text-white">{value}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3 text-center ring-1 ring-gray-200 bg-white dark:bg-white/5 dark:ring-white/10">
      <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/60">
        {label}
      </div>
      <div className="mt-0.5 text-base font-semibold text-darkText dark:text-white">{value}</div>
    </div>
  );
}

export default QuizConfirmModal;
