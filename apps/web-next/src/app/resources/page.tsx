import type { Metadata } from 'next';
import TrustBlock from '@/components/TrustBlock';
import StablePageShell from '@/components/layout/StablePageShell';
import { siteUrl } from '@/lib/site';
import ResourcesClient from './ResourcesClient';

const title = 'Resources | DayBreak';
const description = 'Browse tutor-led courses and free OER books.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: siteUrl('/resources') },
  openGraph: { type: 'website', url: siteUrl('/resources'), title, description },
  twitter: { card: 'summary_large_image', title, description },
};

export default function ResourcesPage() {
  return (
    <StablePageShell>
      <div className="px-4 pb-10 pt-4">
        <ResourcesClient />
        <TrustBlock />
      </div>
    </StablePageShell>
  );
}
