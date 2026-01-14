// FindTutor.web.tsx

import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconProp } from '@fortawesome/fontawesome-svg-core';
import {
  faMagnifyingGlass,
  faChevronLeft,
  faChevronRight,
  faCheckCircle,
} from '@fortawesome/free-solid-svg-icons';

import { useHomePage } from '@mytutorapp/shared/hooks';
import type { Profile } from '@mytutorapp/shared/types';
import { COUNTRIES, countryName } from '@mytutorapp/shared/utils/countries';

const FALLBACK_AVATAR = (name = 'Tutor') =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=e7edf4&color=0d141c`;

const SUBJECTS = [
  'Math',
  'Science',
  'Programming',
  'Art',
  'Wellness',
  'Languages',
  'English',
  'History',
] as const;

const RATINGS = [5, 4.5, 4, 3.5, 3] as const;
const AVAILABILITY = ['Online', 'Offline', 'Busy', 'Free Session', 'New'] as const;
const LANGS_COMMON = ['English', 'Spanish', 'French', 'Arabic', 'Chinese', 'German'] as const;

const PER_PAGE = 20;

/* utils */
const normalizeStr = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v.toLowerCase().trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v).toLowerCase().trim();
  if (Array.isArray(v)) return v.map(normalizeStr).join(' ').trim();
  if (typeof v === 'object')
    return Object.values(v as any)
      .map(normalizeStr)
      .join(' ')
      .trim();
  return '';
};

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

const hasAvailability = (p: any, option: string) => {
  if (!option) return true;

  const opt = normalizeStatus(option);

  // Special: New
  if (opt === 'New') return isNewTutor(p);

  // Primary: status match
  const s = normalizeStatus(p?.status);
  if (s && s === opt) return true;

  // Optional: if you stored alternate status fields
  const s2 = normalizeStatus(p?.availability);
  if (s2 && s2 === opt) return true;

  return false;
};

const hasLanguage = (p: any, lang: string) => {
  if (!lang) return true;
  const list = p?.languages;
  if (Array.isArray(list)) {
    return list.map((x: any) => normalizeStr(String(x))).includes(normalizeStr(lang));
  }
  return true;
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
  const {
    filteredProfiles, // ✅ already server-filtered by q/subject/country/minRating/maxPrice
    loading,
    handleSearch, // ✅ triggers server search (debounced inside hook)
    uiFilters,
    setSubjectFilter,
    setCountryFilter,
    setMinRatingFilter,
    setMaxTokensFilter,
    clearFilters,
    searchMeta,
  } = useHomePage();

  const backendUrl = import.meta.env.VITE_BACKEND_URL as string | undefined;

  // local-only UI state (NOT sent to server)
  const [query, setQuery] = useState('');
  const [availability, setAvailability] = useState<string>(''); // local-only
  const [language, setLanguage] = useState<string>(''); // local-only
  const [page, setPage] = useState(1);
  const [live, setLive] = useState(false);

  // Tutors already filtered by server
  const tutors = useMemo(
    () =>
      filteredProfiles.filter(
        (p) => String((p as any).role || '').toLowerCase() === 'tutor'
      ) as Profile[],
    [filteredProfiles]
  );

  // languages from current result set (plus common)
  const languagesSet = useMemo(() => {
    const set = new Set<string>();
    LANGS_COMMON.forEach((l) => set.add(l));
    tutors.forEach((t: any) => {
      if (Array.isArray(t?.languages)) {
        t.languages.forEach((l: any) => {
          const s = String(l).trim();
          if (s) set.add(s);
        });
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [tutors]);

  // local-only filtering (availability/language only)
  const locallyFiltered = useMemo(() => {
    return tutors.filter((p: any) => {
      if (availability && !hasAvailability(p, availability)) return false;
      if (language && !hasLanguage(p, language)) return false;
      return true;
    });
  }, [tutors, availability, language]);

  // pagination (client-side paging of current server result set)
  const totalPages = Math.max(1, Math.ceil(locallyFiltered.length / PER_PAGE));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = locallyFiltered.slice((pageSafe - 1) * PER_PAGE, pageSafe * PER_PAGE);

  const onReset = () => {
    setQuery('');
    setAvailability('');
    setLanguage('');
    clearFilters(); // ✅ clears server-side filters too
    setPage(1);

    // optional: trigger server refresh back to default list
    handleSearch?.('');
  };

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

              <div className="flex items-end">
                <button
                  onClick={() => {
                    onReset();
                  }}
                  className="rounded-xl h-9 px-4 bg-[#e7edf4] dark:bg-[#172534] text-sm"
                >
                  Reset filters
                </button>
              </div>
            </div>

            {/* Search (server-driven) */}
            <div className="mt-3">
              <label className="flex h-12 w-full">
                <div className="flex items-stretch rounded-xl h-full w-full">
                  <div className="text-[#49739c] flex bg-[#e7edf4] dark:bg-[#172534] items-center justify-center pl-4 rounded-l-xl">
                    <FontAwesomeIcon icon={faMagnifyingGlass as IconProp} />
                  </div>

                  <input
                    placeholder='Search e.g. "Kenya math tutor", "Grade 3", "certified english"'
                    className="form-input w-full rounded-r-xl h-full px-4 bg-[#e7edf4] dark:bg-[#172534] text-[#0d141c] dark:text-darkTextPrimary outline-none border-0 placeholder:text-[#49739c]"
                    value={query}
                    onChange={(e) => {
                      const v = e.target.value;
                      setQuery(v);
                      setPage(1);

                      // ✅ Optional live mode (smart-gated)
                      if (live) {
                        const trimmed = v.trim();
                        // block single-digit + super short noise
                        if (/^\d$/.test(trimmed)) return;
                        if (trimmed.length < 2) return;
                        handleSearch?.(v);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        setPage(1);
                        handleSearch?.(query);
                      }
                    }}
                  />
                </div>
              </label>
            </div>
          </section>

          {/* Sticky Filters */}
          <div className="sticky top-0 z-10 mt-4 px-4 py-3 bg-slate-50/90 dark:bg-darkBg/80 backdrop-blur border-y border-[#e7edf4] dark:border-darkCard">
            <div className="flex gap-3 flex-wrap">
              {/* Subject (server) */}
              <select
                className="h-9 rounded-xl bg-[#e7edf4] dark:bg-[#172534] px-3 text-sm"
                value={uiFilters.subject}
                onChange={(e) => {
                  setSubjectFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Subject</option>
                {SUBJECTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              {/* Availability (local) */}
              <select
                className="h-9 rounded-xl bg-[#e7edf4] dark:bg-[#172534] px-3 text-sm"
                value={availability}
                onChange={(e) => {
                  setAvailability(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Availability</option>
                {AVAILABILITY.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>

              {/* Tokens */}
              <select
                className="h-9 rounded-xl bg-[#e7edf4] dark:bg-[#172534] px-3 text-sm"
                value={uiFilters.maxTokens > 0 ? String(uiFilters.maxTokens) : '0'}
                onChange={(e) => {
                  setMaxTokensFilter(Number(e.target.value || 0));
                  setPage(1);
                }}
              >
                <option value="0">Tokens</option>
                <option value="10">≤ 10 tokens</option>
                <option value="20">≤ 20 tokens</option>
                <option value="40">≤ 40 tokens</option>
                <option value="60">≤ 60 tokens</option>
                <option value="999999">60+ tokens</option>
              </select>

              {/* Language (local) */}
              <select
                className="h-9 rounded-xl bg-[#e7edf4] dark:bg-[#172534] px-3 text-sm"
                value={language}
                onChange={(e) => {
                  setLanguage(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Language</option>
                {languagesSet.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>

              {/* Rating (server) */}
              <select
                className="h-9 rounded-xl bg-[#e7edf4] dark:bg-[#172534] px-3 text-sm"
                value={String(uiFilters.minRating || '')}
                onChange={(e) => {
                  setMinRatingFilter(Number(e.target.value || 0));
                  setPage(1);
                }}
              >
                <option value="">Rating</option>
                {RATINGS.map((r) => (
                  <option key={r} value={r}>
                    {r}★ & up
                  </option>
                ))}
              </select>

              {/* Country (server) — ISO2 code value, label name */}
              <select
                className="h-9 rounded-xl bg-[#e7edf4] dark:bg-[#172534] px-3 text-sm"
                value={uiFilters.country} // ISO2
                onChange={(e) => {
                  setCountryFilter(e.target.value); // ISO2 code
                  setPage(1);
                }}
              >
                <option value="">Country</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

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
                            Certified
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
    </div>
  );
};

export default FindTutor;
