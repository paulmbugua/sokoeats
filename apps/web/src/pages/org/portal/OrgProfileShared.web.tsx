// apps/web/src/pages/org/portal/OrgProfileShared.web.tsx
import React, { useState } from 'react';

/* ----------------------------- shared types ----------------------------- */

export type MiniUser = {
  id: string | number;
  name?: string;
  email?: string;
  can_access_fees?: boolean;

  // optional staff fields (instructors)
  staff_code?: string | null;

  // optional learner fields
  admission_code?: string | null;
  class_label?: string | null;
  guardian_email?: string | null;

  // last issued temp password (instructor or learner)
  temp_password?: string | null;
};

/* ----------------------------- shared helpers ----------------------------- */

const FALLBACK = (n = 'Org') =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(n)}&background=047857&color=ffffff`;

export const resolveAsset = (raw?: string, backendUrl?: string, fallbackName?: string) => {
  if (!raw) return FALLBACK(fallbackName ?? 'Org');
  if (raw.startsWith('/') && backendUrl) return `${backendUrl.replace(/\/+$/, '')}${raw}`;
  return raw;
};

export const getInitials = (name?: string, email?: string) => {
  const src = (name && name.trim()) || (email && email.split('@')[0]) || '';
  const parts = src.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || '').join('') || '👤';
};

export const tierBadge = (t?: string) => {
  const tier = (t || 'starter').toLowerCase();
  if (tier === 'enterprise') return 'bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/30';
  if (tier === 'pro') return 'bg-indigo-500/15 text-indigo-600 ring-1 ring-indigo-500/30';
  return 'bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/30';
};

export const cardBase =
  'rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821]';

/* -------------------------- shared UI components ------------------------- */

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`animate-pulse rounded-md bg-gray-200/70 dark:bg-white/10 ${className || ''}`} />
);

/* ----------------------------- icon helpers ----------------------------- */

const IconBtn: React.FC<{
  title: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'wa' | 'danger';
  children: React.ReactNode;
}> = ({ title, href, onClick, disabled, variant = 'default', children }) => {
  const base =
    'inline-flex items-center justify-center h-8 w-8 rounded-lg ring-1 transition ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500';

  const styles =
    variant === 'danger'
      ? 'bg-rose-600 text-white ring-rose-500/40 hover:bg-rose-500 disabled:opacity-60 disabled:hover:bg-rose-600'
      : variant === 'wa'
        ? 'bg-emerald-600 text-white ring-emerald-500/40 hover:bg-emerald-500 disabled:opacity-60 disabled:hover:bg-emerald-600'
        : 'bg-[#e7edf4] dark:bg-[#172534] text-[#0d141c] dark:text-darkTextPrimary ring-black/5 dark:ring-white/10 hover:bg-[#dfe7ef] dark:hover:bg-[#1c2d40] disabled:opacity-60';

  const cls = `${base} ${styles}`;

  if (href) {
    return (
      <a
        href={href}
        target={href.startsWith('http') ? '_blank' : undefined}
        rel={href.startsWith('http') ? 'noreferrer noopener' : undefined}
        className={cls}
        title={title}
        aria-label={title}
        onClick={(e) => {
          if (disabled) e.preventDefault();
        }}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cls}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
};

const MailIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
    <path d="M4 6h16v12H4z" />
    <path d="M4 7l8 6 8-6" />
  </svg>
);

const WhatsAppIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M12.04 2C6.56 2 2.1 6.46 2.1 11.94c0 1.74.46 3.44 1.34 4.95L2 22l5.26-1.38c1.44.79 3.06 1.2 4.77 1.2h.01c5.48 0 9.94-4.46 9.94-9.94C21.98 6.46 17.52 2 12.04 2zm5.78 14.42c-.24.68-1.2 1.25-1.88 1.4-.47.1-1.07.18-3.48-.74-3.08-1.18-5.05-4.12-5.2-4.32-.15-.2-1.24-1.65-1.24-3.15 0-1.5.78-2.24 1.06-2.55.28-.3.61-.38.82-.38h.6c.2 0 .46-.08.72.55.26.63.88 2.18.96 2.34.08.16.13.35.02.56-.1.2-.15.35-.3.54-.15.2-.31.44-.45.59-.15.15-.3.32-.13.63.17.3.76 1.25 1.62 2.02 1.11 1 2.04 1.31 2.34 1.46.3.15.48.13.66-.08.18-.2.76-.88.96-1.18.2-.3.4-.25.67-.15.28.1 1.74.82 2.04.97.3.15.5.23.57.36.06.13.06.75-.18 1.43z" />
  </svg>
);

const TrashIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M6 6l1 16h10l1-16" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

/* ------------------------------ PersonRow ------------------------------ */

export const PersonRow: React.FC<{
  u: MiniUser;
  onRemove?: () => Promise<void> | void;
  badge?: React.ReactNode;
  extraActions?: React.ReactNode;
}> = ({ u, onRemove, badge, extraActions }) => {
  const msg = `Hi${u.name ? ` ${u.name}` : ''}, I’d like to get in touch.`;
  const [removing, setRemoving] = useState(false);

  const doRemove = async () => {
    if (!onRemove) return;
    if (removing) return;
    setRemoving(true);
    try {
      await onRemove();
    } finally {
      setRemoving(false);
    }
  };

  const hasEmail = !!u.email?.trim();

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-slate-50 dark:hover:bg-[#0b1620]">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="size-9 shrink-0 rounded-full ring-1 ring-black/5 dark:ring-white/10 bg-slate-100 dark:bg-white/10 grid place-items-center text-xs font-semibold">
          {getInitials(u.name, u.email)}
        </div>

        {/* Give the name more room */}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{u.name || u.email || `User #${u.id}`}</div>
          {u.email && (
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary truncate">
              {u.email}
            </div>
          )}
          {badge ? <div className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-200">{badge}</div> : null}
        </div>
      </div>

      {/* Right side actions: ICONS ONLY */}
      <div className="flex items-center gap-1.5 shrink-0">
        {extraActions}
        <IconBtn
          title={hasEmail ? 'Email' : 'No email'}
          href={hasEmail ? `mailto:${u.email}` : undefined}
          disabled={!hasEmail}
        >
          <MailIcon className="h-4 w-4" />
        </IconBtn>

        <IconBtn
          title="WhatsApp"
          href={`https://wa.me/?text=${encodeURIComponent(msg)}`}
          variant="wa"
        >
          <WhatsAppIcon className="h-4 w-4" />
        </IconBtn>

        {onRemove && (
          <IconBtn
            title="Remove from organization"
            onClick={doRemove}
            disabled={removing}
            variant="danger"
          >
            <TrashIcon className="h-4 w-4" />
          </IconBtn>
        )}
      </div>
    </li>
  );
};
