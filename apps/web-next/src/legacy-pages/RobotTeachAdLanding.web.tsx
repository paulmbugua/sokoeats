'use client';

import React, { useEffect, useRef } from 'react';
import { trackEvent } from '../analytics/ga4';
import { appUrl } from '@/lib/appOrigin';

const VALUE_BULLETS = [
  'AI-generated outlines and lesson narration',
  'MCQ or short-answer quizzes with grading',
  'Voice selection, transcript drawer, and highlights',
  'Language tracks with support-language options',
  'Progress flow from lesson → quiz → certificate',
];

const FEATURE_BLOCKS: Array<{
  id: string;
  title: string;
  description: string;
  bullets: string[];
}> = [
  {
    id: 'generate',
    title: 'Generate a lesson path in seconds',
    description:
      'RobotTeacher builds an outline, lesson narration, and quiz flow from your selected course or custom goal.',
    bullets: [
      'Choose a course, track, and lesson size',
      'Create outlines and narrative lesson content',
      'Move step-by-step from lesson to quiz',
    ],
  },
  {
    id: 'quiz',
    title: 'Interactive quizzes with instant grading',
    description:
      'Take quick checks as multiple choice or short answers, then submit for scoring and feedback in the same session.',
    bullets: [
      'Supports MCQ and typed short-answer modes',
      'Built-in timer and submission flow',
      'Results screen handoff after grading',
    ],
  },
  {
    id: 'audio',
    title: 'Audio narration, voice control, transcript & highlights',
    description:
      'Listen to lesson narration with selectable voices, follow line-by-line transcript sync, and adjust reading highlights.',
    bullets: [
      'Voice dropdown with available TTS voices',
      'Transcript drawer with tap-to-seek',
      'Word-level highlighting with style controls',
    ],
  },
  {
    id: 'progress',
    title: 'Language bundles, progress, and honest unlocks',
    description:
      'Language sessions include support-language preferences and prompt bundles. Learning progress and unlock states are tracked in-app.',
    bullets: [
      'Language cards (English ESL, German, French, Spanish, and more)',
      'Saved support-language preference (Auto/Arabic/Hindi/Urdu/English)',
      'Some unlocks and bundles use tokens',
    ],
  },
];

const WHO_FOR = [
  'Focused modules (quick revision)',
  'Certificate pathways',
  'Professional/diploma study tracks',
  'Comprehensive degree-style tracks',
  'Language learners (ESL + multilingual practice)',
];

const FAQS = [
  {
    q: 'Is this the official RobotTeacher experience?',
    a: 'Yes. This page sends you to DayBreak Learner\'s RobotTeacher flow.',
  },
  {
    q: 'Do all lessons and quizzes use the same format?',
    a: 'You can encounter multiple-choice and short-answer quiz modes depending on your flow settings.',
  },
  {
    q: 'Are tokens ever required?',
    a: 'Some advanced unlocks and language bundles may require tokens.',
  },
];

const RobotTeachAdLanding: React.FC = () => {
  const firedDepths = useRef<Set<number>>(new Set());
  const scrollTicking = useRef(false);

  useEffect(() => {
    try {
      trackEvent('robot_teach_ad_view');
    } catch {}
  }, []);

  useEffect(() => {
    const depths = [25, 50, 75, 100] as const;

    const emitDepth = (depth: (typeof depths)[number]) => {
      if (firedDepths.current.has(depth)) return;
      firedDepths.current.add(depth);
      try {
        trackEvent('robot_teach_ad_scroll_depth', { depth });
      } catch {}
    };

    const evaluateDepth = () => {
      if (typeof window === 'undefined' || typeof document === 'undefined') return;
      const doc = document.documentElement;
      const maxScroll = Math.max(doc.scrollHeight - window.innerHeight, 1);
      const ratio = Math.min(1, Math.max(0, window.scrollY / maxScroll));
      const pct = Math.round(ratio * 100);
      depths.forEach((d) => {
        if (pct >= d) emitDepth(d);
      });
    };

    const onScroll = () => {
      if (scrollTicking.current) return;
      scrollTicking.current = true;
      window.setTimeout(() => {
        evaluateDepth();
        scrollTicking.current = false;
      }, 180);
    };

    evaluateDepth();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const handleCtaClick = (source: string) => {
    try {
      trackEvent('robot_teach_ad_cta_click', { source });
    } catch {}
    const legacyUrl = appUrl('/robot-teach');
    const fallbackUrl = `${window.location.origin}/app/robot-teach`;
    window.location.assign(legacyUrl || fallbackUrl);
  };

  const handleSectionClick = (section: string) => {
    try {
      trackEvent('robot_teach_ad_section_click', { section });
    } catch {}
  };

  const handleFaqToggle = (question: string) => {
    try {
      trackEvent('robot_teach_ad_faq_toggle', { question });
    } catch {}
  };

  return (
    <div className="bg-white dark:bg-darkBg text-slate-900 dark:text-slate-100">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-emerald-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950" />
        <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl dark:bg-indigo-500/20" />
        <div className="absolute right-0 top-10 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl dark:bg-emerald-400/20" />

        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pb-14 pt-14 sm:px-6 lg:flex-row lg:items-center lg:gap-14 lg:pt-20">
          <div className="flex-1">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">
              DayBreak Learner • RobotTeacher
            </p>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
              AI lessons, narration, quizzes, and feedback in one learning flow.
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
              Build a course path, study with transcript-synced audio, then take graded quizzes and
              continue toward your next milestone.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {VALUE_BULLETS.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-slate-200/90 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm dark:border-white/15 dark:bg-white/5 dark:text-slate-200"
                >
                  {item}
                </span>
              ))}
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                aria-label="Open RobotTeacher"
                onClick={() => handleCtaClick('hero')}
              >
                Open RobotTeacher
              </button>
              <a
                href="#how-it-works"
                className="text-sm font-semibold text-slate-700 dark:text-slate-200 hover:text-indigo-600"
                onClick={() => handleSectionClick('how_it_works_anchor')}
              >
                See how it works
              </a>
            </div>
          </div>

          <div className="flex-1">
            <div className="rounded-3xl border border-white/70 bg-white/75 p-5 shadow-2xl shadow-slate-300/40 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/70 dark:shadow-none">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-300">
                Product sample
              </p>
              <div className="mt-3 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">
                    Sample Goal
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Voice: en-US • Transcript: On</span>
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Lesson</h3>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      Explain photosynthesis for grade 8 with clear steps, key terms, and a quick recap.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Quiz</h3>
                    <ul className="mt-1 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                      <li>1) MCQ: Which part of the plant cell captures sunlight?</li>
                      <li>2) Short answer: Why is chlorophyll important?</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Feedback</h3>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      Sample correction: “Great start—mention that chlorophyll also gives leaves their green color.”
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Built from real RobotTeacher capabilities</h2>
          <a
            href="#how-it-works"
            className="text-sm font-semibold text-indigo-600 hover:text-indigo-500"
            onClick={() => handleSectionClick('features_to_how_it_works')}
          >
            Jump to flow
          </a>
        </div>
        <div className="mt-7 grid gap-4 md:grid-cols-2">
          {FEATURE_BLOCKS.map((block) => (
            <article
              key={block.id}
              className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900"
            >
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white">{block.title}</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{block.description}</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-200">
                {block.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-indigo-600" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">How it works</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            {
              title: 'Choose your goal and setup',
              text: 'Pick a course or custom topic, then set track, lesson size, level, and (when available) quiz type.',
            },
            {
              title: 'Generate and study the lesson',
              text: 'RobotTeacher builds an outline + narration. Study with audio voices, transcript view, and guided pacing.',
            },
            {
              title: 'Take quiz, review, continue',
              text: 'Submit MCQ or short-answer responses for grading, review feedback, then move to results and next lessons.',
            },
          ].map((step, index) => (
            <div
              key={step.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900"
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

      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-900">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Trust and authenticity</h2>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              Official DayBreak Learner experience.
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              We never ask for credentials on third-party sites. Verify daybreaklearner.com.
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-900">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Who it’s for</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {WHO_FOR.map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-4 pb-14 sm:px-6">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">FAQ</h2>
        <div className="mt-4 space-y-3">
          {FAQS.map((item) => (
            <details
              key={item.q}
              className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"
              onToggle={() => handleFaqToggle(item.q)}
            >
              <summary className="cursor-pointer list-none font-semibold text-slate-900 dark:text-white">
                {item.q}
              </summary>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="bg-slate-900 py-14 text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-4 text-center sm:px-6">
          <h2 className="text-3xl font-bold">Ready to learn with RobotTeacher?</h2>
          <p className="text-sm text-slate-200">
            Start now and continue at your pace. Some advanced lessons and unlocks may require tokens.
          </p>
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-base font-semibold text-slate-900 shadow-lg shadow-emerald-400/30 transition hover:bg-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
              aria-label="Start RobotTeacher now"
              onClick={() => handleCtaClick('final')}
            >
              Start RobotTeacher now
            </button>
            <a
              href="#features"
              className="text-xs font-semibold text-emerald-100 hover:text-white"
              onClick={() => handleSectionClick('final_to_features')}
            >
              Review features first
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};

export default RobotTeachAdLanding;
