// OrgFees.ui.tsx
import React, { useEffect, useState } from 'react';
import { cn, moneyFromCents } from './OrgFees.shared';

/* ─────────────────────────────────────────────────────────
 * CircleCheckbox (small circle “ack” checkbox)
 * ───────────────────────────────────────────────────────── */

export function CircleCheckbox({
  checked,
  onChange,
  label,
  disabled,
  className,
  labelClassName,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: React.ReactNode;
  disabled?: boolean;
  className?: string;
  labelClassName?: string;
}) {
  return (
    <label
      className={cn(
        'inline-flex items-center gap-2 select-none',
        disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
        className,
      )}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />

      {/* Small circle + dot */}
      <span
        aria-hidden="true"
        className={cn(
          'relative h-4 w-4 rounded-full border flex items-center justify-center transition',
          'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500/40',
          'peer-checked:border-blue-600 peer-checked:bg-blue-600 dark:peer-checked:border-blue-500 dark:peer-checked:bg-blue-500',
          "after:content-[''] after:h-2 after:w-2 after:rounded-full after:bg-white after:opacity-0 after:transition-opacity",
          'peer-checked:after:opacity-100',
        )}
      />

      <span className={cn('text-xs text-slate-600 dark:text-slate-200', labelClassName)}>{label}</span>
    </label>
  );
}

/* ─────────────────────────────────────────────────────────
 * CopyRow
 * ───────────────────────────────────────────────────────── */

export function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        return;
      }
    } catch {
      // fall through
    }

    try {
      const el = document.createElement('textarea');
      el.value = value;
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.focus();
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
    } catch {
      // no-op
    }
  };

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(t);
  }, [copied]);

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">{label}</div>

      <div className="flex items-center justify-between gap-3">
        <code className="min-w-0 break-all rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {value}
        </code>

        <button
          type="button"
          onClick={onCopy}
          className={cn(
            'shrink-0 rounded-md border px-2 py-1 text-xs font-semibold transition',
            'border-slate-200 text-slate-700 hover:bg-slate-50',
            'dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800',
          )}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * MoneyStack
 * ───────────────────────────────────────────────────────── */

export function MoneyStack({ rows }: { rows: Array<{ currency: string; value: number }> }) {
  const cleaned =
    (rows || [])
      .filter((r) => r && r.currency && Number.isFinite(Number(r.value)))
      .map((r) => ({ currency: String(r.currency).toUpperCase(), value: Number(r.value) }))
      .filter((r) => r.value !== 0);

  if (!cleaned.length) return <span className="text-slate-400">—</span>;

  return (
    <span className="inline-flex flex-wrap justify-end gap-1">
      {cleaned.map((r) => (
        <span
          key={r.currency}
          className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          {moneyFromCents(r.value, r.currency)}
        </span>
      ))}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────
 * EmptyState / Badge
 * ───────────────────────────────────────────────────────── */

export const EmptyState: React.FC<{ title: string; body: string; action?: React.ReactNode }> = ({
  title,
  body,
  action,
}) => (
  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
    <div className="font-semibold">{title}</div>
    <div className="mt-1 text-sm">{body}</div>
    {action ? <div className="mt-3">{action}</div> : null}
  </div>
);

export const Badge: React.FC<{ children: React.ReactNode; tone?: 'warn' | 'ok' | 'neutral' }> = ({
  children,
  tone = 'neutral',
}) => {
  const cls =
    tone === 'warn'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
      : tone === 'ok'
        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';

  return <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', cls)}>{children}</span>;
};

/* ─────────────────────────────────────────────────────────
 * Modal
 * ───────────────────────────────────────────────────────── */

export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({
  title,
  onClose,
  children,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" />

      <div className="absolute inset-0 flex items-end justify-center p-0 md:items-center md:p-4">
        <div
          className={cn(
            'w-full border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900',
            'rounded-t-2xl md:rounded-2xl',
            'max-h-[92vh] md:max-h-[88vh]',
            'overflow-hidden',
            'md:max-w-3xl',
          )}
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
            <div className="text-base font-semibold">{title}</div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Close
            </button>
          </div>

          <div className="max-h-[calc(92vh-64px)] overflow-y-auto p-4 md:max-h-[calc(88vh-64px)]">{children}</div>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────
 * SectionCard
 * ───────────────────────────────────────────────────────── */

export const SectionCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({
  title,
  subtitle,
  children,
}) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-semibold">{title}</div>
        {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
      </div>
    </div>
    <div className="mt-3">{children}</div>
  </div>
);
