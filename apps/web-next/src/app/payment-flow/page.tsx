import type { Metadata } from 'next';
import PaymentFlow from '@/legacy-pages/PaymentFlow';
import { siteUrl } from '@/lib/site';

const title = 'How Payments Work | DayBreak';
const description = 'Learn how DayBreak payments, tokens, and billing flows work.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: siteUrl('/payment-flow') },
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
  return <PaymentFlow />;
}
