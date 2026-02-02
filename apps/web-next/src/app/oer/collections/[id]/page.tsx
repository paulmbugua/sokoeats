import Script from 'next/script';
import type { Metadata } from 'next';
import OerCollectionReader from '@/legacy-pages/OerCollectionReader.web';
import { siteUrl } from '@/lib/site';

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const title = `OER Collection ${params.id} | DayBreak`;
  const description = 'Explore curated open educational resource collections on DayBreak.';
  const canonical = siteUrl(`/oer/collections/${params.id}`);

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

export default function OerCollectionRoute({ params }: { params: { id: string } }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `OER Collection ${params.id}`,
    url: siteUrl(`/oer/collections/${params.id}`),
  };

  return (
    <>
      <OerCollectionReader />
      <Script
        id="ld-oer-collection"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
