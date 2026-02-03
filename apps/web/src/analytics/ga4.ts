const GA4_MEASUREMENT_ID = import.meta.env.VITE_GA4_MEASUREMENT_ID as string | undefined;

const hasWindow = () => typeof window !== 'undefined';

let initialized = false;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: any[]) => void;
  }
}

const ensureGtag = () => {
  if (!hasWindow()) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    ((...args: any[]) => {
      window.dataLayer?.push(args);
    });
};

export const initGA4 = () => {
  if (!GA4_MEASUREMENT_ID || !hasWindow()) return;
  if (initialized) return;
  initialized = true;

  ensureGtag();

  if (!document.getElementById('ga4-gtag')) {
    const script = document.createElement('script');
    script.id = 'ga4-gtag';
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`;
    document.head.appendChild(script);
  }

  window.gtag?.('js', new Date());
  window.gtag?.('config', GA4_MEASUREMENT_ID, { send_page_view: false });
};

export const trackPageView = (path: string) => {
  if (!GA4_MEASUREMENT_ID || !hasWindow()) return;
  ensureGtag();
  window.gtag?.('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
};

export const trackEvent = (name: string, params: Record<string, any> = {}) => {
  if (!GA4_MEASUREMENT_ID || !hasWindow()) return;
  ensureGtag();
  window.gtag?.('event', name, params);
};
