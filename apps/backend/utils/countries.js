// apps/backend/utils/countries.js
import raw from 'world-countries';

export const COUNTRIES = (raw ?? [])
  .map((c) => ({
    code: String(c?.cca2 || '').toUpperCase(),
    name: String(c?.name?.common || '').trim(),
  }))
  .filter((c) => c.code.length === 2 && c.name.length > 0)
  .sort((a, b) => a.name.localeCompare(b.name));

const NAME_TO_ISO2 = new Map(
  COUNTRIES.map((c) => [c.name.toLowerCase(), c.code]),
);

// Optional: tiny synonyms
const ALIASES = new Map([
  ['usa', 'US'],
  ['u.s.a', 'US'],
  ['united states', 'US'],
  ['united kingdom', 'GB'],
  ['uk', 'GB'],
]);

export function resolveCountryIso2FromText(text) {
  const v = String(text || '').trim();
  if (!v) return '';

  // direct ISO2
  if (v.length === 2 && /^[a-zA-Z]{2}$/.test(v)) return v.toUpperCase();

  const low = v.toLowerCase();
  if (ALIASES.has(low)) return ALIASES.get(low) || '';

  // exact country name
  const exact = NAME_TO_ISO2.get(low);
  if (exact) return exact;

  // (optional) match inside longer query: "Kenya math tutor"
  // prefer longer names first
  const hay = ` ${low.replace(/\s+/g, ' ')} `;
  for (const { name, code } of COUNTRIES) {
    const needle = ` ${name.toLowerCase()} `;
    if (hay.includes(needle)) return code;
  }

  return '';
}
