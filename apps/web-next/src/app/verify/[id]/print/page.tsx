import type { Metadata } from 'next';
import VerifyCertificatePrintPage from '@/components/VerifyCertificatePrint.web';
import { siteUrl } from '@/lib/site';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const canonical = siteUrl(`/verify/${params.id}/print`);
  return {
    title: params.id
      ? `Verify Certificate ${params.id} (Print) | DayBreak`
      : 'Verify Certificate (Print) | DayBreak',
    description: 'Print-friendly certificate verification view.',
    alternates: { canonical },
    robots: { index: false, follow: false },
  };
}

export default function VerifyPrint() {
  return <VerifyCertificatePrintPage />;
}
