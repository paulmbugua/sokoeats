// apps/web/src/components/ClassVaultList.tsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import debounce from 'lodash.debounce';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconProp } from '@fortawesome/fontawesome-svg-core';
import {
  faPlayCircle,
  faTimesCircle,
  faFilePdf,
  faTrash,
  faDownload,
  faShoppingCart,
  faStar as faStarSolid,
  faStarHalfAlt as faStarHalf,
  faStar as faStarOutlineAlias,
} from '@fortawesome/free-solid-svg-icons';
import { useShopContext } from '@mytutorapp/shared/context';
import { useClassVault } from '@mytutorapp/shared/hooks';
import { fetchVideoReviews } from '@mytutorapp/shared/api/classVaultApi';
import type { RecordedVideo, VideoReview } from '@mytutorapp/shared/types';
import { COUNTRIES } from '@mytutorapp/shared/utils/countries';

/* ───────────────────────── Price bands (tokens) ───────────────────────── */
type PriceKey = 'any' | '1-5' | '6-10' | '11-20' | '21-50' | '51+';
const PRICE_BANDS: Record<PriceKey, (n?: number) => boolean> = {
  any: () => true,
  '1-5': (n) => typeof n === 'number' && n >= 1 && n <= 5,
  '6-10': (n) => typeof n === 'number' && n >= 6 && n <= 10,
  '11-20': (n) => typeof n === 'number' && n >= 11 && n <= 20,
  '21-50': (n) => typeof n === 'number' && n >= 21 && n <= 50,
  '51+': (n) => typeof n === 'number' && n >= 51,
};

/* ───────────────────────── Existing component scaffolding ───────────────────────── */
type TabKey = 'videos' | 'notes';
const tabs: { key: TabKey; label: string }[] = [
  { key: 'videos', label: 'Videos' },
  { key: 'notes', label: 'Class Notes' },
];

const VISIBLE_LIMIT = 8;
const DEBOUNCE_MS = 300;

interface Filters {
  videoCategory?: string[];
  videoAgeGroup?: string[];
  [key: string]: string[] | undefined;
}

/* ───────── Helpers (country normalization & extraction) ───────── */
const norm = (s?: string) => (s || '').toLowerCase().trim();

const COUNTRY_LOOKUP = (() => {
  const byCode = new Map<string, string>(); // code -> canonical name
  const byName = new Map<string, string>(); // norm(name) -> canonical name
  (Array.isArray(COUNTRIES) ? COUNTRIES : []).forEach((c: any) => {
    const code = String(c?.code ?? c?.iso2 ?? '')
      .toLowerCase()
      .trim();
    const name = String(c?.name ?? '').trim();
    if (code && name) byCode.set(code, name);
    if (name) byName.set(norm(name), name);
  });
  return { byCode, byName };
})();

function resolveToCountryName(input?: string): string | undefined {
  const s = norm(input);
  if (!s) return undefined;
  if (COUNTRY_LOOKUP.byCode.has(s)) return COUNTRY_LOOKUP.byCode.get(s)!;
  if (COUNTRY_LOOKUP.byName.has(s)) return COUNTRY_LOOKUP.byName.get(s)!;
  return undefined;
}

function readCountryFrom(item: any): string | undefined {
  const direct = resolveToCountryName(item?.country);
  if (direct) return direct;

  const parseMaybeObj = (raw: any) => {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {}
    }
    return {};
  };
  const meta = parseMaybeObj(item?.metadata);
  const desc = parseMaybeObj(item?.description);

  const metaC = resolveToCountryName(meta?.country);
  if (metaC) return metaC;
  const descC = resolveToCountryName(desc?.country);
  if (descC) return descC;

  if (Array.isArray(item?.tags)) {
    for (const t of item.tags) {
      const s = String(t);
      const [k, ...rest] = s.split(':');
      if (norm(k) === 'country') {
        const v = rest.join(':').trim();
        const tagC = resolveToCountryName(v);
        if (tagC) return tagC;
      }
    }
  }
  return undefined;
}

/* ───────── UI bits ───────── */
function StarRow({ avg }: { avg: number }) {
  const rounded = Math.round(avg * 2) / 2;
  const icons: React.ReactElement[] = [];
  for (let i = 1; i <= 5; i++) {
    if (rounded >= i) {
      icons.push(
        <FontAwesomeIcon key={i} icon={faStarSolid as IconProp} className="text-yellow-500" />
      );
    } else if (rounded + 0.5 === i) {
      icons.push(
        <FontAwesomeIcon key={i} icon={faStarHalf as IconProp} className="text-yellow-500" />
      );
    } else {
      icons.push(
        <FontAwesomeIcon
          key={i}
          icon={faStarOutlineAlias as IconProp}
          className="text-yellow-500 opacity-30"
        />
      );
    }
  }
  return (
    <span aria-label={`Rated ${avg} out of 5`} className="inline-flex gap-0.5">
      {icons}
    </span>
  );
}

/* ───────── Component ───────── */
export default function ClassVaultList() {
  const navigate = useNavigate();
  const { role, backendUrl, userId } = useShopContext();

  // Global search (?q=)
  const [searchParams] = useSearchParams();
  const searchTerm = useMemo(
    () => searchParams.get('q')?.trim().toLowerCase() ?? '',
    [searchParams]
  );

  // Hook-driven base filters (kept for parity)
  const [filters, setFilters] = useState<Filters>({});
  const chosenSubject = filters.videoCategory?.[0] ?? '';
  const chosenGrade = filters.videoAgeGroup?.[0] ?? '';

  const {
    filteredVideos,
    filteredPdfRows,
    purchasedIds,
    loading,
    error,
    refresh,
    purchase,
    remove,
  } = useClassVault(chosenSubject, chosenGrade);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Local UI filters (country-only + subject/grade/price)
  const [country, setCountry] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [grade, setGrade] = useState<string>('');
  const [priceKey, setPriceKey] = useState<PriceKey>('any');

  // -------- OER Collections grid (HomePage-like cards) --------
  const [oerCollections, setOerCollections] = useState<any[]>([]);
  useEffect(() => {
    if (!backendUrl) return;
    fetch(`${backendUrl}/api/oer/collections?limit=12`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load collections'))))
      .then(setOerCollections)
      .catch(() => setOerCollections([]));
  }, [backendUrl]);

  const clearFilters = useCallback(() => {
    setFilters({});
    setCountry('');
    setSubject('');
    setGrade('');
    setPriceKey('any');
    navigate(searchTerm ? `/search?q=${encodeURIComponent(searchTerm)}` : '/');
  }, [navigate, searchTerm]);

  // Role scoping
  const scopedVideos = useMemo(() => {
    if (role === 'tutor') {
      const me = Number(userId);
      return filteredVideos.filter((v) => Number(v.tutor_id) === me);
    }
    return filteredVideos;
  }, [filteredVideos, role, userId]);

  const scopedPdfRows = useMemo(() => {
    if (role === 'tutor') {
      const me = Number(userId);
      const rows = filteredPdfRows
        .map((row) => row.filter((pdf) => Number((pdf as any).tutor_id) === me))
        .filter((row) => row.length > 0);
      return rows;
    }
    return filteredPdfRows;
  }, [filteredPdfRows, role, userId]);

  // Dynamic subject/grade lists
  const subjectsList = useMemo(() => {
    const s = new Set<string>();
    scopedVideos.forEach((v) => v.subject && s.add(String(v.subject)));
    scopedPdfRows.flat().forEach((p) => p.subject && s.add(String(p.subject)));
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [scopedVideos, scopedPdfRows]);

  const gradesList = useMemo(() => {
    const s = new Set<string>();
    scopedVideos.forEach((v) => v.grade_level && s.add(String(v.grade_level)));
    scopedPdfRows.flat().forEach((p) => p.grade_level && s.add(String(p.grade_level)));
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [scopedVideos, scopedPdfRows]);

  // Countries present in content (fallback to full COUNTRIES list)
  const countriesInContent = useMemo(() => {
    const s = new Set<string>();
    scopedVideos.forEach((v) => {
      const c = readCountryFrom(v);
      if (c) s.add(c);
    });
    scopedPdfRows.flat().forEach((p) => {
      const c = readCountryFrom(p);
      if (c) s.add(c);
    });
    const arr = Array.from(s);
    if (arr.length > 0) return arr.sort((a, b) => a.localeCompare(b));
    return (Array.isArray(COUNTRIES) ? COUNTRIES : [])
      .map((c: any) => String(c?.name ?? '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [scopedVideos, scopedPdfRows]);

  // Text search
  const searchFilteredVideos = useMemo(() => {
    if (!searchTerm) return scopedVideos;
    const q = searchTerm;
    return scopedVideos.filter((v) => {
      const titleMatch = v.title.toLowerCase().includes(q);
      const subjectMatch = (v.subject ?? '').toLowerCase().includes(q);
      const gradeMatch =
        v.grade_level != null ? String(v.grade_level).toLowerCase().includes(q) : false;
      const descMatch = (v.description ?? '').toLowerCase().includes(q);
      return titleMatch || subjectMatch || gradeMatch || descMatch;
    });
  }, [scopedVideos, searchTerm]);

  const searchFilteredPdfRows = useMemo(() => {
    if (!searchTerm) return scopedPdfRows;
    const q = searchTerm;
    return scopedPdfRows
      .map((row) =>
        row.filter((pdf) => {
          const titleMatch = pdf.title.toLowerCase().includes(q);
          const subjectMatch = (pdf.subject ?? '').toLowerCase().includes(q);
          const gradeMatch =
            pdf.grade_level != null ? String(pdf.grade_level).toLowerCase().includes(q) : false;
          const descMatch = (pdf.description ?? '').toLowerCase().includes(q);
          return titleMatch || subjectMatch || gradeMatch || descMatch;
        })
      )
      .filter((row) => row.length > 0);
  }, [scopedPdfRows, searchTerm]);

  // Country-only narrowing
  const countryFilteredVideos = useMemo(() => {
    if (!country) return searchFilteredVideos;
    const want = resolveToCountryName(country) ?? country;
    return searchFilteredVideos.filter((v) => {
      const c = readCountryFrom(v);
      return !!c && norm(c) === norm(want);
    });
  }, [searchFilteredVideos, country]);

  const countryFilteredPdfRows = useMemo(() => {
    if (!country) return searchFilteredPdfRows;
    const want = resolveToCountryName(country) ?? country;
    return searchFilteredPdfRows
      .map((row) =>
        row.filter((pdf) => {
          const c = readCountryFrom(pdf);
          return !!c && norm(c) === norm(want);
        })
      )
      .filter((row) => row.length > 0);
  }, [searchFilteredPdfRows, country]);

  // Subject / Grade / Price filters
  const fullyFilteredVideos = useMemo(() => {
    return countryFilteredVideos.filter((v) => {
      const subjectOk = !subject || norm(String(v.subject)) === norm(subject);
      const gradeOk = !grade || norm(String(v.grade_level)) === norm(grade);
      const priceOk = PRICE_BANDS[priceKey](
        typeof v.price === 'number' ? v.price : Number(v.price)
      );
      return subjectOk && gradeOk && priceOk;
    });
  }, [countryFilteredVideos, subject, grade, priceKey]);

  const fullyFilteredPdfRows = useMemo(() => {
    return countryFilteredPdfRows
      .map((row) =>
        row.filter((pdf) => {
          const subjectOk = !subject || norm(String(pdf.subject)) === norm(subject);
          const gradeOk = !grade || norm(String(pdf.grade_level)) === norm(grade);
          const priceOk = PRICE_BANDS[priceKey](
            typeof pdf.price === 'number' ? pdf.price : Number(pdf.price)
          );
          return subjectOk && gradeOk && priceOk;
        })
      )
      .filter((row) => row.length > 0);
  }, [countryFilteredPdfRows, subject, grade, priceKey]);

  // Ratings prefetch
  const [ratings, setRatings] = useState<Record<number, { avg: number; count: number }>>({});
  const fetchingIdsRef = useRef<Set<number>>(new Set());
  const idsToPrefetch = useMemo<number[]>(
    () => searchFilteredVideos.slice(0, VISIBLE_LIMIT).map((v) => v.id),
    [searchFilteredVideos]
  );
  const debouncedFetch = useMemo(
    () =>
      debounce(async (ids: number[]) => {
        if (!backendUrl) return;
        for (const id of ids) {
          if (ratings[id] || fetchingIdsRef.current.has(id)) continue;
          fetchingIdsRef.current.add(id);
          try {
            const data: VideoReview[] = await fetchVideoReviews(backendUrl, id);
            const count = data.length;
            const avg =
              count > 0
                ? Number((data.reduce((s, r) => s + Number(r.rating), 0) / count).toFixed(2))
                : 0;
            setRatings((prev) => (prev[id] ? prev : { ...prev, [id]: { avg, count } }));
          } finally {
            fetchingIdsRef.current.delete(id);
          }
        }
      }, DEBOUNCE_MS),
    [backendUrl, ratings]
  );
  useEffect(() => {
    const pending = idsToPrefetch.filter((id) => !ratings[id] && !fetchingIdsRef.current.has(id));
    if (pending.length > 0) debouncedFetch(pending);
    return () => {
      debouncedFetch.cancel();
    };
  }, [idsToPrefetch, ratings, debouncedFetch]);

  // UI handlers
  const [currentTab, setCurrentTab] = useState<TabKey>('videos');
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [buyingId, setBuyingId] = useState<number | null>(null);

  const handlePurchase = useCallback(
    async (item: RecordedVideo) => {
      if (buyingId === item.id) return;
      const ok = window.confirm(
        `You are about to purchase "${item.title}" for ${item.price} tokens.\n\n` +
          `This amount will be deducted from your balance. Do you want to continue?`
      );
      if (!ok) return;
      try {
        setBuyingId(item.id);
        await purchase(item);
        alert(`Purchase successful! "${item.title}" is now unlocked.`);
        navigate(`/class-vault/${item.id}`);
      } catch (err: unknown) {
        const e = (err ?? {}) as { message?: string };
        if (e.message?.includes('Insufficient tokens')) {
          if (window.confirm('Not enough tokens. Would you like to buy more?'))
            navigate('/buy-tokens');
        } else {
          alert(e.message || 'Purchase failed');
        }
      } finally {
        setBuyingId(null);
      }
    },
    [purchase, navigate, buyingId]
  );

  const handleDownload = useCallback(
    (id: number) => {
      navigate(`/class-vault/${id}`);
    },
    [navigate]
  );
  const handleDelete = useCallback(
    (id: number) => {
      if (role !== 'tutor') return;
      if (!window.confirm('Delete this item?')) return;
      remove(id).catch(() => alert('Deletion failed'));
    },
    [remove, role]
  );

  if (loading)
    return (
      <div className="flex items-center justify-center h-64 text-[#0d141c] dark:text-darkTextPrimary">
        …Loading…
      </div>
    );
  if (error) return <div className="text-red-500 text-center py-8">{error}</div>;

  const videosEmpty = fullyFilteredVideos.length === 0;
  const notesEmpty = fullyFilteredPdfRows.flat().length === 0;

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6 text-[#0d141c] dark:text-darkTextPrimary">
      <h1 className="text-2xl font-bold text-center">
        {role === 'tutor' ? 'Your Uploaded Classes' : 'Available Classes'}
      </h1>

      {/* Filter row (no Region—country only) */}
      <div className="flex flex-wrap gap-2 items-center justify-center">
        {/* Country */}
        <select
          className="h-9 rounded-xl bg-[#e7edf4] dark:bg-[#172534] px-3 text-sm"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        >
          <option value="">Country</option>
          {countriesInContent.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {/* Subject */}
        <select
          className="h-9 rounded-xl bg-[#e7edf4] dark:bg-[#172534] px-3 text-sm"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        >
          <option value="">Subject</option>
          {subjectsList.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* Grade */}
        <select
          className="h-9 rounded-xl bg-[#e7edf4] dark:bg-[#172534] px-3 text-sm"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
        >
          <option value="">Grade level</option>
          {gradesList.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        {/* Price (tokens) */}
        <select
          className="h-9 rounded-xl bg-[#e7edf4] dark:bg-[#172534] px-3 text-sm"
          value={priceKey}
          onChange={(e) => setPriceKey(e.target.value as PriceKey)}
        >
          <option value="any">Price (tokens)</option>
          <option value="1-5">1–5</option>
          <option value="6-10">6–10</option>
          <option value="11-20">11–20</option>
          <option value="21-50">21–50</option>
          <option value="51+">51+</option>
        </select>

        <button
          onClick={clearFilters}
          className="rounded-xl h-9 px-4 bg-[#e7edf4] dark:bg-[#172534] text-sm"
        >
          Clear filters
        </button>
      </div>

      {/* Tabs */}
      <div className="flex justify-center mb-6">
        <div className="flex items-center space-x-2 rounded-full p-1 bg-[#e7edf4] dark:bg-[#172534] ring-1 ring-[#cedbe8] dark:ring-darkCard">
          {tabs.map((tab) => {
            const active = currentTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setCurrentTab(tab.key)}
                className={
                  'px-4 py-2 rounded-full font-medium transition ' +
                  (active
                    ? 'bg-white dark:bg-[#0f1821] shadow text-[#0d141c] dark:text-darkTextPrimary'
                    : 'text-[#0d141c]/80 dark:text-darkTextSecondary hover:text-[#0d141c] dark:hover:text-darkTextPrimary')
                }
                aria-pressed={active}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Videos */}
      {currentTab === 'videos' ? (
        videosEmpty ? (
          <div className="text-center text-[#49739c] dark:text-darkTextSecondary py-8">
            {role === 'tutor' ? 'No recorded videos yet.' : 'No available videos.'}
            {role === 'tutor' && (
              <button
                onClick={() => navigate('/class-vault/upload')}
                className="mt-4 px-6 py-2 rounded-full bg-[#3d99f5] text-white font-semibold hover:brightness-110"
              >
                Upload Your First Class
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Paid/Uploaded videos grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
              {fullyFilteredVideos.map((video) => {
                const stat = ratings[video.id];
                const showStars = Boolean(stat && stat.count > 0);

                return (
                  <div
                    key={video.id}
                    className="bg-white dark:bg-[#0f1821] rounded-lg ring-1 ring-[#e7edf4] dark:ring-darkCard shadow-sm flex flex-col"
                  >
                    {/* Preview */}
                    <div className="relative group">
                      {video.preview_url ? (
                        <video
                          src={video.preview_url}
                          className="w-full h-40 object-cover"
                          muted
                          playsInline
                          loop
                          autoPlay
                          preload="metadata"
                        />
                      ) : (
                        <div className="w-full h-40 bg-black flex items-center justify-center text-white text-4xl">
                          <FontAwesomeIcon icon={faPlayCircle as IconProp} />
                        </div>
                      )}

                      {video.preview_url && (
                        <button
                          onClick={() =>
                            setPreviewId((prev) => (prev === video.id ? null : video.id))
                          }
                          className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition"
                          aria-label={previewId === video.id ? 'Hide controls' : 'Show controls'}
                          title={previewId === video.id ? 'Hide controls' : 'Show controls'}
                        >
                          <span className="sr-only">Toggle controls</span>
                        </button>
                      )}

                      {previewId === video.id && video.preview_url && (
                        <>
                          <video
                            src={video.preview_url}
                            className="absolute inset-0 w-full h-40 object-cover"
                            controls
                            autoPlay
                            muted
                            playsInline
                          />
                          <button
                            onClick={() => setPreviewId(null)}
                            className="absolute top-2 right-2 text-white text-xl"
                            aria-label="Close preview"
                            title="Close preview"
                          >
                            <FontAwesomeIcon icon={faTimesCircle as IconProp} />
                          </button>
                        </>
                      )}
                    </div>

                    {/* Body */}
                    <div className="p-4 flex-1 flex flex-col">
                      <h2 className="font-semibold text-lg line-clamp-2">{video.title}</h2>

                      {showStars && (
                        <div className="mt-1 flex items-center gap-2">
                          <StarRow avg={stat!.avg} />
                          <span className="text-xs text-[#49739c] dark:text-darkTextSecondary">
                            ({stat!.count})
                          </span>
                        </div>
                      )}

                      <p className="text-sm text-[#49739c] dark:text-darkTextSecondary mt-1 flex-1">
                        {video.subject ?? 'Unknown subject'} • Grade {video.grade_level}
                      </p>

                      <p className="text-sm text-[#0d141c] dark:text-darkTextPrimary">
                        Price: {video.price} tokens
                      </p>

                      <div className="mt-4 space-x-2">
                        {role === 'tutor' ? (
                          <button
                            onClick={() => handleDelete(video.id)}
                            className="px-3 py-2 rounded bg-red-600 text-white hover:bg-red-500 inline-flex items-center"
                          >
                            <FontAwesomeIcon icon={faTrash as IconProp} className="mr-1" />
                            Delete
                          </button>
                        ) : purchasedIds.has(video.id) ? (
                          <>
                            <button
                              onClick={() => handleDownload(video.id)}
                              className="px-3 py-2 rounded ring-1 ring-[#cedbe8] dark:ring-darkCard hover:bg-slate-50 dark:hover:bg-[#172534] inline-flex items-center"
                            >
                              <FontAwesomeIcon icon={faDownload as IconProp} className="mr-1" />
                              Download
                            </button>
                            <button
                              onClick={() => navigate(`/class-vault/${video.id}#review`)}
                              className="px-3 py-2 rounded ring-1 ring-[#cedbe8] dark:ring-darkCard hover:bg-slate-50 dark:hover:bg-[#172534] inline-flex items-center ml-2"
                              aria-label="Review this video"
                              title="Review this video"
                            >
                              ★ Review
                            </button>
                          </>
                        ) : (
                          <button
                            disabled={buyingId === video.id}
                            onClick={() => handlePurchase(video)}
                            className="px-3 py-2 rounded ring-1 ring-[#cedbe8] dark:ring-darkCard hover:bg-slate-50 dark:hover:bg-[#172534] inline-flex items-center disabled:opacity-60"
                            title={buyingId === video.id ? 'Processing…' : 'Purchase'}
                          >
                            <FontAwesomeIcon icon={faShoppingCart as IconProp} className="mr-1" />
                            {buyingId === video.id ? 'Purchasing…' : 'Purchase'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* —— Free Video Collections (HomePage-like cards) —— */}
            {oerCollections.length > 0 && (
              <>
                <h2 className="mt-8 text-xl font-bold">Free Video Collections</h2>
                <p className="text-sm text-[#49739c] dark:text-darkTextSecondary mb-2">
                  Curated OER playlists from YouTube/Khan and others. Click to open the collection.
                </p>

                {/* Mobile: 1-col */}
                <div className="grid grid-cols-1 gap-4 md:hidden">
                  {oerCollections.map((col: any, idx: number) => (
                    <Link
                      key={`col-${col.id}-${idx}`}
                      to={`/videos/${col.id}`}
                      className="block bg-white dark:bg-[#0f1821] rounded-xl overflow-hidden ring-1 ring-gray-200 dark:ring-darkCard hover:ring-primary transition"
                      title="Open collection"
                    >
                      {col.thumbnail_url ? (
                        <img
                          src={col.thumbnail_url}
                          alt={col.title}
                          className="w-full aspect-video object-cover"
                        />
                      ) : (
                        <div className="w-full aspect-video bg-black/70" />
                      )}
                      <div className="p-4">
                        <h4 className="font-semibold truncate">{col.title}</h4>
                        <p className="text-sm text-[#49739c] dark:text-darkTextSecondary mt-1">
                          Free Collection • {col.items_count} item{col.items_count === 1 ? '' : 's'}
                        </p>
                        <div className="mt-3">
                          <span className="inline-flex items-center justify-center rounded-xl h-9 px-4 bg-primary text-white text-sm font-semibold hover:brightness-110">
                            View Collection
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>

                {/* Desktop: 2–4 cols */}
                <div className="mt-4 hidden md:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {oerCollections.map((col: any, idx: number) => (
                    <div
                      key={`col-${col.id}-${idx}`}
                      className="block bg-white dark:bg-[#0f1821] rounded-xl overflow-hidden ring-1 ring-gray-200 dark:ring-darkCard hover:ring-primary transition"
                    >
                      <Link to={`/videos/${col.id}`} title="Open collection">
                        {col.thumbnail_url ? (
                          <img
                            src={col.thumbnail_url}
                            alt={col.title}
                            className="w-full aspect-video object-cover"
                          />
                        ) : (
                          <div className="w-full aspect-video bg-black/70" />
                        )}
                      </Link>
                      <div className="p-4">
                        <h4 className="font-semibold truncate">{col.title}</h4>
                        <p className="text-sm text-[#49739c] dark:text-darkTextSecondary mt-1">
                          Free Collection • {col.items_count} item{col.items_count === 1 ? '' : 's'}
                        </p>
                        <div className="mt-3">
                          <Link
                            to={`/videos/${col.id}`}
                            className="inline-flex items-center justify-center rounded-lg h-9 px-4 bg-primary text-white text-sm font-medium hover:brightness-110"
                          >
                            View Collection
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )
      ) : // Notes
      notesEmpty ? (
        <div className="text-center text-[#49739c] dark:text-darkTextSecondary py-8">
          {role === 'tutor' ? 'No class notes uploaded yet.' : 'No class notes available.'}
          {role === 'tutor' && (
            <button
              onClick={() => navigate('/class-vault/upload')}
              className="mt-4 px-6 py-2 rounded-full bg-[#3d99f5] text-white font-semibold hover:brightness-110"
            >
              Upload Your First Notes
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
            {fullyFilteredPdfRows.flat().map((pdf) => (
              <div
                key={pdf.id}
                className="bg-white dark:bg-[#0f1821] rounded-lg ring-1 ring-[#e7edf4] dark:ring-darkCard shadow-sm p-4 flex flex-col items-center"
              >
                <FontAwesomeIcon
                  icon={faFilePdf as IconProp}
                  className="text-red-600 text-4xl mb-2"
                />
                <h3 className="font-semibold text-center line-clamp-2">{pdf.title}</h3>
                <p className="text-sm text-[#0d141c] dark:text-darkTextPrimary mt-2">
                  Price: {pdf.price} tokens
                </p>
                <div className="mt-auto flex space-x-2">
                  {role === 'tutor' ? (
                    <button
                      onClick={() => handleDelete(pdf.id)}
                      className="px-3 py-2 rounded bg-red-600 text-white hover:bg-red-500"
                      aria-label="Delete note"
                      title="Delete"
                    >
                      <FontAwesomeIcon icon={faTrash as IconProp} />
                    </button>
                  ) : purchasedIds.has(pdf.id) ? (
                    <button
                      onClick={() => handleDownload(pdf.id)}
                      className="px-3 py-2 rounded ring-1 ring-[#cedbe8] dark:ring-darkCard hover:bg-slate-50 dark:hover:bg-[#172534]"
                      aria-label="Download note"
                      title="Download"
                    >
                      <FontAwesomeIcon icon={faDownload as IconProp} />
                    </button>
                  ) : (
                    <button
                      disabled={buyingId === pdf.id}
                      onClick={() => handlePurchase(pdf as RecordedVideo)}
                      className="px-3 py-2 rounded ring-1 ring-[#cedbe8] dark:ring-darkCard hover:bg-slate-50 dark:hover:bg-[#172534] disabled:opacity-60"
                      aria-label="Purchase note"
                      title={buyingId === pdf.id ? 'Processing…' : 'Purchase'}
                    >
                      <FontAwesomeIcon icon={faShoppingCart as IconProp} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {role === 'tutor' && (
            <div className="text-center mt-6">
              <button
                onClick={() => navigate('/class-vault/upload')}
                className="px-6 py-2 rounded-full bg-[#3d99f5] text-white font-semibold hover:brightness-110"
              >
                Upload New Notes
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
