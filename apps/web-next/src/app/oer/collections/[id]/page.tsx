import Script from 'next/script';
import type { Metadata } from 'next';
import OerCollectionReader from '@/pages/OerCollectionReader.web';
import { siteUrl } from '@/lib/site';

type CollectionMeta = {
  title?: string;
  provider?: string;
};

const pickCollection = (payload: any): CollectionMeta | null => {
  if (!payload) return null;
  if (payload?.title || payload?.name) {
    return { title: payload.title || payload.name, provider: payload.provider || payload.origin };
  }
  const items = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data?.items)
        ? payload.data.items
        : [];
  const first = items.find((it: any) => it?.title || it?.name);
  if (!first) return null;
  return { title: first.title || first.name, provider: first.provider || first.origin };
};

async function fetchCollectionMeta(id: string) {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) return null;
  const base = backendUrl.replace(/\/+$/, '');
  const endpoints = [
    `${base}/api/oer/collections/${encodeURIComponent(id)}`,
    `${base}/api/oer/collections/by-slug/${encodeURIComponent(id)}`,
    `${base}/api/oer/collections/${encodeURIComponent(id)}/items`,
    `${base}/api/oer/collections/by-slug/${encodeURIComponent(id)}/items`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { next: { revalidate: 600 } });
      if (!res.ok) continue;
      const data = await res.json();
      const meta = pickCollection(data);
      if (meta?.title) return meta;
    } catch {
      // ignore
    }
  }
  return null;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const meta = await fetchCollectionMeta(params.id);
  const title = meta?.title
    ? `OER Collection: ${meta.title} | DayBreak`
    : 'OER Collection | DayBreak';
  const description = meta?.provider
    ? `Explore open educational resources from ${meta.provider}.`
    : 'Explore open educational resources and collections on DayBreak.';
  const canonical = siteUrl(`/oer/collections/${params.id}`);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'article',
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

export default async function OerCollectionRoute({ params }: { params: { id: string } }) {
  const meta = await fetchCollectionMeta(params.id);
  const jsonLd = meta?.title
    ? {
        '@context': 'https://schema.org',
        '@type': 'CreativeWork',
        name: meta.title,
        url: siteUrl(`/oer/collections/${params.id}`),
        publisher: meta.provider
          ? { '@type': 'Organization', name: meta.provider }
          : undefined,
      }
    : {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Open Educational Resources Collection',
        description: 'Explore open educational resources and collections on DayBreak.',
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
