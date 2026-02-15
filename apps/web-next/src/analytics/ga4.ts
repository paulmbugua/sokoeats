import { trackEvent as trackEventBase, trackOnce } from '@mytutorapp/shared/analytics/ga4';
import { publicEnv } from '@/lib/env';

const hasDebugFlag = () =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('ga_debug');
const isDebug = () => process.env.NODE_ENV !== 'production' || hasDebugFlag();
const opts = () => ({ measurementId: publicEnv.ga4MeasurementId || undefined, debugMode: isDebug() });

const isClient = () => typeof window !== 'undefined';

const devTrace = (eventName: string, dedupeKey: string | undefined, params: Record<string, any>) => {
  if (process.env.NODE_ENV === 'production') return;
  if (!isClient()) return;
  // eslint-disable-next-line no-console
  console.info('[ga4]', eventName, { dedupeKey, params });
};

export const initGA4 = () => {
  // RootLayout owns GA script + config.
};

let lastPvKey = '';
let lastPvAt = 0;

export const trackPageView = (path: string) => {
  if (!isClient()) return;
  const key = `${path}|${window.location.href}|${typeof document !== 'undefined' ? document.title : ''}`;
  const now = Date.now();
  if (key === lastPvKey && now - lastPvAt < 1500) return;
  lastPvKey = key;
  lastPvAt = now;

  trackEventBase(
    'page_view',
    {
      page_path: path,
      page_location: window.location.href,
      page_title: typeof document !== 'undefined' ? document.title : undefined,
    },
    opts()
  );
};

export const trackEvent = (name: string, params: Record<string, any> = {}) => {
  if (!isClient()) return;
  trackEventBase(name, params, opts());
};

export type LoginMethod = 'email' | 'google' | 'institution';

export const trackLogin = (method: LoginMethod, extra: Record<string, any> = {}) =>
  trackEvent('login', { method, ...extra });

export const trackSignUp = (method: LoginMethod, extra: Record<string, any> = {}) => {
  if (!isClient()) return;
  const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
  const key = extra.user_id || extra.email_hash || extra.dedupe_key || `signup_success:${bucket}`;
  if (!key) return;
  devTrace('sign_up', `signup:${String(key)}`, { method, ...extra });
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
  if (!isClient()) return;
  const key = payload.checkout_session_id || payload.cart_signature;
  if (!key) return;
  devTrace('begin_checkout', `checkout:${String(key)}`, payload);
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
  org_id?: string | number;
  org_name?: string;
}) => {
  if (!isClient()) return;
  if (!payload?.transaction_id) return;
  devTrace('purchase', `purchase:${String(payload.transaction_id)}`, payload);
  trackOnce('purchase', payload, `purchase:${String(payload.transaction_id)}`, opts());
};
