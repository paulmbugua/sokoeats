import { publicEnv, isAbsoluteUrl } from './env';
import { BRAND_NAME, SITE_URL, siteUrl } from './site';

export const landingTitle =
  `AI Learning for Individuals & Institutions | ${BRAND_NAME} — Expert Tutors & E-Learning Platform`;

export const landingDescription =
  'DayBreak powers AI learning for individuals and institutions. Book tutors, run virtual classrooms, publish exam results, share report cards and class reports, and manage assignments and AI-assisted marks entry with an enterprise-ready E-Learning platform.';

const fallbackOgImage =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBgvEqh6MrQ7dVW2qwj-qjGCafebAnWEjA7iwu4aBwvJfiAvneGQcD6xH14zDIWcFdHIVF1yUOtvsMVPHKrnuxAXdqlOKj_Gbf_VBvdobGFojOpO0seljMPOx0GUF1LSkYcCU8Gd_0jz1BC4GkilnIWIs9ZGuqzsN4pO4t8xzWY2uouVckDUvvqonRhWPECRGpV5W0kGh3MF3FPXFtbXyU0DuxtazBEu50XMuUrx4CovU0y47zF1YjXjrNQg6DUZcEu_uJ1um9oLpY';
const ogImage = publicEnv.heroBg || publicEnv.ogImage || fallbackOgImage;

export const landingOgImage = isAbsoluteUrl(ogImage) ? ogImage : siteUrl(ogImage);

export const landingJsonLd = {
  organization: {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: BRAND_NAME,
    url: SITE_URL || undefined,
    logo:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBgvEqh6MrQ7dVW2qwj-qjGCafebAnWEjA7iwu4aBwvJfiAvneGQcD6xH14zDIWcFdHIVF1yUOtvsMVPHtbXyU0DuxtazBEu50XMuUrx4CovU0y47zF1YjXjrNQg6DUZcEu_uJ1um9oLpY',
    sameAs: [],
    slogan: 'Learn anything with AI & expert tutors',
    areaServed: 'Worldwide',
  },
  website: {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: `${BRAND_NAME} – AI Learning & Expert Tutors`,
    url: SITE_URL || undefined,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/search?q={query}`,
      'query-input': 'required name=query',
    },
  },
  howTo: {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'Get started with DayBreak in 3 steps',
    description:
      'Tell us your goal, match with a tutor, then learn & iterate with AI-powered feedback.',
    step: [
      {
        '@type': 'HowToStep',
        name: 'Tell us your goal',
        text: 'Pick subject, level, and schedule preferences.',
      },
      {
        '@type': 'HowToStep',
        name: 'Match with a tutor',
        text: 'We surface vetted profiles with perfect fit.',
      },
      {
        '@type': 'HowToStep',
        name: 'Learn & iterate',
        text: 'Book, learn, review, and keep the momentum.',
      },
    ],
  },
  faq: {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is the AI Robot Teacher?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'It’s an AI assistant that guides lessons, quizzes you, and gives instant feedback alongside your human tutor.',
        },
      },
      {
        '@type': 'Question',
        name: 'Is AI learning safe and accurate?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. We combine vetted human tutors with AI. Tutors review AI suggestions and your learning plan for quality.',
        },
      },
      {
        '@type': 'Question',
        name: 'How much does it cost?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Pricing varies by tutor and subject. You can browse transparent rates before booking your first session.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I learn exam prep with AI?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Absolutely. Our AI helps you practice with timed drills and targeted feedback while your tutor fine-tunes strategy.',
        },
      },
    ],
  },
  breadcrumb: {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl('/') },
      { '@type': 'ListItem', position: 2, name: 'For Institutions', item: siteUrl('/org') },
    ],
  },
  institutionService: {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Institutional E-Learning Platform',
    serviceType: 'Learning Management & Virtual Classroom',
    description:
      'Run secure, branded E-Learning for schools and universities: exam results portals, printable report cards and class reports, AI-assisted marks entry, assignment sharing, SSO, domain restrict, analytics, and more.',
    provider: { '@type': 'EducationalOrganization', name: BRAND_NAME, url: SITE_URL || undefined },
    areaServed: 'Worldwide',
    audience: { '@type': 'EducationalAudience', educationalRole: 'administrator,teacher,student' },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Plans',
      itemListElement: [
        {
          '@type': 'Offer',
          name: 'Starter',
          itemOffered: {
            '@type': 'Service',
            name: 'Starter plan',
            description:
              'Up to 50 seats. Branded portal, assignment sharing, exam results portal basics, and monthly analytics.',
          },
        },
        {
          '@type': 'Offer',
          name: 'Pro',
          itemOffered: {
            '@type': 'Service',
            name: 'Pro plan',
            description:
              'Up to 500 seats. Advanced exam results portal, report cards and class reports, AI-assisted marks entry, and richer analytics.',
          },
        },
        {
          '@type': 'Offer',
          name: 'Enterprise',
          itemOffered: {
            '@type': 'Service',
            name: 'Enterprise plan',
            description:
              'Up to 5000 seats. SSO / domain restrict, bulk assignment workflows, deep analytics, CSV export, webhooks, and priority support.',
          },
        },
      ],
    },
  },
  webApp: {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: `${BRAND_NAME} E-Learning Platform`,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web',
    url: SITE_URL || undefined,
    featureList: [
      'Virtual classrooms',
      'Tutor marketplace',
      'AI Robot Teacher',
      'Assignments & grading',
      'Exam results portal for schools',
      'Printable report cards and class reports',
      'AI-assisted marks entry for teachers',
      'Analytics & reports',
      'SSO/domain restrict (Enterprise)',
    ],
    offers: { '@type': 'Offer', availability: 'https://schema.org/InStock' },
  },
};
