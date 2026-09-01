import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://sokoeats.co.ke';
  return [{ url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1 }];
}
