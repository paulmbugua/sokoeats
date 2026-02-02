const trimEnv = (value?: string) => (value ?? '').trim();

export const publicEnv = {
  siteUrl: trimEnv(process.env.NEXT_PUBLIC_SITE_URL) || 'https://www.daybreaklearner.com',
  backendUrl: trimEnv(process.env.NEXT_PUBLIC_BACKEND_URL),
  appOrigin:
    trimEnv(process.env.NEXT_PUBLIC_APP_ORIGIN) ||
    trimEnv(process.env.NEXT_PUBLIC_LEGACY_APP_ORIGIN),
  legacyAppOrigin: trimEnv(process.env.NEXT_PUBLIC_LEGACY_APP_ORIGIN),
  ga4MeasurementId: trimEnv(process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID),
  heroBg: trimEnv(process.env.NEXT_PUBLIC_HERO_BG),
  landingBg: trimEnv(process.env.NEXT_PUBLIC_LANDING_BG),
  // TODO: add /public/og/default.png in web-next and switch to that local path.
  ogImage:
    trimEnv(process.env.NEXT_PUBLIC_OG_IMAGE) ||
    'https://lh3.googleusercontent.com/aida-public/AB6AXuBgvEqh6MrQ7dVW2qwj-qjGCafebAnWEjA7iwu4aBwvJfiAvneGQcD6xH14zDIWcFdHIVF1yUOtvsMVPHKrnuxAXdqlOKj_Gbf_VBvdobGFojOpO0seljMPOx0GUF1LSkYcCU8Gd_0jz1BC4GkilnIWIs9ZGuqzsN4pO4t8xzWY2uouVckDUvvqonRhWPECRGpV5W0kGh3MF3FPXFtbXyU0DuxtazBEu50XMuUrx4CovU0y47zF1YjXjrNQg6DUZcEu_uJ1um9oLpY',
  playStoreBadgeUrl: trimEnv(process.env.NEXT_PUBLIC_PLAY_STORE_BADGE_URL),
};

export const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);
