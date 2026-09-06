import type { Metadata, Viewport } from 'next';
import '../src/styles.css';
import '../src/account.css';
import '../src/PartnerPortal.css';
import '../src/Pricing.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://sokoeats.co.ke';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'SokoEats | Delivery from trusted Kenyan businesses',
    template: '%s | SokoEats',
  },
  description: 'Order meals, groceries, medicine, cooking gas and electronics from trusted shops near you.',
  applicationName: 'SokoEats',
  alternates: { canonical: '/' },
  icons: {
    icon: '/favicon.png',
    apple: '/logo.png',
  },
  openGraph: {
    type: 'website',
    locale: 'en_KE',
    url: '/',
    siteName: 'SokoEats',
    title: 'SokoEats | Everything you need, delivered',
    description: 'Shop trusted Kenyan restaurants, stores and essential-service merchants.',
    images: [{ url: '/logo.png', width: 1024, height: 1024, alt: 'SokoEats' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SokoEats',
    description: 'Everything you need, delivered.',
    images: ['/logo.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#173f2f',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-KE">
      <body>{children}</body>
    </html>
  );
}
