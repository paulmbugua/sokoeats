import type { Metadata } from 'next';
import FulfillmentPolicy from '@/pages/FulfillmentPolicy';
import { siteUrl } from '@/lib/site';

const title = 'Fulfillment & Delivery | DayBreak';
const description = 'Details on fulfillment timelines and delivery policies for DayBreak services.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: siteUrl('/fulfillment') },
  openGraph: {
    type: 'website',
    url: siteUrl('/fulfillment'),
    title,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export default function FulfillmentPage() {
  return <FulfillmentPolicy />;
}
