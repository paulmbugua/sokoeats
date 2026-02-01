import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/find-tutor',
          '/resources',
          '/courses',
          '/help',
          '/privacy-policy',
          '/terms',
          '/cookie-policy',
          '/anti-spam-policy',
          '/complaints-feedback',
          '/refunds',
          '/fulfillment',
          '/payment-flow',
          '/unsubscribe',
          '/profile/',
          '/oer/',
          '/verify/',
        ],
        disallow: [
          '/app',
          '/org',
          '/org/',
          '/account',
          '/messages',
          '/settings',
          '/class-vault',
          '/my-courses',
          '/create-course',
          '/enroll',
          '/progress',
          '/results',
          '/achievements',
          '/language',
        ],
      },
    ],
    sitemap: siteUrl('/sitemap.xml'),
  };
}
