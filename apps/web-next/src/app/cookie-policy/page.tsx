import type { Metadata } from 'next';
import { Suspense } from 'react';
import CookiePolicy from '@/legacy-pages/CookiePolicy.web';
import { siteUrl } from '@/lib/site';

const title = 'Cookie Policy | DayBreak';
const description = 'Understand how DayBreak uses cookies and similar technologies.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: siteUrl('/cookie-policy') },
  openGraph: {
    type: 'website',
    url: siteUrl('/cookie-policy'),
    title,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export default function CookiePolicyPage() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
      <CookiePolicy />
    </Suspense>
  );
}
