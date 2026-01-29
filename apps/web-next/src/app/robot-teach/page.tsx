import Script from 'next/script';
import type { Metadata } from 'next';
import RobotTeachAdLanding from '@/pages/RobotTeachAdLanding.web';
import { siteUrl } from '@/lib/site';

const title = 'AI Robot Teacher — Learn Faster With Instant Feedback | DayBreak';
const description =
  'Learn faster with instant lessons, quizzes, and feedback from the AI Robot Teacher — plus expert tutor support whenever you need it.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: siteUrl('/robot-teach') },
  openGraph: {
    type: 'website',
    url: siteUrl('/robot-teach'),
    title,
    description,
    images: [
      process.env.NEXT_PUBLIC_HERO_BG ||
        'https://lh3.googleusercontent.com/aida-public/AB6AXuBgvEqh6MrQ7dVW2qwj-qjGCafebAnWEjA7iwu4aBwvJfiAvneGQcD6xH14zDIWcFdHIVF1yUOtvsMVPHKrnuxAXdqlOKj_Gbf_VBvdobGFojOpO0seljMPOx0GUF1LSkYcCU8Gd_0jz1BC4GkilnIWIs9ZGuqzsN4pO4t8xzWY2uouVckDUvvqonRhWPECRGpV5W0kGh3MF3FPXFtbXyU0DuxtazBEu50XMuUrx4CovU0y47zF1YjXjrNQg6DUZcEu_uJ1um9oLpY',
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [
      process.env.NEXT_PUBLIC_HERO_BG ||
        'https://lh3.googleusercontent.com/aida-public/AB6AXuBgvEqh6MrQ7dVW2qwj-qjGCafebAnWEjA7iwu4aBwvJfiAvneGQcD6xH14zDIWcFdHIVF1yUOtvsMVPHKrnuxAXdqlOKj_Gbf_VBvdobGFojOpO0seljMPOx0GUF1LSkYcCU8Gd_0jz1BC4GkilnIWIs9ZGuqzsN4pO4t8xzWY2uouVckDUvvqonRhWPECRGpV5W0kGh3MF3FPXFtbXyU0DuxtazBEu50XMuUrx4CovU0y47zF1YjXjrNQg6DUZcEu_uJ1um9oLpY',
    ],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'AI Robot Teacher by DayBreak',
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Web',
  url: siteUrl('/robot-teach'),
  description,
  featureList: [
    'Goal-based lessons and quizzes',
    'Instant feedback and explanations',
    'Progress tracking',
    'Tutor support when needed',
  ],
  provider: {
    '@type': 'EducationalOrganization',
    name: 'DayBreak',
    url: siteUrl('/'),
  },
};

export default function RobotTeachPage() {
  return (
    <>
      <RobotTeachAdLanding />
      <Script
        id="ld-robot-teach"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
