import React from 'react';

type Pill = { label: string; icon?: React.ReactNode };

type HeroStudioHeaderProps = {
  title: string;
  subtitle: string;
  pills: Pill[];
  nowStudying?: {
    title: string;
    blurb?: string;
    stepLabel?: string;
    progressHint?: string;
    programTrackLabel?: string;
    minutesEffective?: number;
    lessonsEffective?: number;
    quizEffective?: number;
  };
  isOrgFlow?: boolean;
  isSandbox?: boolean;
  degraded?: boolean;
};

const HeroStudioHeader: React.FC<HeroStudioHeaderProps> = ({
  title,
  subtitle,
  pills,
  nowStudying,
  isOrgFlow,
  isSandbox,
  degraded,
}) => {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/60 bg-gradient-to-br from-indigo-100 via-white to-cyan-100 p-6 shadow-lg dark:border-white/10 dark:from-indigo-950/60 dark:via-slate-950 dark:to-cyan-950/40">
      <div className="pointer-events-none absolute -top-20 -left-10 h-52 w-52 rounded-full bg-indigo-400/25 blur-3xl dark:bg-indigo-500/20" />
      <div className="pointer-events-none absolute -bottom-20 -right-10 h-52 w-52 rounded-full bg-cyan-400/30 blur-3xl dark:bg-cyan-500/20" />
      <div className="relative grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {pills.map((pill) => (
              <span key={pill.label} className="chip bg-white/85 dark:bg-slate-900/80">
                <span className="mr-1">{pill.icon ?? '✨'}</span>
                {pill.label}
              </span>
            ))}
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-darkText dark:text-white sm:text-4xl">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-700 dark:text-white/75 sm:text-base">{subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {isOrgFlow ? <span className="chip">🏫 Organization flow</span> : null}
            {isSandbox ? <span className="chip">🧪 Sandbox share-ready</span> : null}
            {degraded ? <span className="chip bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">⚠ Limited mode</span> : null}
          </div>
        </div>

        {nowStudying ? (
          <aside className="panel bg-white/80 p-4 backdrop-blur-sm dark:bg-slate-900/70">
            <div className="text-[10px] font-semibold tracking-[0.2em] text-gray-500 dark:text-white/60">NOW STUDYING</div>
            <div className="mt-2 text-base font-semibold text-gray-900 dark:text-white line-clamp-2">{nowStudying.title}</div>
            {nowStudying.blurb ? (
              <p className="mt-1 text-xs text-gray-600 dark:text-white/70 line-clamp-3">{nowStudying.blurb}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              {nowStudying.stepLabel ? <span className="chip chip-active">{nowStudying.stepLabel}</span> : null}
              {typeof nowStudying.minutesEffective === 'number' ? <span className="chip">⏱ {nowStudying.minutesEffective} min</span> : null}
              {typeof nowStudying.lessonsEffective === 'number' ? <span className="chip">📚 {nowStudying.lessonsEffective} lessons</span> : null}
              {typeof nowStudying.quizEffective === 'number' ? <span className="chip">📝 {nowStudying.quizEffective} quiz</span> : null}
              {nowStudying.programTrackLabel ? <span className="chip">🎯 {nowStudying.programTrackLabel}</span> : null}
            </div>
            {nowStudying.progressHint ? <div className="mt-3 text-xs text-gray-600 dark:text-white/65">{nowStudying.progressHint}</div> : null}
          </aside>
        ) : null}
      </div>
    </section>
  );
};

export default HeroStudioHeader;
