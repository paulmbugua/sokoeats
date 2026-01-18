import React, { useMemo, useState } from 'react';
import { COUNTRIES } from '@mytutorapp/shared/utils/countries';

export type ExploreFilters = {
  subject?: string;
  grade?: string;
  level?: string;
  country?: string;
  minRating?: number;
  maxPrice?: number;
  duration?: string;
  provider?: string;
  scope?: 'all' | 'purchased' | 'free';
};

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  filters: ExploreFilters;
  onFiltersChange: (next: Partial<ExploreFilters>) => void;
  onClearAll: () => void;
  variant: 'courses' | 'library';
  placeholder?: string;
};

const chipBase =
  'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-[#cedbe8] dark:ring-darkCard bg-white/80 dark:bg-[#0b1420]/80';

const COUNTRY_LIST = Array.isArray(COUNTRIES) ? COUNTRIES : [];

export default function ExploreSearchFiltersBar({
  query,
  onQueryChange,
  filters,
  onFiltersChange,
  onClearAll,
  variant,
  placeholder,
}: Props) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  const filteredCountries = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return COUNTRY_LIST.slice(0, 120);
    return COUNTRY_LIST.filter((c) =>
      `${c.code} ${c.name}`.toLowerCase().includes(q)
    ).slice(0, 200);
  }, [countrySearch]);

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
    if (filters.subject)
      chips.push({
        key: 'subject',
        label: `Subject: ${filters.subject}`,
        onClear: () => onFiltersChange({ subject: '' }),
      });
    if (filters.grade)
      chips.push({
        key: 'grade',
        label: `Grade: ${filters.grade}`,
        onClear: () => onFiltersChange({ grade: '' }),
      });
    if (filters.level)
      chips.push({
        key: 'level',
        label: `Level: ${filters.level}`,
        onClear: () => onFiltersChange({ level: '' }),
      });
    if (filters.country)
      chips.push({
        key: 'country',
        label: `Country: ${filters.country}`,
        onClear: () => onFiltersChange({ country: '' }),
      });
    if (filters.minRating)
      chips.push({
        key: 'rating',
        label: `Min★ ${filters.minRating}`,
        onClear: () => onFiltersChange({ minRating: 0 }),
      });
    if (filters.maxPrice)
      chips.push({
        key: 'price',
        label: `Max $${filters.maxPrice}`,
        onClear: () => onFiltersChange({ maxPrice: 0 }),
      });
    if (filters.duration)
      chips.push({
        key: 'duration',
        label: `Duration: ${filters.duration}`,
        onClear: () => onFiltersChange({ duration: '' }),
      });
    if (filters.provider)
      chips.push({
        key: 'provider',
        label: `Provider: ${filters.provider}`,
        onClear: () => onFiltersChange({ provider: '' }),
      });
    if (filters.scope && filters.scope !== 'all')
      chips.push({
        key: 'scope',
        label: filters.scope === 'free' ? 'Free only' : 'Purchased only',
        onClear: () => onFiltersChange({ scope: 'all' }),
      });
    return chips;
  }, [filters, onFiltersChange]);

  return (
    <div className="rounded-2xl ring-1 ring-[#e7edf4] dark:ring-darkCard bg-white dark:bg-[#0f1821] p-3 sm:p-4 space-y-3">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="flex-1">
          <div className="flex items-center gap-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534] px-3 h-11">
            <span className="text-sm">🔎</span>
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={placeholder ?? 'Search by subject, grade, country, keywords…'}
              className="w-full bg-transparent text-sm text-[#0d141c] dark:text-white outline-none"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="h-11 px-4 rounded-xl bg-[#e7edf4] dark:bg-[#172534] text-xs font-semibold"
          >
            Filters
          </button>
          <button
            type="button"
            onClick={onClearAll}
            className="h-11 px-4 rounded-xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 text-xs font-semibold"
          >
            Clear all
          </button>
        </div>
      </div>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onClear}
              className={chipBase}
            >
              {chip.label}
              <span className="text-[10px]">✕</span>
            </button>
          ))}
        </div>
      )}

      {panelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">Filters</h3>
                <p className="text-xs text-[#49739c] dark:text-darkTextSecondary">
                  {variant === 'courses'
                    ? 'Refine courses by country, level, rating, and price.'
                    : 'Filter your library across purchased and free resources.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="text-sm text-[#49739c] dark:text-darkTextSecondary"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-[#0d141c] dark:text-darkTextPrimary">
                Subject
                <input
                  value={filters.subject ?? ''}
                  onChange={(e) => onFiltersChange({ subject: e.target.value })}
                  placeholder="e.g., Math"
                  className="mt-1 w-full h-10 rounded-lg bg-[#e7edf4] dark:bg-[#172534] px-3 text-sm"
                />
              </label>

              <label className="text-xs font-semibold text-[#0d141c] dark:text-darkTextPrimary">
                Grade / Age band
                <input
                  value={filters.grade ?? ''}
                  onChange={(e) => onFiltersChange({ grade: e.target.value })}
                  placeholder="e.g., K-5"
                  className="mt-1 w-full h-10 rounded-lg bg-[#e7edf4] dark:bg-[#172534] px-3 text-sm"
                />
              </label>

              {variant === 'courses' && (
                <label className="text-xs font-semibold text-[#0d141c] dark:text-darkTextPrimary">
                  Level
                  <input
                    value={filters.level ?? ''}
                    onChange={(e) => onFiltersChange({ level: e.target.value })}
                    placeholder="Beginner / Intermediate"
                    className="mt-1 w-full h-10 rounded-lg bg-[#e7edf4] dark:bg-[#172534] px-3 text-sm"
                  />
                </label>
              )}

              <div className="text-xs font-semibold text-[#0d141c] dark:text-darkTextPrimary">
                Country
                <div className="mt-1 rounded-lg border border-[#cedbe8] dark:border-white/10 bg-[#f6f9fc] dark:bg-[#172534] p-2">
                  <input
                    value={countrySearch}
                    onChange={(e) => setCountrySearch(e.target.value)}
                    placeholder="Search country…"
                    className="w-full bg-transparent text-sm outline-none"
                  />
                  <div className="mt-2 max-h-40 overflow-auto space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        onFiltersChange({ country: '' });
                        setCountrySearch('');
                      }}
                      className="w-full text-left text-xs text-[#49739c] dark:text-darkTextSecondary"
                    >
                      Any country
                    </button>
                    {filteredCountries.map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => {
                          onFiltersChange({ country: c.name });
                          setCountrySearch('');
                        }}
                        className={`w-full text-left text-xs rounded-md px-2 py-1 hover:bg-white/80 dark:hover:bg-white/5 ${
                          filters.country === c.name
                            ? 'bg-white dark:bg-white/10 font-semibold'
                            : ''
                        }`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {variant === 'courses' && (
                <label className="text-xs font-semibold text-[#0d141c] dark:text-darkTextPrimary">
                  Min rating
                  <input
                    value={filters.minRating ? String(filters.minRating) : ''}
                    onChange={(e) => onFiltersChange({ minRating: Number(e.target.value || 0) })}
                    placeholder="e.g., 4"
                    className="mt-1 w-full h-10 rounded-lg bg-[#e7edf4] dark:bg-[#172534] px-3 text-sm"
                  />
                </label>
              )}

              {variant === 'courses' && (
                <label className="text-xs font-semibold text-[#0d141c] dark:text-darkTextPrimary">
                  Max price
                  <input
                    value={filters.maxPrice ? String(filters.maxPrice) : ''}
                    onChange={(e) => onFiltersChange({ maxPrice: Number(e.target.value || 0) })}
                    placeholder="e.g., 50"
                    className="mt-1 w-full h-10 rounded-lg bg-[#e7edf4] dark:bg-[#172534] px-3 text-sm"
                  />
                </label>
              )}

              {variant === 'courses' && (
                <label className="text-xs font-semibold text-[#0d141c] dark:text-darkTextPrimary">
                  Duration contains
                  <input
                    value={filters.duration ?? ''}
                    onChange={(e) => onFiltersChange({ duration: e.target.value })}
                    placeholder="e.g., 10 weeks"
                    className="mt-1 w-full h-10 rounded-lg bg-[#e7edf4] dark:bg-[#172534] px-3 text-sm"
                  />
                </label>
              )}

              {variant === 'library' && (
                <label className="text-xs font-semibold text-[#0d141c] dark:text-darkTextPrimary">
                  Provider
                  <input
                    value={filters.provider ?? ''}
                    onChange={(e) => onFiltersChange({ provider: e.target.value })}
                    placeholder="e.g., Khan Academy"
                    className="mt-1 w-full h-10 rounded-lg bg-[#e7edf4] dark:bg-[#172534] px-3 text-sm"
                  />
                </label>
              )}

              {variant === 'library' && (
                <label className="text-xs font-semibold text-[#0d141c] dark:text-darkTextPrimary">
                  Content type
                  <select
                    value={filters.scope ?? 'all'}
                    onChange={(e) => onFiltersChange({ scope: e.target.value as ExploreFilters['scope'] })}
                    className="mt-1 w-full h-10 rounded-lg bg-[#e7edf4] dark:bg-[#172534] px-3 text-sm"
                  >
                    <option value="all">All</option>
                    <option value="purchased">Purchased</option>
                    <option value="free">Free</option>
                  </select>
                </label>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="h-10 px-4 rounded-xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 text-sm"
              >
                Done
              </button>
              <button
                type="button"
                onClick={onClearAll}
                className="h-10 px-4 rounded-xl bg-[#3d99f5] text-white text-sm font-semibold"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
