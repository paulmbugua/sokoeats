const KENYA_TERMS = new Set(['kenya', 'ke', 'nairobi', 'mombasa', 'kisumu', 'nakuru', 'eldoret']);

const CATEGORY_HINTS = [
  'plumber',
  'electrician',
  'painter',
  'cleaner',
  'carpenter',
  'mason',
  'mechanic',
  'welder',
  'gardener',
  'handyman',
  'appliance',
  'repair',
  'tiler',
  'roofer',
];

export async function aiParseTutorSearch(query = '') {
  const text = String(query || '').toLowerCase();
  const words = text.split(/[^a-z0-9]+/).filter(Boolean);
  const subject = CATEGORY_HINTS.find((term) => text.includes(term)) || '';
  const country = words.some((word) => KENYA_TERMS.has(word)) ? 'KE' : '';
  const status = /\b(now|today|available|urgent|nearby)\b/.test(text)
    ? 'online'
    : '';
  const certified = /\bcertified|verified|licensed\b/.test(text);
  const maxPriceMatch = text.match(/\b(?:under|below|max)\s*(?:kes|ksh)?\s*(\d+)/i);

  return {
    keywords: words
      .filter((word) => !KENYA_TERMS.has(word) && !['near', 'me', 'in', 'for'].includes(word))
      .join(' '),
    country,
    subject,
    gradeBand: '',
    status,
    experienceLevel: '',
    minRating: /\btop|best|highly rated\b/.test(text) ? 4 : 0,
    maxTokens: maxPriceMatch ? Number(maxPriceMatch[1]) : 0,
    maxPrice: maxPriceMatch ? Number(maxPriceMatch[1]) : 0,
    certified,
  };
}
