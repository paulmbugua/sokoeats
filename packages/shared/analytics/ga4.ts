export type EventParams = Record<string, any>;

type Ga4ClientOptions = {
  measurementId?: string;
  debugMode?: boolean;
  warnMissingId?: boolean;
};

const TTL_30_MIN = 30 * 60 * 1000;

const hasWindow = () => typeof window !== 'undefined';

const cleanParams = (params: EventParams) => {
  const out: EventParams = {};
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    out[key] = value;
  }
  return out;
};

const dedupeStoreKey = (event: string, dedupeKey: string) => `ga4:once:${event}:${dedupeKey}`;

const shouldDedupe = (event: string, dedupeKey: string, ttlMs = TTL_30_MIN) => {
  if (!hasWindow() || !dedupeKey) return false;
  try {
    const key = dedupeStoreKey(event, dedupeKey);
    const now = Date.now();
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const previous = Number(raw);
      if (Number.isFinite(previous) && now - previous < ttlMs) return true;
    }
    sessionStorage.setItem(key, String(now));
  } catch {
    return false;
  }
  return false;
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

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: any[]) => void;
  }
}

let configuredId = '';

export const initGa4 = ({ measurementId, debugMode, warnMissingId = true }: Ga4ClientOptions) => {
  if (!measurementId || !hasWindow()) {
    if (warnMissingId && typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn('[ga4] Missing measurement id; GA4 events will be skipped.');
    }
    return;
  }
  ensureGtag();
  if (configuredId === measurementId) return;
  configuredId = measurementId;
  window.gtag?.('config', measurementId, {
    send_page_view: false,
    debug_mode: Boolean(debugMode),
  });
};

export const trackEvent = (
  eventName: string,
  params: EventParams = {},
  { measurementId, debugMode }: Ga4ClientOptions
) => {
  if (!measurementId || !hasWindow()) return;
  ensureGtag();
  window.gtag?.('event', eventName, cleanParams({ ...params, debug_mode: Boolean(debugMode) }));
};

export const trackOnce = (
  eventName: string,
  params: EventParams,
  dedupeKey: string,
  options: Ga4ClientOptions,
  ttlMs = TTL_30_MIN
) => {
  if (!dedupeKey) return;
  if (shouldDedupe(eventName, dedupeKey, ttlMs)) return;
  trackEvent(
    eventName,
    {
      ...params,
      event_id: dedupeKey,
    },
    options
  );
};
