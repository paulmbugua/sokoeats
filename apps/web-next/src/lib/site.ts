export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://www.daybreaklearner.com';

export const BRAND_NAME = 'DayBreak';

export const siteUrl = (path = '/') => {
  const base = SITE_URL.endsWith('/') ? SITE_URL : `${SITE_URL}/`;
  return new URL(path.replace(/^\//, ''), base).toString();
};
