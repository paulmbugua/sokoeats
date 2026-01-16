import React from 'react';

// Modified for Language Learning UX upgrade (theme-aware voice dropdown).
export default function VoiceSelect({
  value,
  onChange,
  options,
  loading,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  loading?: boolean;
  error?: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState<number>(-1);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const listId = React.useId();

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  React.useEffect(() => {
    if (open) {
      const idx = Math.max(
        0,
        options.findIndex((o) => o === value)
      );
      setActive(idx);
      requestAnimationFrame(() => {
        const el = listRef.current?.querySelector(`[data-idx="${idx}"]`) as HTMLElement | null;
        el?.scrollIntoView({ block: 'nearest' });
      });
    }
  }, [open, options, value]);

  const commit = (idx: number) => {
    const v = options[idx];
    if (v) onChange(v);
    setOpen(false);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i < 0 ? 0 : i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i < 0 ? 0 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0) commit(active);
    }
  };

  const label = loading
    ? 'Loading voices…'
    : error
      ? 'Voices unavailable'
      : value || 'Select a voice';

  return (
    <div ref={wrapRef} className="relative overflow-visible">
      <button
        type="button"
        role="combobox"
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className="appearance-none text-[12px] sm:text-xs pr-8 pl-3 py-2 rounded-xl bg-white text-slate-700 ring-1 ring-slate-200/80 shadow-sm min-w-[10rem] text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:bg-slate-900 dark:text-slate-100 dark:ring-white/10 dark:hover:bg-slate-800/70 dark:focus:ring-emerald-400/40"
        title={label}
      >
        <span className="truncate inline-block max-w-[12rem] align-middle">{label}</span>
        <svg
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/80"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-[200] max-h-64 overflow-auto rounded-xl bg-white/95 backdrop-blur-xl ring-1 ring-slate-200 shadow-2xl dark:bg-slate-900/95 dark:ring-white/10"
        >
          {options.map((opt, idx) => {
            const selected = opt === value;
            const isActive = idx === active;
            return (
              <li
                key={opt}
                data-idx={idx}
                role="option"
                aria-selected={selected}
                className={`px-3 py-2 text-xs sm:text-sm cursor-pointer select-none ${
                  isActive
                    ? 'bg-emerald-500/15 text-slate-900 dark:text-white'
                    : selected
                      ? 'bg-emerald-500/10 text-slate-900 dark:text-white'
                      : 'text-slate-600 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/10'
                }`}
                onMouseEnter={() => setActive(idx)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(idx)}
              >
                {opt}
              </li>
            );
          })}
          {!options.length && (
            <li className="px-3 py-2 text-xs text-slate-500 dark:text-white/70">No voices</li>
          )}
        </ul>
      )}
    </div>
  );
}
