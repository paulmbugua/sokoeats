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

/** Remove undefined/null/empty-string so GA4 payloads stay clean */
const cleanParams = (params: EventParams) => {
  const out: EventParams = {};
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    out[k] = v;
  }
  return out;
};

const hasDebugFlag = () => new URLSearchParams(window.location.search).has('ga_debug');
const isDebug = () => import.meta.env.DEV || hasDebugFlag();

let warnedMissingId = false;
const warnIfMissingId = () => {
  if (!import.meta.env.DEV || GA4_MEASUREMENT_ID || warnedMissingId) return;
  warnedMissingId = true;
  console.warn('[ga4] Missing VITE_GA4_MEASUREMENT_ID; GA4 events will be skipped.');
};

/**
 * Init GA4 once.
 * IMPORTANT: We do NOT inject gtag.js here anymore (it is loaded by index.html).
 * This function simply ensures gtag exists and applies config options safely.
 */
export const initGA4 = () => {
  warnIfMissingId();
  if (!GA4_MEASUREMENT_ID || !hasWindow()) return;
  if (initialized) return;
  initialized = true;

  ensureGtag();

  // Running this is harmless if web-next already initialized gtag.
  window.gtag?.('js', new Date());

  // Apply config (and disable automatic page_view so SPA can control it)
  window.gtag?.('config', GA4_MEASUREMENT_ID, {
    send_page_view: false,
    debug_mode: isDebug(),
  });
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

  if (import.meta.env.DEV && hasDebugFlag()) {
    const recent = window.dataLayer?.slice(-5) ?? [];
    console.debug('[ga4] dataLayer (last 5)', recent);
  }
};

export const trackEvent = (name: string, params: EventParams = {}) => {
  warnIfMissingId();
  if (!GA4_MEASUREMENT_ID || !hasWindow()) return;
  ensureGtag();
  window.gtag?.('event', name, cleanParams({ ...params, debug_mode: isDebug() }));
};

/* ─────────────────────────────────────────────
   Opinionated helpers for your key funnel events
   ───────────────────────────────────────────── */

export type LoginMethod = 'email' | 'google';

export const trackLogin = (method: LoginMethod, extra: EventParams = {}) =>
  trackEvent('login', { method, ...extra });

export const trackSignUp = (method: LoginMethod, extra: EventParams = {}) =>
  trackEvent('sign_up', { method, ...extra });

export const trackStartCourse = (payload: {
  course_id: string | number;
  course_title?: string;
  source?: string; // e.g. 'courses_page' | 'my_enrollments' | 'search'
  is_ai?: boolean;
}) => trackEvent('start_course', payload);

export const trackAiGenerateLesson = (payload: {
  course_id?: string | number;
  course_title?: string;
  lesson_id?: string | number;
  language?: string; // e.g. 'German'
  voice?: string;
  mode?: 'robot_teacher' | 'language_learning' | 'course_progress';
}) => trackEvent('ai_generate_lesson', payload);

/* ─────────────────────────────────────────────
   GA4 ecommerce helpers (recommended events)
   ───────────────────────────────────────────── */

export type Ga4Item = {
  item_id: string;
  item_name: string;
  item_category?: string; // 'tokens' | 'subscription' | ...
  item_variant?: string; // 'monthly' | 'annual' | ...
  price?: number; // major units
  quantity?: number;
};

const purchaseDedupeKey = (tx: string) => `ga4:purchase:${tx}`;

/**
 * Recommended: begin_checkout
 * Use when user starts checkout flow (opens modal, clicks "Continue", etc.)
 */
export const trackBeginCheckout = (payload: {
  currency: string;
  value: number;
  items: Ga4Item[];
  payment_type?: string; // 'paystack' | 'mpesa'
  affiliation?: string;
}) =>
  trackEvent('begin_checkout', {
    currency: payload.currency,
    value: payload.value,
    items: payload.items,
    payment_type: payload.payment_type,
    affiliation: payload.affiliation,
  });

/**
 * Recommended: add_payment_info
 * Use when user selects a payment method or submits payment details.
 */
export const trackAddPaymentInfo = (payload: {
  currency: string;
  value: number;
  items: Ga4Item[];
  payment_type: string; // 'paystack' | 'mpesa'
  affiliation?: string;
}) =>
  trackEvent('add_payment_info', {
    currency: payload.currency,
    value: payload.value,
    items: payload.items,
    payment_type: payload.payment_type,
    affiliation: payload.affiliation,
  });

/**
 * Recommended: purchase (with items[])
 * Fire ONLY after backend confirms payment success.
 * Includes client-side dedupe to avoid double-counting on refresh/callback retries.
 */
export const trackPurchase = (payload: {
  transaction_id: string;
  value: number; // major units
  currency: string; // 'USD' | 'KES' | ...
  items: Ga4Item[];

  affiliation?: string; // e.g. 'DayBreak Learner'
  coupon?: string;
  payment_type?: string; // 'paystack' | 'mpesa'
  org_id?: string | number;
  org_name?: string;
}) => {
  if (!payload?.transaction_id) return;

  // client-side dedupe (refresh/back/callback retries)
  if (typeof window !== 'undefined') {
    const k = purchaseDedupeKey(payload.transaction_id);
    if (sessionStorage.getItem(k) === '1') return;
    sessionStorage.setItem(k, '1');
  }

  trackEvent('purchase', {
    transaction_id: payload.transaction_id,
    value: payload.value,
    currency: payload.currency,
    items: payload.items,

    affiliation: payload.affiliation,
    coupon: payload.coupon,
    payment_type: payload.payment_type,
    org_id: payload.org_id,
    org_name: payload.org_name,
  });
};
