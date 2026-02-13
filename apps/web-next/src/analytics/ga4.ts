import { trackEvent as trackEventBase, trackOnce } from '@mytutorapp/shared/analytics/ga4';
import { publicEnv } from '@/lib/env';

const hasDebugFlag = () =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('ga_debug');
const isDebug = () => process.env.NODE_ENV !== 'production' || hasDebugFlag();
const opts = () => ({ measurementId: publicEnv.ga4MeasurementId || undefined, debugMode: isDebug() });

export const initGA4 = () => {
  // RootLayout owns GA script + config.
};

let lastPvKey = '';
let lastPvAt = 0;

export const trackPageView = (path: string) => {
  const key = `${path}|${typeof window !== 'undefined' ? window.location.href : ''}|${typeof document !== 'undefined' ? document.title : ''}`;
  const now = Date.now();
  if (key === lastPvKey && now - lastPvAt < 1500) return;
  lastPvKey = key;
  lastPvAt = now;

  trackEventBase(
    'page_view',
    {
      page_path: path,
      page_location: typeof window !== 'undefined' ? window.location.href : undefined,
      page_title: typeof document !== 'undefined' ? document.title : undefined,
    },
    opts()
  );
};

export const trackEvent = (name: string, params: Record<string, any> = {}) =>
  trackEventBase(name, params, opts());

export type LoginMethod = 'email' | 'google';

export const trackLogin = (method: LoginMethod, extra: Record<string, any> = {}) =>
  trackEvent('login', { method, ...extra });

export const trackSignUp = (method: LoginMethod, extra: Record<string, any> = {}) => {
  const key = extra.user_id || extra.email_hash || extra.dedupe_key;
  if (!key) return;
  trackOnce('sign_up', { method, ...extra }, `signup:${String(key)}`, opts());
};

export type Ga4Item = {
  item_id: string;
  item_name: string;
  item_category?: string;
  item_variant?: string;
  price?: number;
  quantity?: number;
};

export const trackBeginCheckout = (payload: {
  currency: string;
  value: number;
  items: Ga4Item[];
  payment_type?: string;
  affiliation?: string;
  checkout_session_id?: string;
  cart_signature?: string;
}) => {
  const key = payload.checkout_session_id || payload.cart_signature;
  if (!key) return;
  trackOnce(
    'begin_checkout',
    {
      currency: payload.currency,
      value: payload.value,
      items: payload.items,
      payment_type: payload.payment_type,
      affiliation: payload.affiliation,
    },
    `checkout:${String(key)}`,
    opts()
  );
};

export const trackPurchase = (payload: {
  transaction_id: string;
  value: number;
  currency: string;
  items: Ga4Item[];
  affiliation?: string;
  coupon?: string;
  payment_type?: string;
}) => {
  if (!payload?.transaction_id) return;
  trackOnce('purchase', payload, `purchase:${String(payload.transaction_id)}`, opts());
};
