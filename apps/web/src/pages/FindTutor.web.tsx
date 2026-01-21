// FindTutor.web.tsx

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconProp } from '@fortawesome/fontawesome-svg-core';
import {
  faMagnifyingGlass,
  faChevronLeft,
  faChevronRight,
  faCheckCircle,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';

import { useHomePage } from '@mytutorapp/shared/hooks';
import type { Profile, TutorFilters } from '@mytutorapp/shared/types';
import { DEFAULT_TUTOR_FILTERS } from '@mytutorapp/shared/types';
import { countryName } from '@mytutorapp/shared/utils/countries';
import { normalizeCountryLabel } from '@mytutorapp/shared/utils/smartSearchIntent';

const FALLBACK_AVATAR = (name = 'Tutor') =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=e7edf4&color=0d141c`;

const PER_PAGE = 20;

/* utils */
const getRating = (p: any) => Number(p?.avgRating ?? p?.rating ?? 0);

const getTokens = (p: any) => {
  const x =
    p?.pricing?.tokens ??
    p?.pricing?.tokenPrice ??
    p?.pricing?.tokensPerHour ??
    p?.pricing?.hourlyTokens ??
    p?.pricing?.privateSessionTokens ??
    p?.pricing?.groupSessionTokens;

  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
};

const normalizeStatus = (s: any) => {
  const v = String(s || '')
    .trim()
    .toLowerCase();
  if (!v) return '';
  if (v === 'online') return 'Online';
  if (v === 'offline') return 'Offline';
  if (v === 'busy') return 'Busy';
  if (v === 'free' || v === 'free session' || v === 'free_session') return 'Free Session';
  if (v === 'new') return 'New';
  return String(s || '').trim();
};

const statusColorClass = (status: string) =>
  status === 'Online'
    ? 'bg-green-500'
    : status === 'Busy'
      ? 'bg-yellow-500'
      : status === 'Free Session'
        ? 'bg-purple-500'
        : status === 'New'
          ? 'bg-sky-500'
          : status === 'Offline'
            ? 'bg-gray-500'
            : 'bg-gray-500';

/**
 * "New" heuristic (super simple):
 * - If backend adds is_new boolean, it will use it.
 * - Else if created_at exists, it treats <= 7 days as New.
 */
const isNewTutor = (p: any) => {
  if (p?.is_new === true) return true;

  const created = p?.created_at || p?.createdAt;
  if (!created) return false;

  const t = new Date(created).getTime();
  if (!Number.isFinite(t)) return false;

  const days = (Date.now() - t) / (1000 * 60 * 60 * 24);
  return days <= 7;
};

const getDescriptionText = (p: any): string => {
  const d = p?.description;
  if (typeof d === 'string') {
    try {
      const asObj = JSON.parse(d);
      if (asObj && typeof asObj === 'object' && typeof (asObj as any).bio === 'string') {
        return (asObj as any).bio;
      }
    } catch {
      /* ignore */
    }
    return d;
  }
  if (d && typeof d === 'object') {
    const bio = (d as any).bio ?? (d as any).overview ?? (d as any).summary;
    if (bio) return String(bio);
  }
  return '';
};

const countActiveTutorFilters = (filters: TutorFilters) => {
  let count = 0;
  if (filters.subject) count += 1;
  if (filters.gradeBand) count += 1;
  if (filters.country) count += 1;
  if (filters.minRating > 0) count += 1;
  return count;
};

const FilterModal = ({
  open,
  onClose,
  onApply,
  filters,
  onChange,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  onApply: () => void;
  filters: TutorFilters;
  onChange: (next: Partial<TutorFilters>) => void;
  onReset: () => void;
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="w-full max-w-[520px] rounded-2xl bg-white dark:bg-[#0f1821] ring-1 ring-[#e4ecf4] dark:ring-darkCard shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e4ecf4] dark:border-white/10">
          <p className="text-base font-extrabold text-[#0d141c] dark:text-white">Filters</p>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-full bg-[#e7edf4] dark:bg-[#172534] text-[#49739c] dark:text-darkTextSecondary flex items-center justify-center"
          >
            <FontAwesomeIcon icon={faXmark as IconProp} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <label className="block text-sm font-semibold text-[#0d141c] dark:text-white">
            Subject
            <input
              value={filters.subject}
              onChange={(e) => onChange({ subject: e.target.value })}
              placeholder="Math, English…"
              className="mt-2 w-full h-11 px-3 rounded-xl bg-[#f6f9fc] dark:bg-[#172534] ring-1 ring-[#e7edf4] dark:ring-darkCard outline-none"
            />
          </label>

          <label className="block text-sm font-semibold text-[#0d141c] dark:text-white">
            Grade band
            <input
              value={filters.gradeBand}
              onChange={(e) => onChange({ gradeBand: e.target.value })}
              placeholder="Primary, Secondary…"
              className="mt-2 w-full h-11 px-3 rounded-xl bg-[#f6f9fc] dark:bg-[#172534] ring-1 ring-[#e7edf4] dark:ring-darkCard outline-none"
            />
          </label>

          <label className="block text-sm font-semibold text-[#0d141c] dark:text-white">
            Country (ISO2)
            <input
              value={filters.country}
              onChange={(e) => onChange({ country: e.target.value })}
              placeholder="ke, qa…"
              className="mt-2 w-full h-11 px-3 rounded-xl bg-[#f6f9fc] dark:bg-[#172534] ring-1 ring-[#e7edf4] dark:ring-darkCard outline-none uppercase"
            />
          </label>

          <label className="block text-sm font-semibold text-[#0d141c] dark:text-white">
            Min rating
            <div className="mt-2 flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="5"
                step="0.5"
                value={filters.minRating}
                onChange={(e) => onChange({ minRating: Number(e.target.value) })}
                className="w-full accent-[#3d99f5]"
              />
              <span className="min-w-[52px] text-sm font-semibold text-[#0d141c] dark:text-white">
                {filters.minRating ? `${filters.minRating}★` : 'Any'}
              </span>
            </div>
          </label>
        </div>

        <div className="px-5 pb-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onReset}
            className="h-10 px-4 rounded-full bg-white dark:bg-transparent ring-1 ring-[#e4ecf4] dark:ring-white/10 text-sm font-semibold text-[#0d141c] dark:text-white"
          >
            Reset
          </button>

          <button
            type="button"
            onClick={onApply}
            className="h-10 px-5 rounded-full bg-[#3d99f5] text-white text-sm font-extrabold"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

const resolveImage = (p: any, backendUrl?: string, fallbackName?: string) => {
  const g0 = Array.isArray(p?.gallery) ? p.gallery[0] : undefined;
  if (typeof g0 === 'string' && g0.length > 0) {
    if (g0.startsWith('http://') || g0.startsWith('https://')) return g0;
    if (g0.startsWith('/') && backendUrl) return `${backendUrl.replace(/\/+$/, '')}${g0}`;
  }
  return FALLBACK_AVATAR(fallbackName ?? p?.name ?? 'Tutor');
};

const FindTutor: React.FC = () => {
  const location = useLocation();
  const MIN_QUERY_LEN = 4;
  const {
    filteredProfiles, // ✅ already server-filtered by q/subject/country/minRating/maxPrice
    loading,
    handleSearch, // ✅ triggers server search (debounced inside hook)
    uiFilters,
    setSubjectFilter,
    setCountryFilter,
    setMinRatingFilter,
    setGradeBandFilter,
    clearFilters,
    searchMeta,
  } = useHomePage({ debounceMs: 0 });

  const backendUrl = import.meta.env.VITE_BACKEND_URL as string | undefined;

  // local-only UI state (NOT sent to server)
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [draftFilters, setDraftFilters] = useState<TutorFilters>(DEFAULT_TUTOR_FILTERS);

  const activeFilterCount = useMemo(() => countActiveTutorFilters(uiFilters), [uiFilters]);

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const q = sp.get('q') ?? '';
    const subject = sp.get('subject') ?? '';
    const gradeBand = sp.get('gradeBand') ?? '';
    const countryParam = sp.get('country') ?? '';
    const minRatingParam = sp.get('minRating') ?? '';

    setQuery(q);
    setDebouncedQuery(q);
    if (q && q.trim().length >= MIN_QUERY_LEN) {
      handleSearch?.(q);
    }
    if (subject) setSubjectFilter(subject);
    if (gradeBand) setGradeBandFilter(gradeBand);

    if (countryParam) {
      const normalized = normalizeCountryLabel(countryParam);
      if (normalized?.code) setCountryFilter(normalized.code);
    }

    if (minRatingParam) {
      const val = Number(minRatingParam);
      if (Number.isFinite(val)) setMinRatingFilter(val);
    }
  }, [
    location.search,
    handleSearch,
    setCountryFilter,
    setMinRatingFilter,
    setSubjectFilter,
    setGradeBandFilter,
  ]);

  // Tutors already filtered by server
  const tutors = useMemo(
    () =>
      filteredProfiles.filter(
        (p) => String((p as any).role || '').toLowerCase() === 'tutor'
      ) as Profile[],
    [filteredProfiles]
  );

  // pagination (client-side paging of current server result set)
  const totalPages = Math.max(1, Math.ceil(tutors.length / PER_PAGE));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = tutors.slice((pageSafe - 1) * PER_PAGE, pageSafe * PER_PAGE);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    const queryActive = trimmed.length >= MIN_QUERY_LEN;
    const effectiveQuery = queryActive ? trimmed : '';
    handleSearch?.(effectiveQuery);
  }, [debouncedQuery, handleSearch]);

  const onResetFilters = useCallback(() => {
    setDraftFilters(DEFAULT_TUTOR_FILTERS);
  }, []);

  const onClearAll = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    clearFilters();
    setDraftFilters(DEFAULT_TUTOR_FILTERS);
    setPage(1);
  }, [clearFilters]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-slate-50 dark:bg-darkBg text-[#0d141c] dark:text-darkTextPrimary">
        Loading tutors…
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen flex flex-col bg-slate-50 dark:bg-darkBg text-[#0d141c] dark:text-darkTextPrimary overflow-x-hidden"
      style={{ fontFamily: `Manrope, "Noto Sans", sans-serif` }}
    >
      <main className="flex-1 flex justify-center py-5 px-4 lg:px-10">
        <div className="flex flex-col w-full max-w-[960px]">
          {/* Header */}
          <section className="px-4">
            <div className="flex flex-wrap justify-between gap-3">
              <div className="flex min-w-72 flex-col gap-3">
                <h1 className="text-[32px] font-bold leading-tight">Find a tutor</h1>
                <p className="text-[#49739c] dark:text-darkTextSecondary text-sm">
                  Explore our community of expert tutors ready to help you achieve your learning
                  goals.
                </p>

                {/* Optional debug chip (safe to remove) */}
                {searchMeta?.aiUsed != null && (
                  <p className="text-xs text-[#49739c] dark:text-darkTextSecondary">
                    Search: {searchMeta.aiUsed ? 'AI' : 'Direct'} •{' '}
                    {searchMeta.rows ?? tutors.length} results
                  </p>
                )}
              </div>

              <div className="flex items-end" />
            </div>

            {/* Search row + Filters + Clear */}
            <div className="mt-3 flex gap-2 items-center">
              <label className="flex h-12 w-full">
                <div className="flex w-full items-stretch rounded-xl ring-1 ring-[#e7edf4] dark:ring-darkCard bg-[#e7edf4] dark:bg-[#172534] focus-within:ring-primary transition">
                  <div className="text-[#49739c] dark:text-darkTextSecondary flex items-center justify-center pl-4">
                    <FontAwesomeIcon icon={faMagnifyingGlass as IconProp} />
                  </div>
                  <input
                    placeholder='Search e.g. "Kenya math tutor", "Grade 3", "certified english"'
                    className="w-full bg-transparent h-full px-4 outline-none placeholder:text-[#49739c] dark:placeholder:text-darkTextSecondary"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
              </label>

              <button
                type="button"
                onClick={() => {
                  setDraftFilters(uiFilters);
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
                onClick={onClearAll}
                className="h-12 px-4 rounded-xl ring-1 ring-[#e7edf4] dark:ring-darkCard bg-[#f6f9fc] dark:bg-[#172534] hover:brightness-105 text-sm font-semibold"
              >
                Clear
              </button>
            </div>
          </section>

          {/* Results header */}
          <h2 className="text-[22px] font-bold tracking-tight px-4 pb-3 pt-5">Tutors</h2>

          {/* Results */}
          <div className="p-4 space-y-4">
            {pageItems.length === 0 && (
              <p className="text-[#49739c] dark:text-darkTextSecondary px-1">
                No tutors match your filters.
              </p>
            )}

            {pageItems.map((t: any) => {
              const rating = getRating(t);
              const tokens = getTokens(t);
              const img = resolveImage(t, backendUrl, t?.name);
              const sub = t?.category ?? 'Subject';
              const status = normalizeStatus(t?.status);
              const chipClass = statusColorClass(status);
              const showNew = isNewTutor(t);
              const showCertified = Boolean(t?.certified);

              const bioRaw = getDescriptionText(t);
              const desc = bioRaw ? String(bioRaw).slice(0, 140) : '';

              return (
                <div
                  key={t?.user_id ?? t?.id ?? t?.name}
                  className="flex flex-col md:flex-row items-stretch justify-between gap-4 rounded-xl"
                >
                  <div className="flex flex-col gap-1 flex-[2_2_0px]">
                    <p className="text-darkText dark:text-darkTextPrimary text-sm font-medium">
                      {sub}
                    </p>

                    <div className="flex items-center gap-2">
                      {/* status dot */}
                      {(() => {
                        const status = normalizeStatus(t?.status);
                        return status ? (
                          <span
                            className={`inline-block size-2 rounded-full ${statusColorClass(status)}`}
                            title={status}
                          />
                        ) : null;
                      })()}

                      <Link
                        to={`/profile/${t?.user_id ?? t?.id}`}
                        className="text-base font-bold leading-tight text-darkText dark:text-darkTextPrimary hover:underline"
                      >
                        {t?.name ?? 'Tutor'}
                      </Link>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-sm text-darkText dark:text-darkTextPrimary">
                      {(() => {
                        const parts: string[] = [];
                        parts.push(rating ? `${rating.toFixed(1)}★` : 'No rating');
                        if (typeof tokens === 'number') parts.push(`${tokens} tokens`);
                        if (Array.isArray(t?.languages) && t.languages.length > 0) {
                          const langs = t.languages.slice(0, 3).join(', ');
                          const more = t.languages.length > 3 ? '…' : '';
                          parts.push(`Languages: ${langs}${more}`);
                        }
                        if (t?.country) parts.push(countryName(t.country) || String(t.country));

                        return parts.map((txt, i) => (
                          <React.Fragment key={i}>
                            {i > 0 && <span>•</span>}
                            <span className="font-semibold">{txt}</span>
                          </React.Fragment>
                        ));
                      })()}
                    </div>

                    {desc && (
                      <p className="text-darkText dark:text-darkTextPrimary text-sm mt-1">{desc}</p>
                    )}
                  </div>

                  <Link
                    to={`/profile/${t?.user_id ?? t?.id}`}
                    className="w-full md:flex-1 rounded-xl overflow-hidden ring-1 ring-[#e7edf4] dark:ring-darkCard relative"
                  >
                    <div
                      className="w-full bg-center bg-no-repeat aspect-video bg-cover"
                      style={{ backgroundImage: `url("${img}")` }}
                    />

                    {/* ✅ Status chip (same feel as ProfileDetailPage) */}
                    {(status || showNew || showCertified) && (
                      <div className="absolute top-3 left-3 flex items-center gap-2">
                        {showCertified && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full text-white bg-emerald-600 shadow">
                          <FontAwesomeIcon icon={faCheckCircle as IconProp} />
                          <span className="hidden lg:inline">Certified</span>
                        </span>
                      )}

                        {status ? (
                          <span
                            className={`inline-block px-3 py-1 text-xs rounded-full text-white ${chipClass} shadow`}
                          >
                            {status}
                          </span>
                        ) : null}

                        {/* ✅ New badge (if New, we show it even if status is something else) */}
                        {showNew && status !== 'New' && (
                          <span className="inline-block px-3 py-1 text-xs rounded-full text-white bg-sky-500 shadow">
                            New
                          </span>
                        )}
                      </div>
                    )}

                    {/* ✅ subtle gradient for readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/10 pointer-events-none" />
                  </Link>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center p-4 gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="flex size-10 items-center justify-center rounded-full hover:bg-[#e7edf4] dark:hover:bg-[#172534]"
                aria-label="Previous page"
              >
                <FontAwesomeIcon icon={faChevronLeft as IconProp} />
              </button>

              {Array.from({ length: totalPages }).map((_, i) => {
                const n = i + 1;
                const active = n === pageSafe;
                return (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={
                      'flex size-10 items-center justify-center rounded-full text-sm ' +
                      (active ? 'font-bold bg-[#e7edf4] dark:bg-[#172534]' : 'font-normal')
                    }
                    aria-current={active ? 'page' : undefined}
                  >
                    {n}
                  </button>
                );
              })}

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="flex size-10 items-center justify-center rounded-full hover:bg-[#e7edf4] dark:hover:bg-[#172534]"
                aria-label="Next page"
              >
                <FontAwesomeIcon icon={faChevronRight as IconProp} />
              </button>
            </div>
          )}
        </div>
      </main>

      <FilterModal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={draftFilters}
        onChange={(next) => setDraftFilters((prev) => ({ ...prev, ...next }))}
        onReset={onResetFilters}
        onApply={() => {
          setSubjectFilter(draftFilters.subject || '');
          setGradeBandFilter(draftFilters.gradeBand || '');
          setCountryFilter(draftFilters.country || '');
          setMinRatingFilter(Number(draftFilters.minRating || 0));
          setPage(1);
          setFiltersOpen(false);
        }}
      />
    </div>
  );
};

export default FindTutor;
