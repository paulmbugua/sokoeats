const GA4_MEASUREMENT_ID = (process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID || '').trim();

const hasWindow = () => typeof window !== 'undefined';
const hasDebugFlag = () =>
  hasWindow() && new URLSearchParams(window.location.search).has('ga_debug');
const isDebug = () => process.env.NODE_ENV !== 'production' || hasDebugFlag();

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: any[]) => void;
  }
}

type EventParams = Record<string, unknown>;

let warnedMissingId = false;
const warnIfMissingId = () => {
  if (process.env.NODE_ENV !== 'development' || GA4_MEASUREMENT_ID || warnedMissingId) return;
  warnedMissingId = true;
  // eslint-disable-next-line no-console
  console.warn('[ga4] Missing NEXT_PUBLIC_GA4_MEASUREMENT_ID; GA4 events will be skipped.');
};

const ensureGtag = () => {
  if (!hasWindow()) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    ((...args: any[]) => {
      window.dataLayer?.push(args);
    });
};

const cleanParams = (params: EventParams) => {
  const out: EventParams = {};
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    out[key] = value;
  }
  return out;
};

export const trackPageView = (path: string) => {
  warnIfMissingId();
  if (!GA4_MEASUREMENT_ID || !hasWindow()) return;
  ensureGtag();
  window.gtag?.(
    'event',
    'page_view',
    cleanParams({
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
      debug_mode: isDebug(),
    })
  );

  if (process.env.NODE_ENV === 'development' && hasDebugFlag()) {
    const recent = window.dataLayer?.slice(-5) ?? [];
    // eslint-disable-next-line no-console
    console.debug('[ga4] dataLayer (last 5)', recent);
  }
};

export const trackEvent = (name: string, params: EventParams = {}) => {
  warnIfMissingId();
  if (!GA4_MEASUREMENT_ID || !hasWindow()) return;
  ensureGtag();
  window.gtag?.('event', name, cleanParams({ ...params, debug_mode: isDebug() }));
};
