import type { Metadata } from 'next';
import Script from 'next/script';
import Providers from './providers';
import AnalyticsTracker from './Analytics';
import { publicEnv } from '@/lib/env';
import { SITE_URL, siteUrl } from '@/lib/site';
import NavbarLegacy from '@/components/legacy/Navbar.web';
import FooterLegacy from '@/components/legacy/Footer.web';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'DayBreak Learner',
    template: '%s | DayBreak',
  },
  icons: {
    icon: 'https://www.daybreaklearner.com/favicon.ico',
  },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'DayBreak',
    images: [{ url: siteUrl(publicEnv.ogImage) }],
  },
  twitter: {
    card: 'summary_large_image',
    images: [siteUrl(publicEnv.ogImage)],
  },
};

export const viewport = {
  themeColor: '#111827',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const gaId = publicEnv.ga4MeasurementId;

  return (
    <html lang="en">
      <head>
        {gaId ? (
          <>
            <Script
              id="ga4-script"
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];\nfunction gtag(){dataLayer.push(arguments);}\ngtag('js', new Date());\ngtag('config', '${gaId}', { send_page_view: false });`}
            </Script>
          </>
        ) : null}
      </head>
      <body>
        <Providers>
          <AnalyticsTracker />
          <NavbarLegacy />
          {children}
          <FooterLegacy />
        </Providers>
      </body>
    </html>
  );
}
