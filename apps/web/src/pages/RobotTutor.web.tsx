import React, { useEffect, useMemo } from 'react';
import RobotTeacher from '../components/RobotTeacher.web';
import SeoHead from '../components/seo/SeoHead';

const DEFAULT_SSML = `<speak>
  <p>Hello! I am your robot tutor.</p>
  <p>Today we will learn fractions. <break time="400ms"/></p>
  <p>Repeat after me: one half. one third. one quarter.</p>
</speak>`;

const SITE_URL = import.meta.env.VITE_SITE_URL ?? '';
const BRAND = 'DayBreak';

export default function RobotTutorPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const title = `AI Robot Teacher | ${BRAND}`;
  const description =
    'Practice lessons with DayBreak’s AI Robot Teacher for instant explanations and guided review.';

  const webAppJsonLd = useMemo(
    () => [
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: `${BRAND} AI Robot Teacher`,
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Web',
        url: SITE_URL ? `${SITE_URL}/robot-teach` : undefined,
        description,
        featureList: ['Interactive lessons', 'Practice quizzes', 'Instant feedback'],
        offers: { '@type': 'Offer', availability: 'https://schema.org/InStock' },
      },
    ],
    [description]
  );

  return (
    <div className="min-h-screen app-body py-16 sm:py-20 lg:py-24">
      <SeoHead
        title={title}
        description={description}
        canonicalPath="/robot-teach"
        jsonLd={webAppJsonLd}
      />
      {/* Theme-aware wrapper; spacing keeps clear of Navbar/Footer */}
      <div className="mx-auto w-full max-w-7xl px-3 sm:px-4">
        <h1 className="text-3xl sm:text-4xl font-bold text-[#0d141c] dark:text-white mb-6">
          AI Robot Teacher
        </h1>
        <RobotTeacher initialSsml={DEFAULT_SSML} voiceName="en-US-Wavenet-C" />
      </div>
    </div>
  );
}
