import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SeoHead from '../components/seo/SeoHead';
import { trackEvent } from '../analytics/ga4';

const HERO_BG = import.meta.env.VITE_HERO_BG ?? '';
const SITE_URL = import.meta.env.VITE_SITE_URL ?? 'https://www.daybreaklearner.com';

const RobotTeachAdLanding: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    trackEvent('robot_teach_ad_view');
  }, []);

  const handleCtaClick = (source: string) => {
    trackEvent('robot_teach_ad_cta_click', { source });
    navigate('/robot-teach');
  };

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'AI Robot Teacher by DayBreak',
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web',
      url: `${SITE_URL}/robot-teach/start`,
      description:
        'An AI Robot Teacher that delivers instant lessons, quizzes, and feedback with optional tutor support.',
      featureList: [
        'Goal-based lessons and quizzes',
        'Instant feedback and explanations',
        'Progress tracking',
        'Tutor support when needed',
      ],
      provider: {
        '@type': 'EducationalOrganization',
        name: 'DayBreak',
        url: SITE_URL,
      },
    },
  ];

  return (
    <div className="bg-white dark:bg-darkBg text-slate-900 dark:text-slate-100">
      <SeoHead
        title="AI Robot Teacher — Learn Faster With Instant Feedback | DayBreak"
        description="Learn faster with instant lessons, quizzes, and feedback from the AI Robot Teacher — plus expert tutor support whenever you need it."
        canonicalPath="/robot-teach/start"
        ogImage={HERO_BG}
        jsonLd={jsonLd}
      />

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-emerald-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950" />
        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pb-16 pt-16 sm:px-6 lg:flex-row lg:items-center lg:gap-16 lg:pt-20">
          <div className="flex-1">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">
              AI Robot Teacher
            </p>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
              Learn faster with an AI Robot Teacher.
            </h1>
            <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">
              Instant lessons, quizzes, and feedback — with expert tutor support whenever you need it.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                aria-label="Start learning now"
                onClick={() => handleCtaClick('hero')}
              >
                Start learning now
              </button>
              <a
                href="#how-it-works"
                className="text-sm font-semibold text-slate-600 dark:text-slate-200 hover:text-indigo-600"
              >
                See how it works
              </a>
            </div>
          </div>
          <div className="flex-1">
            <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-xl shadow-slate-200/40 dark:border-slate-700 dark:bg-slate-900/70 dark:shadow-none">
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs font-semibold uppercase text-slate-500">Today’s focus</p>
                  <p className="mt-2 text-base font-semibold">Targeted micro-lessons + practice</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs font-semibold uppercase text-slate-500">Feedback loop</p>
                  <p className="mt-2 text-base font-semibold">Instant corrections + tutor guidance</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs font-semibold uppercase text-slate-500">Momentum</p>
                  <p className="mt-2 text-base font-semibold">Clear next steps after every lesson</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">How it works</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            {
              title: 'Pick your goal',
              text: 'Choose what you want to learn and set a focus for today.',
            },
            {
              title: 'Learn with AI',
              text: 'Get a lesson plus a quick quiz to build understanding fast.',
            },
            {
              title: 'Improve with feedback',
              text: 'Receive instant feedback and tutor support whenever you need it.',
            },
          ].map((step, index) => (
            <div
              key={step.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
                {index + 1}
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">{step.title}</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white">What you get</h2>
            <ul className="mt-6 space-y-3 text-slate-600 dark:text-slate-300">
              <li className="flex gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-indigo-600" />
                Ask questions anytime, get instant explanations
              </li>
              <li className="flex gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-indigo-600" />
                Short quizzes after each lesson to lock it in
              </li>
              <li className="flex gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-indigo-600" />
                Clear next steps so you always know what to study
              </li>
              <li className="flex gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-indigo-600" />
                Track progress as you go
              </li>
            </ul>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Trust & safety</h3>
            <ul className="mt-4 space-y-4 text-sm text-slate-600 dark:text-slate-300">
              <li>
                <span className="font-semibold text-slate-900 dark:text-white">
                  Designed for real learning — structured lessons + checks
                </span>
              </li>
              <li>
                <span className="font-semibold text-slate-900 dark:text-white">
                  Tutor support available anytime
                </span>
              </li>
              <li>
                <span className="font-semibold text-slate-900 dark:text-white">
                  We prioritize safe, helpful, and clear explanations
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Who it’s for</h2>
        <div className="mt-6 flex flex-wrap gap-3">
          {['Exam prep (IGCSE/IB/SAT/KCSE etc.)', 'Language learners', 'Career skills'].map(
            (label) => (
              <span
                key={label}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {label}
              </span>
            )
          )}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            Trusted momentum
          </p>
          <p className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">
            Used by learners worldwide • Built for momentum • Designed for students & professionals
          </p>
        </div>
      </section>

      <section className="bg-slate-900 py-14 text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-4 text-center sm:px-6">
          <h2 className="text-3xl font-bold">Ready to start learning?</h2>
          <p className="text-sm text-slate-200">No commitment. Learn at your pace.</p>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-base font-semibold text-slate-900 shadow-lg shadow-emerald-400/30 transition hover:bg-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
            aria-label="Start learning now"
            onClick={() => handleCtaClick('final')}
          >
            Start learning now
          </button>
        </div>
      </section>
    </div>
  );
};

export default RobotTeachAdLanding;
