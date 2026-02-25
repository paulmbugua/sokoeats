import Script from 'next/script';
import type { Metadata } from 'next';
import PaymentFlow from '@/legacy-pages/PaymentFlow';
import { siteUrl } from '@/lib/site';

const title = 'How Payments Work | DayBreak';
const description = 'Learn how DayBreak payments, tokens, and billing flows work.';

const paymentFlowJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'DayBreak Learning Credits',
  description,
  brand: {
    '@type': 'Brand',
    name: 'DayBreak',
  },
  url: siteUrl('/payment-flow'),
  offers: {
    '@type': 'Offer',
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock',
    url: siteUrl('/payment-flow'),
  },
};

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: siteUrl('/payment-flow') },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    url: siteUrl('/payment-flow'),
    title,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export default function PaymentFlowPage() {
  return (
    <>
      <PaymentFlow />
      <Script
        id="ld-payment-flow-product"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(paymentFlowJsonLd) }}
      />
    </>
  );
}
