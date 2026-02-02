import type { Metadata } from 'next';
import HelpPage from '@/legacy-pages/HelpPage.web';
import { siteUrl } from '@/lib/site';

const title = 'Help, FAQ & Support — DayBreak';
const description = 'Get help, browse FAQs, and contact DayBreak support for learning and tutoring questions.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: siteUrl('/help') },
  openGraph: {
    type: 'website',
    url: siteUrl('/help'),
    title,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export default function HelpRoute() {
  return <HelpPage />;
}
