// apps/web/src/components/AntiCheatGuard.web.tsx
import React from 'react';

type Props = {
  deviceId: string;
  setDeviceId?: (id: string) => void;
  quizActive: boolean;
  elapsedMs: number;
  backgrounds: number;
  suspicions: number;
  policy?: {
    heartbeatSec: number;
    maxBackgrounds: number;
    maxSuspicion: number;
    timerSec?: number;
  };
  onTooManyBackgrounds?: () => void;
  onBumpSuspicion?: (delta?: number) => void;
};

const fmtHMS = (totalSeconds: number | string | null | undefined) => {
  const n = Number(totalSeconds);
  const s = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

const AntiCheatGuard: React.FC<Props> = ({
  deviceId,
  setDeviceId,
  quizActive,
  elapsedMs,
  backgrounds,
  suspicions,
  policy,
  onTooManyBackgrounds,
  onBumpSuspicion,
}) => {
  const maxBg = policy?.maxBackgrounds ?? 2;
  const maxSus = policy?.maxSuspicion ?? 5;

  const lockNotifiedRef = React.useRef(false);

  const elapsedS = (() => {
    const n = Number(elapsedMs);
    return Math.max(0, Math.floor(Number.isFinite(n) ? n / 1000 : 0));
  })();

  const timerSec = Number(policy?.timerSec ?? 0);
  const safeTimer = Number.isFinite(timerSec) ? timerSec : 0;

  const remainingS = Math.max(0, Math.floor(safeTimer - elapsedS));
  const pct =
    safeTimer > 0
      ? Math.min(100, Math.max(0, (remainingS / Math.max(1, safeTimer)) * 100))
      : 0;

  React.useEffect(() => {
    if (!quizActive || backgrounds <= maxBg) {
      lockNotifiedRef.current = false;
    }
  }, [quizActive, backgrounds, maxBg]);

  React.useEffect(() => {
    if (!quizActive) return;
    if (policy?.maxBackgrounds != null && backgrounds > policy.maxBackgrounds) {
      if (!lockNotifiedRef.current) {
        lockNotifiedRef.current = true;
        onTooManyBackgrounds?.();
      }
    }
  }, [quizActive, backgrounds, policy?.maxBackgrounds, onTooManyBackgrounds]);

  const Badge = ({
    children,
    tone = 'muted',
    title,
  }: {
    children: React.ReactNode;
    tone?: 'ok' | 'warn' | 'danger' | 'muted';
    title?: string;
  }) => {
    const cls =
      tone === 'ok'
        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/30'
        : tone === 'warn'
        ? 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30'
        : tone === 'danger'
        ? 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-200 dark:ring-red-500/30'
        : 'bg-gray-50 text-gray-700 ring-gray-200 dark:bg-white/5 dark:text-white/80 dark:ring-white/10';

    return (
      <span
        title={title}
        className={[
          // ✅ key mobile safety bits: truncate + min-w-0 + max-w-full
          'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1',
          'min-w-0 max-w-full',
          'whitespace-nowrap overflow-hidden text-ellipsis',
          cls,
        ].join(' ')}
      >
        {children}
      </span>
    );
  };

  const bgTone: 'ok' | 'warn' | 'danger' =
    backgrounds > maxBg ? 'danger' : backgrounds === maxBg ? 'warn' : 'ok';

  const susTone: 'ok' | 'warn' | 'danger' =
    suspicions >= maxSus
      ? 'danger'
      : suspicions >= Math.max(1, Math.floor(maxSus * 0.7))
      ? 'warn'
      : 'ok';

  return (
    <div className="rounded-2xl bg-white ring-1 ring-gray-200 p-3 sm:p-4 mb-3 shadow-sm dark:bg-[#0f1821] dark:ring-white/10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Left: title + device */}
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="inline-flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2l7 3v6c0 5-3.4 9.7-7 11-3.6-1.3-7-6-7-11V5l7-3z" />
            </svg>
          </div>

          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-darkText dark:text-white">
              Quiz Integrity
            </h3>
            <div className="mt-0.5 text-[11px] sm:text-xs text-gray-600 dark:text-white/70 min-w-0">
              <span>Device:&nbsp;</span>
              <span className="font-medium text-darkText dark:text-white break-all">
                {deviceId ? deviceId.slice(0, 18) : 'binding…'}
              </span>
            </div>
          </div>
        </div>

        {/* ✅ Badges: grid on mobile so heartbeat stays inside screen */}
        <div className="w-full sm:w-auto">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2">
            <Badge tone={bgTone} title="Number of times the tab/app lost focus">
              <span className="truncate">Exits: {backgrounds}/{maxBg}</span>
            </Badge>

            <Badge tone={susTone} title="Suspicion level accumulated for unusual actions">
              <span className="truncate">Suspicion: {suspicions}/{maxSus}</span>
            </Badge>

            {/* Heartbeat: short label on xs, full label on sm+ */}
            <Badge tone="muted" title="Anti-cheat heartbeat interval">
              <span className="sm:hidden truncate">
                HB: {policy?.heartbeatSec ?? 15}s
              </span>
              <span className="hidden sm:inline truncate">
                {policy?.heartbeatSec ?? 15}s heartbeat
              </span>
            </Badge>
          </div>
        </div>
      </div>

      {/* Timer bar */}
      {safeTimer > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] text-gray-600 dark:text-white/60">
            <span>Time limit</span>
            <span className="font-medium text-darkText dark:text-white">{fmtHMS(remainingS)} left</span>
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

      {/* Metrics tiles */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricCard
          label="Remaining"
          value={fmtHMS(remainingS)}
          tone={
            safeTimer > 0
              ? remainingS <= 60
                ? 'danger'
                : remainingS <= 180
                ? 'warn'
                : 'ok'
              : 'muted'
          }
        />
        <MetricCard label="Focus exits" value={`${backgrounds}/${maxBg}`} tone={bgTone} />
        <MetricCard label="Suspicion" value={`${suspicions}/${maxSus}`} tone={susTone} />
        <MetricCard label="Time limit" value={safeTimer > 0 ? fmtHMS(safeTimer) : 'No limit'} />
      </div>

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onBumpSuspicion?.(1)}
          className="px-3 py-1.5 rounded-xl text-sm font-medium ring-1 ring-gray-300 text-gray-700 hover:bg-gray-50 dark:text-white/90 dark:ring-white/15 dark:hover:bg-white/10"
          title="Flag suspicious action (e.g., paste)"
        >
          Flag paste
        </button>

        {setDeviceId ? (
          <button
            type="button"
            onClick={() => setDeviceId(String(Date.now()))}
            className="px-3 py-1.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500"
            title="Rebind device id"
          >
            Rebind
          </button>
        ) : null}
      </div>

      {/* Hint / Notice */}
      <div className="mt-2 text-[11px] text-gray-500 dark:text-white/60">
        Don’t leave the page while the quiz is active. Unusual activity may auto-submit your attempt.
      </div>

      {/* Elevated warning when at risk */}
      {(backgrounds === maxBg || suspicions >= Math.max(1, Math.floor(maxSus * 0.7))) && (
        <div className="mt-3 rounded-xl p-3 ring-1 ring-amber-200 bg-amber-50 text-amber-800 text-xs dark:bg-amber-500/10 dark:ring-amber-500/30 dark:text-amber-200">
          Heads up: you’re close to the limit. Switching tabs/apps or suspicious actions could lock and submit your quiz.
        </div>
      )}

      {/* Lock notice (visual only) */}
      {(backgrounds > maxBg || suspicions >= maxSus) && (
        <div className="mt-3 rounded-xl p-3 ring-1 ring-red-200 bg-red-50 text-red-800 text-xs dark:bg-red-500/10 dark:ring-red-500/30 dark:text-red-200">
          Quiz locked due to policy limits. Please wait while your attempt is submitted.
        </div>
      )}
    </div>
  );
};

function MetricCard({
  label,
  value,
  tone = 'muted',
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'ok' | 'warn' | 'danger' | 'muted';
}) {
  const ring =
    tone === 'ok'
      ? 'ring-emerald-200 dark:ring-emerald-500/30'
      : tone === 'warn'
      ? 'ring-amber-200 dark:ring-amber-500/30'
      : tone === 'danger'
      ? 'ring-red-200 dark:ring-red-500/30'
      : 'ring-gray-200 dark:ring-white/10';

  const bg =
    tone === 'ok'
      ? 'bg-emerald-50 dark:bg-emerald-500/10'
      : tone === 'warn'
      ? 'bg-amber-50 dark:bg-amber-500/10'
      : tone === 'danger'
      ? 'bg-red-50 dark:bg-red-500/10'
      : 'bg-white dark:bg-white/5';

  return (
    <div className={`rounded-xl p-3 text-center ring-1 ${ring} ${bg}`}>
      <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/60">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold text-darkText dark:text-white">
        {value}
      </div>
    </div>
  );
}

export default React.memo(AntiCheatGuard);
