import { publicEnv } from '@/lib/env';

const GA4_MEASUREMENT_ID = publicEnv.ga4MeasurementId || undefined;

const hasWindow = () => typeof window !== 'undefined';

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

// In web-next, gtag.js is loaded in RootLayout via <Script>.
// So here we only *send* events safely.
const canSend = () =>
  Boolean(GA4_MEASUREMENT_ID) && hasWindow() && typeof window.gtag === 'function';

export const initGA4 = () => {
  // no-op on purpose (RootLayout owns init)
  return;
};

export const trackPageView = (path: string) => {
  if (!canSend()) return;

  window.gtag?.('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
};

export const trackEvent = (name: string, params: Record<string, any> = {}) => {
  if (!canSend()) return;

  window.gtag?.('event', name, params);
};
