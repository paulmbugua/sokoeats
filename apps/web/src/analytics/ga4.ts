// apps/web/src/analytics/ga4.ts

const GA4_MEASUREMENT_ID = import.meta.env.VITE_GA4_MEASUREMENT_ID as string | undefined;

const hasWindow = () => typeof window !== 'undefined';
let initialized = false;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: any[]) => void;
  }
}

type EventParams = Record<string, any>;

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
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    out[k] = v;
  }
  return out;
};

const isDebug = () =>
  import.meta.env.DEV || new URLSearchParams(window.location.search).has('ga_debug');

export const initGA4 = () => {
  if (!GA4_MEASUREMENT_ID || !hasWindow()) return;
  if (initialized) return;
  initialized = true;

  ensureGtag();

  window.gtag?.('config', GA4_MEASUREMENT_ID, {
    send_page_view: false,
    debug_mode:
      import.meta.env.DEV ||
      new URLSearchParams(window.location.search).has('ga_debug'),
  });
};


export const trackPageView = (path: string) => {
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
};

export const trackEvent = (name: string, params: EventParams = {}) => {
  if (!GA4_MEASUREMENT_ID || !hasWindow()) return;
  ensureGtag();
  window.gtag?.('event', name, cleanParams({ ...params, debug_mode: isDebug() }));
};
