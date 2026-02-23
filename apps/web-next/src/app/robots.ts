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
          '/robot-teacher',
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
          '/institutions',
          '/oer/',
          '/verify/',
        ],
        disallow: [
          '/app',
          '/api',
          '/org',
          '/org/',
          '/org/login',
          '/org/join',
          '/login',
          '/institutions/login',
          '/profile/me',
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
          '/paystack',
          '/payment',
        ],
      },
    ],
    sitemap: siteUrl('/sitemap.xml'),
  };
}
