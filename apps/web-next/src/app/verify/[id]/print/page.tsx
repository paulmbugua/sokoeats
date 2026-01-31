import type { Metadata } from 'next';
import VerifyCertificatePrintPage from '@/components/VerifyCertificatePrint.web';
import { siteUrl } from '@/lib/site';

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const certId = params.id;
  const title = certId
    ? `Print Certificate ${certId} | DayBreak`
    : 'Print Certificate | DayBreak';
  const description = 'Print or download a verified DayBreak certificate.';
  const canonical = siteUrl(`/verify/${certId}/print`);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      url: canonical,
      title,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default function VerifyPrintRoute() {
  return <VerifyCertificatePrintPage />;
}
