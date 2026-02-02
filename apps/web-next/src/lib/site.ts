import { publicEnv } from './env';

export const SITE_URL = publicEnv.siteUrl;

export const BRAND_NAME = 'DayBreak';

export const siteUrl = (path = '/') => {
  const base = SITE_URL.endsWith('/') ? SITE_URL : `${SITE_URL}/`;
  return new URL(path.replace(/^\//, ''), base).toString();
};
