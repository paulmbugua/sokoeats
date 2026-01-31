import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const routes = [
    '/',
    '/robot-teach',
    '/robot-teach/start',
    '/ai-robot-teacher',
    '/find-tutor',
    '/resources',
    '/courses',
    '/help',
    '/verify',
    '/privacy-policy',
    '/terms',
    '/cookie-policy',
    '/anti-spam-policy',
    '/complaints-feedback',
    '/refunds',
    '/fulfillment',
    '/payment-flow',
    '/unsubscribe',
  ];

  return routes.map((path) => ({
    url: siteUrl(path),
    lastModified,
    changeFrequency: 'weekly',
    priority: path === '/' ? 1 : 0.7,
  }));
}
