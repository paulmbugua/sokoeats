import React from 'react';
import { Helmet } from 'react-helmet-async';

const SITE_URL = import.meta.env.VITE_SITE_URL ?? '';
const HERO_BG = import.meta.env.VITE_HERO_BG ?? '';
const BRAND = 'DayBreak';
const FALLBACK_OG_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBgvEqh6MrQ7dVW2qwj-qjGCafebAnWEjA7iwu4aBwvJfiAvneGQcD6xH14zDIWcFdHIVF1yUOtvsMVPHKrnuxAXdqlOKj_Gbf_VBvdobGFojOpO0seljMPOx0GUF1LSkYcCU8Gd_0jz1BC4GkilnIWIs9ZGuqzsN4pO4t8xzWY2uouVckDUvvqonRhWPECRGpV5W0kGh3MF3FPXFtbXyU0DuxtazBEu50XMuUrx4CovU0y47zF1YjXjrNQg6DUZcEu_uJ1um9oLpY';

export type SeoHeadProps = {
  title: string;
  description?: string;
  canonicalPath?: string;
  robots?: string;
  ogImage?: string;
  ogType?: string;
  noindex?: boolean;
  jsonLd?: object[];
  preloadImage?: string;
};

const DEFAULT_ROBOTS = 'index, follow, max-image-preview:large';
const DEFAULT_GOOGLEBOT = 'index, follow, max-snippet:-1, max-image-preview:large';

const buildCanonicalUrl = (canonicalPath?: string) => {
  if (SITE_URL && canonicalPath) {
    return `${SITE_URL}${canonicalPath}`;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${window.location.pathname}`;
  }
  return undefined;
};

const SeoHead: React.FC<SeoHeadProps> = ({
  title,
  description,
  canonicalPath,
  robots,
  ogImage,
  ogType = 'website',
  noindex = false,
  jsonLd,
  preloadImage,
}) => {
  const canonicalUrl = buildCanonicalUrl(canonicalPath);
  const robotsValue = noindex ? 'noindex, nofollow' : robots ?? DEFAULT_ROBOTS;
  const googlebotValue = noindex ? 'noindex, nofollow' : robots ?? DEFAULT_GOOGLEBOT;

  const resolvedOgImage = ogImage || HERO_BG || FALLBACK_OG_IMAGE;

  return (
    <Helmet>
      <title>{title}</title>
      {description ? <meta name="description" content={description} /> : null}
      {canonicalUrl ? <link rel="canonical" href={canonicalUrl} /> : null}
      <meta name="robots" content={robotsValue} />
      <meta name="googlebot" content={googlebotValue} />

      {/* Open Graph */}
      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content={BRAND} />
      <meta property="og:title" content={title} />
      {description ? <meta property="og:description" content={description} /> : null}
      {canonicalUrl ? <meta property="og:url" content={canonicalUrl} /> : null}
      <meta property="og:locale" content="en_US" />
      <meta property="og:image" content={resolvedOgImage} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      {description ? <meta name="twitter:description" content={description} /> : null}
      <meta name="twitter:image" content={resolvedOgImage} />

      {preloadImage ? (
        <link rel="preload" as="image" href={preloadImage} fetchPriority="high" />
      ) : null}

      {Array.isArray(jsonLd)
        ? jsonLd.map((entry, index) => (
            <script key={index} type="application/ld+json">
              {JSON.stringify(entry)}
            </script>
          ))
        : null}

      <meta name="theme-color" content="#111827" />
    </Helmet>
  );
};

export default SeoHead;
