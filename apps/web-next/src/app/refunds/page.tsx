import type { Metadata } from 'next';
import RefundsAndCancellations from '@/pages/RefundsAndCancellations';
import { siteUrl } from '@/lib/site';

const title = 'Refunds & Cancellations | DayBreak';
const description = 'Understand refund eligibility, cancellations, and DayBreak’s policy details.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: siteUrl('/refunds') },
  openGraph: {
    type: 'website',
    url: siteUrl('/refunds'),
    title,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export default function RefundsPage() {
  return <RefundsAndCancellations />;
}
