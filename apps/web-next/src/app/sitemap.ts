import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const routes = [
    '/',
    '/robot-teach',
    '/find-tutor',
    '/resources',
    '/courses',
    '/help',
    '/verify',
  ];

  return routes.map((path) => ({
    url: siteUrl(path),
    lastModified,
    changeFrequency: 'weekly',
    priority: path === '/' ? 1 : 0.7,
  }));
}
