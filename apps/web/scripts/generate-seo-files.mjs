import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');
const robotsTemplatePath = path.resolve(__dirname, './robots.template.txt');

const rawSiteUrl =
  process.env.VITE_SITE_URL || process.env.SITE_URL || 'https://app.daybreaklearner.com';
const siteUrl = rawSiteUrl ? rawSiteUrl.replace(/\/+$/, '') : '';

if (!siteUrl) {
  console.warn('[seo] Failed to resolve site URL; falling back to app origin in sitemap/robots.');
}

const today = new Date().toISOString().split('T')[0];

const staticRoutes = [
  '/',
  '/find-tutor',
  '/robot-teach',
  '/resources',
  '/courses',
  '/help',
  '/privacy-policy',
  '/terms',
  '/cookie-policy',
  '/refunds',
  '/fulfillment',
  '/anti-spam-policy',
  '/complaints-feedback',
  '/verify',
];

const routeMeta = {
  '/': { changefreq: 'daily', priority: '1.0' },
  '/find-tutor': { changefreq: 'weekly', priority: '0.8' },
  '/robot-teach': { changefreq: 'weekly', priority: '0.7' },
  '/courses': { changefreq: 'weekly', priority: '0.7' },
  '/resources': { changefreq: 'weekly', priority: '0.6' },
  '/help': { changefreq: 'monthly', priority: '0.5' },
  '/verify': { changefreq: 'monthly', priority: '0.4' },
};

const toLoc = (route) => (siteUrl ? `${siteUrl}${route}` : route);

const sitemapEntries = staticRoutes
  .map((route) => {
    const meta = routeMeta[route] || { changefreq: 'monthly', priority: '0.4' };
    return [
      '  <url>',
      `    <loc>${toLoc(route)}</loc>`,
      `    <lastmod>${today}</lastmod>`,
      `    <changefreq>${meta.changefreq}</changefreq>`,
      `    <priority>${meta.priority}</priority>`,
      '  </url>',
    ].join('\n');
  })
  .join('\n');

const sitemapXml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  sitemapEntries,
  '</urlset>',
  '',
].join('\n');

const robotsTemplate = await fs.readFile(robotsTemplatePath, 'utf8');
let robotsTxt = robotsTemplate;

robotsTxt = robotsTemplate.replace(/\{SITE_URL\}/g, siteUrl || 'https://app.daybreaklearner.com');

await fs.mkdir(publicDir, { recursive: true });
await Promise.all([
  fs.writeFile(path.join(publicDir, 'sitemap.xml'), sitemapXml, 'utf8'),
  fs.writeFile(path.join(publicDir, 'robots.txt'), robotsTxt.trimEnd() + '\n', 'utf8'),
]);

console.log('[seo] sitemap.xml and robots.txt generated in', publicDir);
