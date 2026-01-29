import Script from 'next/script';
import type { Metadata } from 'next';
import OerReaderFull from '@/pages/OerReaderFull.web';
import { siteUrl } from '@/lib/site';

type OerItem = {
  title?: string;
  provider?: string;
  web_url?: string;
  html_url?: string;
  file_url?: string;
  pdf_url?: string;
  source_url?: string;
  url?: string;
};

const pickTitle = (payload: any): OerItem | null => {
  if (!payload) return null;
  const directUrl = payload?.web_url || payload?.html_url || payload?.file_url || payload?.pdf_url;
  if (directUrl) {
    return {
      title: payload?.title || payload?.name,
      provider: payload?.provider || payload?.origin,
      web_url: directUrl,
    };
  }
  const items = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data?.items)
        ? payload.data.items
        : [];
  const first = items.find((it: any) => it?.title || it?.name || it?.web_url || it?.html_url || it?.pdf_url);
  if (!first) return null;
  return {
    title: first.title || first.name,
    provider: first.provider || first.origin,
    web_url: first.web_url || first.html_url || first.pdf_url || first.file_url || first.source_url || first.url,
  };
};

async function fetchOerMeta(id: string) {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) return null;
  const base = backendUrl.replace(/\/+$/, '');
  const endpoints = [
    `${base}/api/oer/books/${encodeURIComponent(id)}`,
    `${base}/api/oer/books/by-slug/${encodeURIComponent(id)}`,
    `${base}/api/oer/collections/${encodeURIComponent(id)}/items`,
    `${base}/api/oer/collections/by-slug/${encodeURIComponent(id)}/items`,
    `${base}/api/oer/items?collection=${encodeURIComponent(id)}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { next: { revalidate: 600 } });
      if (!res.ok) continue;
      const data = await res.json();
      const item = pickTitle(data);
      if (item?.title) return item;
    } catch {
      // ignore
    }
  }
  return null;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const meta = await fetchOerMeta(params.id);
  const title = meta?.title
    ? `Open Educational Resource: ${meta.title} | DayBreak`
    : 'Open Educational Resource | DayBreak';
  const description = meta?.provider
    ? `Read open educational content from ${meta.provider} on DayBreak.`
    : 'Read open educational content and materials on DayBreak.';
  const canonical = siteUrl(`/oer/${params.id}`);

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

export default async function OerRoute({ params }: { params: { id: string } }) {
  const meta = await fetchOerMeta(params.id);
  const jsonLd = meta?.title
    ? {
        '@context': 'https://schema.org',
        '@type': 'CreativeWork',
        name: meta.title,
        url: meta.web_url || siteUrl(`/oer/${params.id}`),
        publisher: meta.provider
          ? { '@type': 'Organization', name: meta.provider }
          : undefined,
      }
    : {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Open Educational Resource',
        description: 'Read open educational content and materials on DayBreak.',
        url: siteUrl(`/oer/${params.id}`),
      };

  return (
    <>
      <OerReaderFull />
      <Script
        id="ld-oer"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
