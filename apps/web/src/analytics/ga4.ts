import { initGa4, trackEvent as trackEventBase, trackOnce } from '@mytutorapp/shared/analytics/ga4';

const GA4_MEASUREMENT_ID = import.meta.env.VITE_GA4_MEASUREMENT_ID as string | undefined;
const hasDebugFlag = () =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('ga_debug');
const isDebug = () => import.meta.env.DEV || hasDebugFlag();

const opts = () => ({ measurementId: GA4_MEASUREMENT_ID, debugMode: isDebug() });


const ensureGaScript = (measurementId?: string) => {
  if (!measurementId || typeof document === 'undefined') return;
  if (document.querySelector(`script[src="https://www.googletagmanager.com/gtag/js?id=${measurementId}"]`)) {
    return;
  }

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  script.setAttribute('data-ga4-loader', 'web-standalone');
  document.head.appendChild(script);
};
export const initGA4 = () => {
  ensureGaScript(GA4_MEASUREMENT_ID);
  initGa4(opts());
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

export const trackAddPaymentInfo = (payload: {
  currency: string;
  value: number;
  items: Ga4Item[];
  payment_type: string;
  affiliation?: string;
}) =>
  trackEvent('add_payment_info', {
    currency: payload.currency,
    value: payload.value,
    items: payload.items,
    payment_type: payload.payment_type,
    affiliation: payload.affiliation,
  });

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
  if (!payload?.transaction_id) return;
  trackOnce(
    'purchase',
    payload,
    `purchase:${String(payload.transaction_id)}`,
    opts()
  );
};

export const trackStartCourse = (payload: {
  course_id: string | number;
  course_title?: string;
  source?: string;
  is_ai?: boolean;
}) => trackEvent('start_course', payload);

export const trackAiGenerateLesson = (payload: {
  course_id?: string | number;
  course_title?: string;
  lesson_id?: string | number;
  language?: string;
  voice?: string;
  mode?: 'robot_teacher' | 'language_learning' | 'course_progress';
}) => trackEvent('ai_generate_lesson', payload);
