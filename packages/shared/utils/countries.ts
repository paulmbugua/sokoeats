export type CountryItem = { code: string; name: string };

/**
 * We use the canonical list from `world-countries`.
 * Package exports an array of objects with cca2 + names.
 * (Works in web + RN; no JSON loaders needed.)
 */
import raw from 'world-countries';

export const COUNTRIES: CountryItem[] = (raw as Array<any>)
  .map((c) => ({
    code: String(c.cca2 || '').toUpperCase(),
    name: String(c?.name?.common || '').trim(),
  }))
  .filter((c) => c.code.length === 2 && c.name.length > 0)
  .sort((a, b) => a.name.localeCompare(b.name));

export const COUNTRY_MAP: Record<string, string> = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, c.name])
);

/** Utility: returns a valid ISO-3166-1 alpha-2 code or '' */
export function normalizeCountryCode(input?: string | null): string {
  const code = (input || '').toUpperCase().trim();
  return COUNTRY_MAP[code] ? code : '';
}

/** Utility: lookup by code → display name (falls back to code) */
export function countryName(code?: string | null): string {
  if (!code) return '';
  return COUNTRY_MAP[code.toUpperCase()] || code.toUpperCase();
}
