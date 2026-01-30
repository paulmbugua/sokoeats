// apps/web/src/pages/ResourcesPage.web.tsx
'use client';
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCertificate, faMagnifyingGlass, faXmark } from '@fortawesome/free-solid-svg-icons';
import PaymentWidget from '../components/PaymentWidget.web';

import { useResourcesExplore, useClassVault } from '@mytutorapp/shared/hooks';
import { useShopContext } from '@mytutorapp/shared/context';

import type { Course, RecordedVideo } from '@mytutorapp/shared/types';
import type { OerBookItem } from '@mytutorapp/shared/api/resourcesApi';
import CourseHero from '../components/CourseHero';

/* ----------------------------- Small UI bits ----------------------------- */
const Tabs: React.FC<{
  value: 'videos' | 'courses';
  onChange: (next: 'videos' | 'courses') => void;
}> = ({ value, onChange }) => (
  <div className="flex gap-2 rounded-full bg-white dark:bg-[#0f1821] ring-1 ring-[#e4ecf4] dark:ring-darkCard p-1">
    {([
      { key: 'videos', label: 'Explore Videos & Notes' },
      { key: 'courses', label: 'Explore Courses' },
    ] as const).map((tab) => (
      <button
        key={tab.key}
        onClick={() => onChange(tab.key)}
        className={`px-4 py-2 text-sm font-semibold rounded-full transition ${
          value === tab.key
            ? 'bg-[#3d99f5] text-white'
            : 'text-[#5e738f] dark:text-darkTextSecondary'
        }`}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

const MiniMediaTabs: React.FC<{
  value: 'all' | 'videos' | 'notes';
  onChange: (v: 'all' | 'videos' | 'notes') => void;
}> = ({ value, onChange }) => {
  const Tab = ({ k, label, emoji }: { k: 'all' | 'videos' | 'notes'; label: string; emoji: string }) => {
    const active = value === k;
    return (
      <button
        type="button"
        onClick={() => onChange(k)}
        className={`h-9 px-3 rounded-full text-xs font-semibold ring-1 transition inline-flex items-center gap-1 ${
          active
            ? 'bg-[#0d141c] dark:bg-white text-white dark:text-[#0d141c] ring-[#0d141c] dark:ring-white'
            : 'bg-white dark:bg-[#0f1821] text-[#5e738f] dark:text-darkTextSecondary ring-[#e4ecf4] dark:ring-darkCard hover:brightness-105'
        }`}
      >
        <span className={`text-xs ${active ? 'font-extrabold' : 'font-bold'}`}>{emoji}</span>
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div className="mt-3 flex items-center gap-2">
      <Tab k="all" label="All" emoji="✨" />
      <Tab k="videos" label="Videos" emoji="🎬" />
      <Tab k="notes" label="Notes" emoji="📄" />
    </div>
  );
};


const LoadMoreButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}> = ({ onClick, disabled, label = 'Load more' }) => (
  <div className="pt-3">
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 text-sm font-semibold rounded-full bg-[#3d99f5] text-white disabled:opacity-60"
    >
      {label}
    </button>
  </div>
);

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <p className="text-sm text-[#5e738f] dark:text-darkTextSecondary">{message}</p>
);

/* ----------------------------- Filters ---------------------------------- */
type ResourceFilters = {
  subject: string;
  gradeBand: string;
  country: string;
  sourceKind: '' | 'oer' | 'tutor';
  scope: '' | 'free' | 'purchased';
  minRating: number; // 0..5
  maxPrice: number; // tokens, 0 = no cap
};

const DEFAULT_FILTERS: ResourceFilters = {
  subject: '',
  gradeBand: '',
  country: '',
  sourceKind: '',
  scope: '',
  minRating: 0,
  maxPrice: 0,
};

function countActiveFilters(f: ResourceFilters) {
  let n = 0;
  if (f.subject.trim()) n++;
  if (f.gradeBand.trim()) n++;
  if (f.country.trim()) n++;
  if (f.sourceKind) n++;
  if (f.scope) n++;
  if (f.minRating > 0) n++;
  if (f.maxPrice > 0) n++;
  return n;
}

const Chip: React.FC<{
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`h-9 px-3 rounded-full text-sm font-semibold ring-1 transition ${
      active
        ? 'bg-[#3d99f5] text-white ring-[#3d99f5]'
        : 'bg-white dark:bg-[#0f1821] text-[#0d141c] dark:text-white ring-[#e4ecf4] dark:ring-darkCard hover:brightness-105'
    }`}
  >
    {children}
  </button>
);

const FilterModal: React.FC<{
  open: boolean;
  value: ResourceFilters;
  onChange: (next: ResourceFilters) => void;
  onClose: () => void;
  onApply: () => void;
  onReset: () => void;
}> = ({ open, value, onChange, onClose, onApply, onReset }) => {
  if (!open) return null;

  const set = (patch: Partial<ResourceFilters>) => onChange({ ...value, ...patch });

  return (
    <div
      className="fixed inset-0 z-[999] bg-black/55 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-[#0f1821] ring-1 ring-[#e4ecf4] dark:ring-darkCard overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-[#e4ecf4] dark:border-white/10 flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-extrabold text-[#0d141c] dark:text-white">Filters</p>
            <p className="text-xs text-[#49739c] dark:text-darkTextSecondary mt-1">
              Narrow results without overthinking it.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-full bg-[#e7edf4] dark:bg-[#172534] text-[#0d141c] dark:text-white flex items-center justify-center hover:brightness-105"
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Source */}
          <div>
            <p className="text-xs font-bold text-[#49739c] dark:text-darkTextSecondary mb-2">
              Source
            </p>
            <div className="flex flex-wrap gap-2">
              <Chip active={value.sourceKind === ''} onClick={() => set({ sourceKind: '' })}>
                All
              </Chip>
              <Chip active={value.sourceKind === 'oer'} onClick={() => set({ sourceKind: 'oer' })}>
                OER
              </Chip>
              <Chip
                active={value.sourceKind === 'tutor'}
                onClick={() => set({ sourceKind: 'tutor' })}
              >
                Tutors
              </Chip>
            </div>
          </div>

          {/* Scope */}
          <div>
            <p className="text-xs font-bold text-[#49739c] dark:text-darkTextSecondary mb-2">
              Scope
            </p>
            <div className="flex flex-wrap gap-2">
              <Chip active={value.scope === ''} onClick={() => set({ scope: '' })}>
                All
              </Chip>
              <Chip active={value.scope === 'free'} onClick={() => set({ scope: 'free' })}>
                Free
              </Chip>
              <Chip
                active={value.scope === 'purchased'}
                onClick={() => set({ scope: 'purchased' })}
              >
                Purchased
              </Chip>
            </div>
            <p className="text-[11px] text-[#5e738f] dark:text-darkTextSecondary mt-2">
              “Purchased” only applies if purchased kinds are included in the server search.
            </p>
          </div>

          {/* Simple text inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <p className="text-xs font-bold text-[#49739c] dark:text-darkTextSecondary mb-2">
                Subject
              </p>
              <input
                value={value.subject}
                onChange={(e) => set({ subject: e.target.value })}
                placeholder="Math, English…"
                className="h-10 w-full rounded-xl px-3 bg-[#f6f9fc] dark:bg-white/5 ring-1 ring-[#e4ecf4] dark:ring-white/10 outline-none"
              />
            </div>
            <div>
              <p className="text-xs font-bold text-[#49739c] dark:text-darkTextSecondary mb-2">
                Grade band
              </p>
              <input
                value={value.gradeBand}
                onChange={(e) => set({ gradeBand: e.target.value })}
                placeholder="Primary, JHS…"
                className="h-10 w-full rounded-xl px-3 bg-[#f6f9fc] dark:bg-white/5 ring-1 ring-[#e4ecf4] dark:ring-white/10 outline-none"
              />
            </div>
            <div>
              <p className="text-xs font-bold text-[#49739c] dark:text-darkTextSecondary mb-2">
                Country
              </p>
              <input
                value={value.country}
                onChange={(e) => set({ country: e.target.value })}
                placeholder="ke, qa…"
                className="h-10 w-full rounded-xl px-3 bg-[#f6f9fc] dark:bg-white/5 ring-1 ring-[#e4ecf4] dark:ring-white/10 outline-none"
              />
            </div>
          </div>

          {/* Rating + price */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl bg-[#f6f9fc] dark:bg-white/5 ring-1 ring-[#e4ecf4] dark:ring-white/10 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-[#49739c] dark:text-darkTextSecondary">
                  Min rating
                </p>
                <p className="text-xs font-extrabold">{value.minRating.toFixed(1)}+</p>
              </div>
              <input
                type="range"
                min={0}
                max={5}
                step={0.5}
                value={value.minRating}
                onChange={(e) => set({ minRating: Number(e.target.value) })}
                className="w-full mt-2"
              />
            </div>

            <div className="rounded-xl bg-[#f6f9fc] dark:bg-white/5 ring-1 ring-[#e4ecf4] dark:ring-white/10 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-[#49739c] dark:text-darkTextSecondary">
                  Max price
                </p>
                <p className="text-xs font-extrabold">
                  {value.maxPrice > 0 ? `${value.maxPrice} tokens` : 'No cap'}
                </p>
              </div>
              <input
                type="range"
                min={0}
                max={200}
                step={5}
                value={value.maxPrice}
                onChange={(e) => set({ maxPrice: Number(e.target.value) })}
                className="w-full mt-2"
              />
            </div>
          </div>
        </div>

        <div className="px-5 pb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onReset}
            className="h-10 px-4 rounded-full bg-white dark:bg-transparent ring-1 ring-[#e4ecf4] dark:ring-white/10 text-sm font-semibold"
          >
            Reset
          </button>

          <button
            type="button"
            onClick={onApply}
            className="h-10 px-6 rounded-full bg-[#3d99f5] text-white text-sm font-extrabold hover:brightness-110"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

/* ------------------------ ClassVault marketplace card --------------------- */
const ClassVaultCard: React.FC<{
  item: RecordedVideo;
  onOpen: (item: RecordedVideo) => void;
}> = ({ item, onOpen }) => {
  const bust = String(
    (item as any)?.updated_at || (item as any)?.updatedAt || item.created_at || Date.now()
  );

  const withBust = (u?: string | null) =>
    u ? `${u}${u.includes('?') ? '&' : '?'}v=${encodeURIComponent(bust)}` : '';

  const hasVideo = Boolean((item as any)?.has_video) || Boolean((item as any)?.video_url);
  const hasPdf = Boolean((item as any)?.has_pdf) || Boolean((item as any)?.pdf_url);
  const isNotes = hasPdf && !hasVideo;

  const poster = withBust((item as any)?.thumbnail_url || null);
  const preview = withBust((item as any)?.preview_url || null);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !preview || isNotes) return;
    const t = window.setTimeout(() => {
      el.play().catch(() => {});
    }, 50);
    return () => window.clearTimeout(t);
  }, [preview, isNotes]);

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="block text-left rounded-xl ring-1 ring-[#e4ecf4] dark:ring-darkCard bg-white dark:bg-[#111b25] overflow-hidden hover:shadow-sm transition"
    >
      <div className="relative aspect-video bg-[#0b1220] overflow-hidden">
        {poster ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${poster})` }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#0b1220] to-[#111b25]" />
        )}

        {!isNotes && preview ? (
          <video
            key={preview}
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            src={preview}
            poster={poster || undefined}
            muted
            playsInline
            loop
            autoPlay
            preload="metadata"
          />
        ) : null}

        <div className="absolute bottom-2 left-2 text-[11px] px-2 py-0.5 rounded-full bg-black/60 text-white">
          {isNotes ? 'Notes' : preview ? 'Preview' : 'Preview unavailable'}
        </div>
      </div>

      <div className="p-3">
        <p className="text-sm font-semibold line-clamp-2 text-[#0d141c] dark:text-darkTextPrimary">
          {item.title}
        </p>
        <p className="text-xs text-[#49739c] dark:text-darkTextSecondary mt-1">
          {item.subject || (item as any)?.grade_level || 'ClassVault'}
        </p>
      </div>
    </button>
  );
};

/* ----------------------------- Course cards ------------------------------ */
/**
 * ✅ Updated:
 * - responsive media height for better “fit”
 * - consistent content spacing
 * - keeps CourseHero but ensures it fills a true media container
 */
const CourseCard: React.FC<{ course: Course }> = ({ course }) => (
  <Link
    href={`/courses/${encodeURIComponent(String(course.id))}`}
    className="group rounded-xl ring-1 ring-[#e4ecf4] dark:ring-darkCard bg-white dark:bg-[#111b25] overflow-hidden hover:shadow-sm transition flex flex-col"
  >
    <div className="relative w-full h-36 sm:h-40 md:h-44 bg-[#0b1220] overflow-hidden">
      <CourseHero course={course} className="absolute inset-0 w-full h-full" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent pointer-events-none" />
    </div>

    <div className="p-3 flex-1 flex flex-col justify-between">
      <div>
        <p className="text-sm font-semibold line-clamp-2 text-[#0d141c] dark:text-darkTextPrimary">
          {course.title}
        </p>
        <p className="text-xs text-[#49739c] dark:text-darkTextSecondary mt-1">
          {course.subject || 'Course'}
        </p>
      </div>

      <div className="mt-3">
        <span className="inline-flex items-center justify-center rounded-lg h-9 px-4 bg-[#3d99f5] text-white text-sm font-semibold group-hover:brightness-110">
          View course
        </span>
      </div>
    </div>
  </Link>
);

const OerBookCard: React.FC<{ item: OerBookItem }> = ({ item }) => {
  const id = item.slug || item.id;
  return (
    <Link
      href={`/oer/${encodeURIComponent(String(id))}`}
      className="group rounded-xl ring-1 ring-[#e4ecf4] dark:ring-darkCard bg-white dark:bg-[#111b25] overflow-hidden hover:shadow-sm transition flex flex-col"
    >
      <div className="relative w-full h-40 sm:h-44 md:h-48 bg-[#0b1220] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${item.cover_url || ''})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
      </div>

      <div className="p-3 flex-1 flex flex-col justify-between">
        <div>
          <p className="text-sm font-semibold line-clamp-2 text-[#0d141c] dark:text-darkTextPrimary">
            {item.title}
          </p>
          <p className="text-xs text-[#49739c] dark:text-darkTextSecondary mt-1">Open resources</p>
        </div>

        <div className="mt-3">
          <span className="inline-flex items-center justify-center rounded-lg h-9 px-4 bg-[#3d99f5] text-white text-sm font-semibold group-hover:brightness-110">
            Open book
          </span>
        </div>
      </div>
    </Link>
  );
};

/* ------------------------- OER Video Collections -------------------------- */
type OerCollection = {
  id: string | number;
  slug?: string | number;
  title: string;
  description?: string | null;
  thumbnail_url?: string | null;
  items_count?: number | null;
  content_kind?: string | null; // 'video'
  provider?: string | null;
  [k: string]: any;
};

const getOerCollectionHref = (c: any) =>
  `/oer/collections/${encodeURIComponent(String(c?.slug ?? c?.id ?? ''))}`;

function useOerVideoCollections(backendUrl?: string, q?: string) {
  const [items, setItems] = useState<OerCollection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!backendUrl) return;

    const base = backendUrl.replace(/\/+$/, '');
    const ac = new AbortController();

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const url = `${base}/api/oer/collections?kind=video&limit=48${
          q?.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''
        }`;

        const res = await fetch(url, { signal: ac.signal });
        const data = res.ok ? await res.json().catch(() => []) : [];
        setItems(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        setError(e?.message || 'Failed to load OER collections');
      } finally {
        setLoading(false);
      }
    };

    void load();
    return () => ac.abort();
  }, [backendUrl, q]);

  return { items, loading, error };
}

const OerCollectionCard: React.FC<{ col: OerCollection }> = ({ col }) => {
  const href = getOerCollectionHref(col);
  const title = col?.title ?? 'Collection';
  const thumb = col?.thumbnail_url || '';
  const count = Number(col?.items_count ?? 0) || 0;

  return (
    <Link
      href={href}
      className="group block rounded-xl ring-1 ring-[#e4ecf4] dark:ring-darkCard bg-white dark:bg-[#111b25] overflow-hidden hover:shadow-sm transition"
    >
      <div className="relative aspect-video bg-black/60 overflow-hidden">
        {thumb ? (
          <img
            src={thumb}
            alt={title}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#0b1220] to-[#111b25]" />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

        <div className="absolute bottom-2 left-2 flex items-center gap-2">
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-black/60 text-white">
            Free Collection
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white">
            {count} item{count === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="p-3">
        <p className="text-sm font-semibold line-clamp-2 text-[#0d141c] dark:text-darkTextPrimary">
          {title}
        </p>
        <p className="text-xs text-[#49739c] dark:text-darkTextSecondary mt-1">
          Open in Collection Reader
        </p>

        <div className="mt-3">
          <span className="inline-flex items-center justify-center rounded-lg h-9 px-4 bg-[#3d99f5] text-white text-sm font-semibold group-hover:brightness-110">
            View Collection
          </span>
        </div>
      </div>
    </Link>
  );
};

/* ------------------------------ Purchase Modal --------------------------- */
const PurchaseModal: React.FC<{
  open: boolean;
  item: RecordedVideo | null;
  busy: boolean;
  error: string | null;
  tokenBalance: number;
  onClose: () => void;
  onPurchase: () => void;
  onBuyTokens: () => void;
}> = ({ open, item, busy, error, tokenBalance, onClose, onPurchase, onBuyTokens }) => {
  if (!open) return null;

  const price = Number((item as any)?.price ?? 0) || 0;
  const hasVideo = Boolean((item as any)?.has_video) || Boolean((item as any)?.video_url);
  const hasPdf = Boolean((item as any)?.has_pdf) || Boolean((item as any)?.pdf_url);
  const isNotes = hasPdf && !hasVideo;

  const insufficient = Boolean(error && String(error).toLowerCase().includes('insufficient'));

  return (
    <div
      className="fixed inset-0 z-[999] bg-black/55 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#0f1821] ring-1 ring-[#e4ecf4] dark:ring-darkCard overflow-hidden">
        <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-[#e4ecf4] dark:border-white/10 flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-extrabold text-[#0d141c] dark:text-white">
              Confirm purchase
            </p>
            <p className="text-xs text-[#49739c] dark:text-darkTextSecondary mt-1">
              You’re about to unlock this item using tokens.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-full bg-[#e7edf4] dark:bg-[#172534] text-[#0d141c] dark:text-white flex items-center justify-center hover:brightness-105"
            aria-label="Close"
            disabled={busy}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="px-4 sm:px-5 py-4">
          <p className="text-sm font-semibold text-[#0d141c] dark:text-white line-clamp-2">
            {item?.title ?? 'Item'}
          </p>

          <div className="mt-2">
            <p className="text-xs text-[#49739c] dark:text-darkTextSecondary">
              Type: {isNotes ? 'Notes' : 'Video'}
            </p>
            <p className="text-xs text-[#49739c] dark:text-darkTextSecondary mt-1">
              Subject: {(item as any)?.subject || 'ClassVault'}
              {(item as any)?.grade_level != null ? ` • Grade ${(item as any).grade_level}` : ''}
            </p>
          </div>

          <div className="mt-4 rounded-xl bg-[#f6f9fc] dark:bg-white/5 ring-1 ring-[#e4ecf4] dark:ring-white/10 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#49739c] dark:text-darkTextSecondary">Cost</span>
              <span className="text-sm font-extrabold text-[#0d141c] dark:text-white">
                {price} tokens
              </span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-[#49739c] dark:text-darkTextSecondary">Your balance</span>
              <span className="text-sm font-semibold text-[#0d141c] dark:text-white">
                {tokenBalance} tokens
              </span>
            </div>

            <p className="text-[11px] text-[#49739c] dark:text-darkTextSecondary mt-3">
              After purchase, this item will be available in your purchased library.
            </p>
          </div>

          {error ? <p className="text-xs text-red-600 dark:text-red-400 mt-3">{error}</p> : null}
        </div>

        <div className="px-4 sm:px-5 pb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-10 px-4 rounded-full bg-white dark:bg-transparent ring-1 ring-[#e4ecf4] dark:ring-white/10 text-sm font-semibold text-[#0d141c] dark:text-white disabled:opacity-60"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {insufficient ? (
              <button
                type="button"
                onClick={onBuyTokens}
                className="h-10 px-4 rounded-full bg-[#0d141c] dark:bg-white text-white dark:text-[#0d141c] text-sm font-semibold hover:brightness-110"
              >
                Buy tokens
              </button>
            ) : null}

            <button
              type="button"
              onClick={onPurchase}
              disabled={busy || !item}
              className="h-10 px-5 rounded-full bg-[#3d99f5] text-white text-sm font-extrabold disabled:opacity-60 hover:brightness-110"
            >
              {busy ? 'Purchasing…' : 'Purchase'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------ Page ------------------------------------- */
const ResourcesPage: React.FC = () => {
  const router = useRouter();
  const params = useSearchParams();
  const MIN_QUERY_LEN = 4;

  const initialTab = (params.get('tab') || '').toLowerCase() === 'videos' ? 'videos' : 'courses';

  const [tab, setTab] = useState<'videos' | 'courses'>(initialTab);
  const [query, setQuery] = useState<string>(params.get('q') ?? '');
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  const [mediaTab, setMediaTab] = useState<'all' | 'videos' | 'notes'>('all');

const isNotesOnly = useCallback((it: any) => {
  const hasPdf = Boolean(it?.has_pdf) || Boolean(it?.pdf_url);
  const hasVideo = Boolean(it?.has_video) || Boolean(it?.video_url) || Boolean(it?.preview_url);
  return hasPdf && !hasVideo;
}, []);


  // ✅ filter state
  const [appliedFilters, setAppliedFilters] = useState<ResourceFilters>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<ResourceFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeFilterCount = useMemo(() => countActiveFilters(appliedFilters), [appliedFilters]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
  if (tab !== 'videos') setMediaTab('all');
}, [tab]);


  const trimmedQuery = query.trim();
  const queryActive = trimmedQuery.length >= MIN_QUERY_LEN;
  const effectiveQuery = queryActive ? debouncedQuery.trim() : '';

  // Shared hook for marketplace, courses, books, etc.
  const explore = useResourcesExplore(effectiveQuery, tab, appliedFilters as any);

  const classVaultRaw = useMemo(
  () => (explore.classVault.items || []) as any[],
  [explore.classVault.items]
);

const classVaultFiltered = useMemo(() => {
  if (tab !== 'videos') return classVaultRaw;
  if (mediaTab === 'all') return classVaultRaw;
  if (mediaTab === 'notes') return classVaultRaw.filter((x) => isNotesOnly(x));
  return classVaultRaw.filter((x) => !isNotesOnly(x));
}, [tab, mediaTab, classVaultRaw, isNotesOnly]);


  // Backend URL for OER collections fetch (HomePage-style)
  const { backendUrl } = useShopContext();
  const oerVideoCollections = useOerVideoCollections(backendUrl, effectiveQuery);

  // ✅ ClassVault purchase support (same pattern as native)
  const { purchasedIds, purchase } = useClassVault('', ''); // no filters; just need purchasedIds + purchase()

  const shop: any = useShopContext() as any;
  const tokenBalance =
    Number(shop?.tokens ?? shop?.tokenBalance ?? shop?.balanceTokens ?? shop?.token_count ?? 0) || 0;

  const [payOpen, setPayOpen] = useState(false);
  const [payItem, setPayItem] = useState<RecordedVideo | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const [openPayment, setOpenPayment] = useState(false);
  const goToBuyTokens = useCallback(() => {
    setOpenPayment(true);
  }, []);

  const openPay = useCallback((item: RecordedVideo) => {
    setPayError(null);
    setPayItem(item);
    setPayOpen(true);
  }, []);

  const closePay = useCallback(() => {
    setPayOpen(false);
    setPayItem(null);
    setPayBusy(false);
    setPayError(null);
  }, []);

  const doPurchase = useCallback(async () => {
    if (!payItem || payBusy) return;

    setPayBusy(true);
    setPayError(null);

    try {
      await purchase(payItem);
      const id = Number((payItem as any).id);
      closePay();
      router.push(`/class-vault/${encodeURIComponent(String(id))}`);
    } catch (err: any) {
      const msg =
        (typeof err?.message === 'string' && err.message) || 'Purchase failed. Please try again.';
      setPayError(msg);
    } finally {
      setPayBusy(false);
    }
  }, [payItem, payBusy, purchase, closePay, navigate]);

  const onBuyTokens = useCallback(() => {
    closePay();
    goToBuyTokens();
  }, [closePay, goToBuyTokens]);

  const handlePaymentClose = useCallback(() => {
    setOpenPayment(false);
  }, []);

  const onOpenClassVault = useCallback(
    (item: RecordedVideo) => {
      const id = Number((item as any).id);
      const price = Number((item as any).price ?? 0) || 0;

      // Free or already purchased -> open directly
      if (price <= 0 || purchasedIds?.has?.(id)) {
        router.push(`/class-vault/${encodeURIComponent(String(id))}`);
        return;
      }

      // Otherwise confirm purchase
      openPay(item);
    },
    [navigate, openPay, purchasedIds],
  );

  const headerCopy = useMemo(
    () =>
      tab === 'videos'
        ? 'Discover ClassVault marketplace items and free OER video collections.'
        : 'Browse tutor-led courses and free OER books.',
    [tab],
  );

  const isPurchasedCoursesScope = appliedFilters.scope === 'purchased' && tab === 'courses';

  const clearAll = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    setAppliedFilters(DEFAULT_FILTERS);
    setDraftFilters(DEFAULT_FILTERS);
  }, []);

  // ✅ NEW: responsive grid for Courses + OER books
  // - mobile: 2 per row
  // - tablet: 3 per row
  // - desktop: 4 per row
  const gridCards = 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3';

  return (
    <div
      className="relative min-h-screen flex flex-col bg-slate-50 dark:bg-darkBg text-[#0d141c] dark:text-darkTextPrimary overflow-x-hidden"
      style={{ fontFamily: 'Manrope, "Noto Sans", sans-serif' }}
    >
      <main className="flex-1">
        <div className="mx-auto w-full max-w-screen-xl lg:max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
          <div className="flex flex-col gap-2">
            <h1 className="tracking-tight text-[28px] sm:text-[32px] font-bold">Explore</h1>
            <p className="text-sm text-[#49739c] dark:text-darkTextSecondary">
              <span>{headerCopy}</span>
              <span className="mx-1 text-[#8aa0b8] dark:text-darkTextSecondary">•</span>
              <Link
                href="/verify"
                aria-label="Verify a course certificate"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#5e738f] dark:text-darkTextSecondary hover:text-[#3d99f5] transition"
              >
                <FontAwesomeIcon icon={faCertificate} className="text-[10px]" />
                <span>Verify a certificate</span>
              </Link>
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {/* ✅ Search row + Filters + Clear */}
            <div className="flex gap-2 items-center">
              <label className="flex h-12 w-full">
                <div className="flex w-full items-stretch rounded-xl ring-1 ring-[#e7edf4] dark:ring-darkCard bg-[#e7edf4] dark:bg-[#172534] focus-within:ring-primary transition">
                  <div className="text-[#49739c] dark:text-darkTextSecondary flex items-center justify-center pl-4">
                    <FontAwesomeIcon icon={faMagnifyingGlass} />
                  </div>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search videos, notes, collections, or courses"
                    className="w-full bg-transparent h-full px-4 outline-none placeholder:text-[#49739c] dark:placeholder:text-darkTextSecondary"
                  />
                </div>
              </label>

              <button
                type="button"
                onClick={() => {
                  setDraftFilters(appliedFilters);
                  setFiltersOpen(true);
                }}
                className="h-12 px-4 rounded-xl ring-1 ring-[#e7edf4] dark:ring-darkCard bg-white dark:bg-[#0f1821] hover:brightness-105 flex items-center gap-2"
              >
                <span className="text-sm font-semibold">Filters</span>
                {activeFilterCount > 0 ? (
                  <span className="min-w-[22px] h-[22px] px-2 rounded-full bg-[#3d99f5] text-white text-xs font-extrabold flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>

              <button
                type="button"
                onClick={clearAll}
                className="h-12 px-4 rounded-xl ring-1 ring-[#e7edf4] dark:ring-darkCard bg-[#f6f9fc] dark:bg-[#172534] hover:brightness-105 text-sm font-semibold"
              >
                Clear
              </button>
            </div>

            <Tabs value={tab} onChange={setTab} />
          </div>

          {tab === 'videos' ? (
            <div className="space-y-6">
              {/* ClassVault marketplace */}
              <section className="rounded-2xl bg-white dark:bg-[#0f1821] ring-1 ring-[#e4ecf4] dark:ring-darkCard p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">ClassVault marketplace</h2>
                    <p className="text-xs text-[#49739c] dark:text-darkTextSecondary mt-1">
                      {mediaTab === 'notes'
                        ? 'Notes only (PDFs) from tutors.'
                        : mediaTab === 'videos'
                        ? 'Video lessons only from tutors (with previews).'
                        : 'Discover videos and notes from tutors (with previews).'}
                    </p>

                    <MiniMediaTabs value={mediaTab} onChange={setMediaTab} />

                  </div>

                  <div className="flex items-center gap-2">
                    <div className="hidden sm:flex items-center gap-2 rounded-full bg-[#f6f9fc] dark:bg-white/5 ring-1 ring-[#e4ecf4] dark:ring-white/10 px-3 h-9">
                      <span className="text-xs text-[#49739c] dark:text-darkTextSecondary">
                        Balance
                      </span>
                      <span className="text-sm font-extrabold text-[#0d141c] dark:text-white">
                        {tokenBalance}
                      </span>
                      <span className="text-xs text-[#49739c] dark:text-darkTextSecondary">
                        tokens
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={goToBuyTokens}
                      className="h-9 px-4 rounded-full bg-[#0d141c] dark:bg-white text-white dark:text-[#0d141c] text-sm font-semibold hover:brightness-110"
                    >
                      Buy tokens
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  {explore.classVault.loading && explore.classVault.items.length === 0 ? (
                    <p className="text-sm text-[#5e738f] dark:text-darkTextSecondary">Loading…</p>
                  ) : explore.classVault.error ? (
                    <p className="text-sm text-red-600">{explore.classVault.error}</p>
                  ) : classVaultFiltered.length === 0 ? (
                        <EmptyState
                          message={
                            mediaTab === 'notes'
                              ? 'No notes found yet.'
                              : mediaTab === 'videos'
                              ? 'No videos found yet.'
                              : 'No ClassVault results yet.'
                          }
                        />
                      )
                      : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {classVaultFiltered.map((item) => (
                          <ClassVaultCard
                            key={String((item as any)?.id)}
                            item={item as any}
                            onOpen={onOpenClassVault}
                          />
                        ))}

                    </div>
                  )}

                  {explore.classVault.hasMore && (
                    <LoadMoreButton
                      onClick={explore.classVault.loadMore}
                      disabled={explore.classVault.loading}
                    />
                  )}
                </div>
              </section>

              {/* Free OER video collections (NOT individual videos) */}
              <section className="rounded-2xl bg-white dark:bg-[#0f1821] ring-1 ring-[#e4ecf4] dark:ring-darkCard p-4 sm:p-5">
                <h2 className="text-lg font-semibold">Free OER video collections</h2>
                <p className="text-xs text-[#49739c] dark:text-darkTextSecondary mt-1">
                  Curated playlists you can open in the Collection Reader.
                </p>

                <div className="mt-4">
                  {oerVideoCollections.loading && oerVideoCollections.items.length === 0 ? (
                    <p className="text-sm text-[#5e738f] dark:text-darkTextSecondary">Loading…</p>
                  ) : oerVideoCollections.error ? (
                    <p className="text-sm text-red-600">{oerVideoCollections.error}</p>
                  ) : oerVideoCollections.items.length === 0 ? (
                    <EmptyState message="No OER video collections match that search." />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {oerVideoCollections.items.slice(0, 12).map((col) => (
                        <OerCollectionCard key={String(col.slug ?? col.id)} col={col} />
                      ))}
                    </div>
                  )}

                  {oerVideoCollections.items.length > 12 && (
                    <div className="pt-3">
                      <Link
                        href="/oer/collections"
                        className="inline-flex items-center justify-center rounded-full h-10 px-5 bg-[#e7edf4] dark:bg-[#172534] text-sm font-semibold hover:brightness-105"
                      >
                        Browse all collections
                      </Link>
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Courses */}
              <section className="rounded-2xl bg-white dark:bg-[#0f1821] ring-1 ring-[#e4ecf4] dark:ring-darkCard p-4 sm:p-5">
                <h2 className="text-lg font-semibold">Courses</h2>
                <p className="text-xs text-[#49739c] dark:text-darkTextSecondary mt-1">
                  Explore tutor-led courses available to enroll.
                </p>

                <div className="mt-4">
                  {explore.normalCourses.loading && explore.normalCourses.items.length === 0 ? (
                    <p className="text-sm text-[#5e738f] dark:text-darkTextSecondary">Loading…</p>
                  ) : explore.normalCourses.error ? (
                    <p className="text-sm text-red-600">{explore.normalCourses.error}</p>
                  ) : isPurchasedCoursesScope ? (
                    <EmptyState message="Purchased scope applies to videos only." />
                  ) : explore.normalCourses.items.length === 0 ? (
                    <EmptyState message="No courses found yet." />
                  ) : (
                    <div className={gridCards}>
                      {explore.normalCourses.items.map((course) => (
                        <CourseCard key={String((course as any)?.id)} course={course as any} />
                      ))}
                    </div>
                  )}

                  {explore.normalCourses.hasMore && (
                    <LoadMoreButton
                      onClick={explore.normalCourses.loadMore}
                      disabled={explore.normalCourses.loading}
                    />
                  )}
                </div>
              </section>

              {/* Free OER books */}
              <section className="rounded-2xl bg-white dark:bg-[#0f1821] ring-1 ring-[#e4ecf4] dark:ring-darkCard p-4 sm:p-5">
                <h2 className="text-lg font-semibold">Free OER books</h2>
                <p className="text-xs text-[#49739c] dark:text-darkTextSecondary mt-1">
                  OpenStax and other openly licensed books.
                </p>

                <div className="mt-4">
                  {explore.oerBooks.loading && explore.oerBooks.items.length === 0 ? (
                    <p className="text-sm text-[#5e738f] dark:text-darkTextSecondary">Loading…</p>
                  ) : explore.oerBooks.error ? (
                    <p className="text-sm text-red-600">{explore.oerBooks.error}</p>
                  ) : isPurchasedCoursesScope ? (
                    <EmptyState message="Purchased scope applies to videos only." />
                  ) : explore.oerBooks.items.length === 0 ? (
                    <EmptyState message="No OER books match that search." />
                  ) : (
                    <div className={gridCards}>
                      {explore.oerBooks.items.map((item) => (
                        <OerBookCard
                          key={String((item as any)?.slug || (item as any)?.id)}
                          item={item as any}
                        />
                      ))}
                    </div>
                  )}

                  {explore.oerBooks.hasMore && (
                    <LoadMoreButton
                      onClick={explore.oerBooks.loadMore}
                      disabled={explore.oerBooks.loading}
                    />
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </main>

      {/* ✅ Filter modal */}
      <FilterModal
        open={filtersOpen}
        value={draftFilters}
        onChange={setDraftFilters}
        onClose={() => setFiltersOpen(false)}
        onApply={() => {
          setAppliedFilters(draftFilters);
          setFiltersOpen(false);
        }}
        onReset={() => setDraftFilters(DEFAULT_FILTERS)}
      />

      {/* ✅ Purchase modal (web) */}
      <PurchaseModal
        open={payOpen}
        item={payItem}
        busy={payBusy}
        error={payError}
        tokenBalance={tokenBalance}
        onClose={closePay}
        onPurchase={doPurchase}
        onBuyTokens={onBuyTokens}
      />

      <PaymentWidget
        isOpen={openPayment}
        onClose={handlePaymentClose}
        title="Top up your tokens"
        showTutorPreview={false}
      />
    </div>
  );
};

export default ResourcesPage;
