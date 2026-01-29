import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/robot-teach',
          '/find-tutor',
          '/resources',
          '/courses',
          '/help',
          '/profile/',
          '/oer/',
          '/verify/',
        ],
        disallow: [
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
