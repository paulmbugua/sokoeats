import type { Metadata } from 'next';
import Script from 'next/script';
import { Suspense } from 'react';
import { cookies } from 'next/headers';

import Providers from './providers';
import GaRouteTracker from './_components/GaRouteTracker';

import { isAbsoluteUrl, publicEnv } from '@/lib/env';
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
  description:
    'DayBreak helps learners and institutions with tutors, AI-assisted lessons, and virtual classroom workflows.',
  alternates: {
    canonical: siteUrl('/'),
  },
  icons: {
    icon: 'https://www.daybreaklearner.com/favicon.ico',
  },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'DayBreak',
    images: [{ url: isAbsoluteUrl(publicEnv.ogImage) ? publicEnv.ogImage : siteUrl(publicEnv.ogImage) }],
  },
  twitter: {
    card: 'summary_large_image',
    images: [isAbsoluteUrl(publicEnv.ogImage) ? publicEnv.ogImage : siteUrl(publicEnv.ogImage)],
  },
};

export const viewport = {
  themeColor: '#111827',
};

const resolveInitialTheme = async () => {
  const cookieStore = await cookies();
  const cookieTheme = cookieStore.get('theme')?.value;
  return cookieTheme === 'dark' ? 'dark' : 'light';
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const gaId = publicEnv.ga4MeasurementId;
  const isDev = process.env.NODE_ENV !== 'production';
  const initialTheme = await resolveInitialTheme();

  return (
    <html lang="en" className={initialTheme === 'dark' ? 'dark' : undefined}>
      <head>
        {gaId ? (
          <>
            <Script
              id="ga4-script"
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`
    window.dataLayer = window.dataLayer || [];
    function gtag(){window.dataLayer.push(arguments);}
    window.gtag = gtag;
    gtag('js', new Date());

    var gaDebug = ${isDev ? 'true' : 'false'} && new URLSearchParams(window.location.search).has('ga_debug');

    gtag('config', '${gaId}', { send_page_view: false, debug_mode: gaDebug });
  `}
            </Script>
          </>
        ) : null}
      </head>

      <body>
        <Providers initialTheme={initialTheme}>
          <Suspense fallback={null}>
            <GaRouteTracker />
          </Suspense>

          <NavbarLegacy />
          {children}
          <FooterLegacy />
        </Providers>
      </body>
    </html>
  );
}
