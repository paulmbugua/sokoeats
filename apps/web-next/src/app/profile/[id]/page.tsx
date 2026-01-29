import type { Metadata } from 'next';
import ProfileDetailPage from '@/pages/ProfileDetailPage.web';
import { siteUrl } from '@/lib/site';

const descriptionFallback =
  'View tutor expertise, languages, ratings, and availability to find the right match.';

async function fetchProfileName(id: string) {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) return null;
  const base = backendUrl.replace(/\/+$/, '');
  const endpoints = [
    `${base}/api/profile/user/${encodeURIComponent(id)}`,
    `${base}/api/profile/${encodeURIComponent(id)}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { next: { revalidate: 600 } });
      if (!res.ok) continue;
      const data = (await res.json()) as { name?: string };
      if (data?.name) return data.name;
    } catch {
      // ignore
    }
  }
  return null;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const name = await fetchProfileName(params.id);
  const title = name ? `Tutor Profile: ${name} | DayBreak` : 'Tutor Profile | DayBreak';
  const description = descriptionFallback;
  const canonical = siteUrl(`/profile/${params.id}`);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'profile',
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

export default function ProfileRoute() {
  return <ProfileDetailPage />;
}
