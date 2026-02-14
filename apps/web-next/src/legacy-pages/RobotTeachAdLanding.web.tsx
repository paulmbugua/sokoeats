'use client';

import React, { useEffect, useRef } from 'react';
import {
  Sparkles,
  Brain,
  Volume2,
  Globe,
  CheckCircle2,
  ArrowRight,
  Zap,
  Award,
  BookOpen,
  MessageSquare,
  Play,
  ChevronRight,
} from 'lucide-react';
import StablePageShell from '@/components/layout/StablePageShell';

// Mock analytics tracking function
const trackEvent = (eventName: string, params?: Record<string, any>) => {
  // Placeholder for analytics tracking
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('event', eventName, params);
  }
};

// Mock app URL helper
const appUrl = (path: string) => {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${path}`;
  }
  return path;
};

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
  icon: React.ElementType;
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
    icon: Sparkles,
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
    icon: Brain,
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
    icon: Volume2,
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
    icon: Globe,
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
    a: "Yes. This page sends you to DayBreak Learner's RobotTeacher flow.",
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
    <StablePageShell className="bg-gradient-to-b from-slate-50 to-white text-slate-900 dark:from-slate-950 dark:to-slate-900 dark:text-slate-100">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-gradient-to-br from-indigo-400/20 via-purple-400/20 to-pink-400/20 blur-3xl dark:from-indigo-500/30 dark:via-purple-500/30 dark:to-pink-500/30" />
          <div className="absolute -right-40 top-20 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-emerald-400/20 via-teal-400/20 to-cyan-400/20 blur-3xl dark:from-emerald-500/30 dark:via-teal-500/30 dark:to-cyan-500/30" />
          <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-yellow-400/10 to-orange-400/10 blur-3xl dark:from-yellow-500/20 dark:to-orange-500/20" />
        </div>

        {/* Grid Pattern Overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8882_1px,transparent_1px),linear-gradient(to_bottom,#8882_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />

        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
            {/* Left Column - Content */}
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/50 bg-indigo-50/80 px-4 py-2 backdrop-blur-sm dark:border-indigo-500/20 dark:bg-indigo-500/10">
                <Zap className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  DayBreak Learner • RobotTeacher
                </span>
              </div>

              <div className="space-y-6">
                <h1 className="text-5xl font-extrabold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-6xl lg:text-7xl">
                  Learn smarter
                  <span className="block bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400">
                    with AI
                  </span>
                </h1>

                <p className="max-w-xl text-lg text-slate-600 dark:text-slate-300">
                  AI-generated lessons with narration, interactive quizzes with instant feedback, and
                  personalized learning paths—all in one seamless flow.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                {VALUE_BULLETS.slice(0, 3).map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/80 px-4 py-2 backdrop-blur-sm dark:border-white/10 dark:bg-white/5"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {item.split(',')[0]}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <button
                  type="button"
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:shadow-xl hover:shadow-indigo-500/40 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:shadow-indigo-500/20 dark:hover:shadow-indigo-500/30"
                  aria-label="Open RobotTeacher"
                  onClick={() => handleCtaClick('hero')}
                >
                  <Play className="h-5 w-5" />
                  Start Learning Now
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </button>

                <a
                  href="#how-it-works"
                  className="group inline-flex items-center gap-2 font-semibold text-slate-700 transition-colors hover:text-indigo-600 dark:text-slate-200 dark:hover:text-indigo-400"
                  onClick={() => handleSectionClick('how_it_works_anchor')}
                >
                  See how it works
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </a>
              </div>
            </div>

            {/* Right Column - Product Preview */}
            <div className="relative">
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-pink-500/20 blur-2xl" />
              <div className="relative rounded-3xl border border-white/20 bg-white/90 p-8 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90">
                <div className="space-y-6">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 p-2.5">
                        <BookOpen className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">
                          Sample Lesson
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Photosynthesis • Grade 8
                        </div>
                      </div>
                    </div>
                    <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                      Active
                    </div>
                  </div>

                  {/* Content Sections */}
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-4 dark:border-white/10 dark:from-slate-800/50 dark:to-slate-900/50">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="rounded-lg bg-indigo-100 p-1.5 dark:bg-indigo-500/20">
                          <Volume2 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Audio Narration
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        "Photosynthesis is the process by which plants convert sunlight into energy..."
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-4 dark:border-white/10 dark:from-slate-800/50 dark:to-slate-900/50">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="rounded-lg bg-purple-100 p-1.5 dark:bg-purple-500/20">
                          <Brain className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                        </div>
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Quiz Questions
                        </span>
                      </div>
                      <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                        <div className="flex items-start gap-2">
                          <span className="text-purple-600 dark:text-purple-400">1.</span>
                          <span>Which part of the plant cell captures sunlight?</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-purple-600 dark:text-purple-400">2.</span>
                          <span>Why is chlorophyll important?</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white p-4 dark:border-emerald-500/20 dark:from-emerald-900/20 dark:to-slate-900/50">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="rounded-lg bg-emerald-100 p-1.5 dark:bg-emerald-500/20">
                          <MessageSquare className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          AI Feedback
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        "Great start! Also mention that chlorophyll gives leaves their green color."
                      </p>
                    </div>
                  </div>

                  {/* Footer Stats */}
                  <div className="grid grid-cols-3 gap-4 border-t border-slate-200 pt-4 dark:border-white/10">
                    <div className="text-center">
                      <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                        5min
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        Avg. Lesson
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                        100%
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        AI-Generated
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                        Instant
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        Feedback
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 dark:border-white/10 dark:bg-white/5">
              <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Powerful Features
              </span>
            </div>
            <h2 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
              Everything you need for{' '}
              <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent dark:from-indigo-400 dark:to-purple-400">
                effective learning
              </span>
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {FEATURE_BLOCKS.map((block, index) => {
              const Icon = block.icon;
              return (
                <div
                  key={block.id}
                  className="group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-8 shadow-sm transition-all hover:shadow-xl hover:shadow-slate-200/50 dark:border-white/10 dark:bg-slate-900/50 dark:hover:shadow-indigo-500/10"
                >
                  <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-indigo-500/10 to-purple-500/10 blur-2xl transition-all group-hover:scale-150 dark:from-indigo-500/20 dark:to-purple-500/20" />
                  
                  <div className="relative space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 p-3 shadow-lg shadow-indigo-500/30">
                        <Icon className="h-6 w-6 text-white" />
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-white/5 dark:text-slate-400">
                        0{index + 1}
                      </span>
                    </div>

                    <div>
                      <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-white">
                        {block.title}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        {block.description}
                      </p>
                    </div>

                    <ul className="space-y-2.5">
                      {block.bullets.map((bullet) => (
                        <li key={bullet} className="flex items-start gap-3">
                          <div className="mt-0.5 rounded-full bg-indigo-100 p-1 dark:bg-indigo-500/20">
                            <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                          </div>
                          <span className="text-sm text-slate-700 dark:text-slate-200">
                            {bullet}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="relative bg-slate-900 py-20 text-white sm:py-24">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:4rem_4rem]" />
        
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
              How it works
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-slate-300">
              Get started in three simple steps and begin your personalized learning journey
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                title: 'Choose your goal and setup',
                text: 'Pick a course or custom topic, then set track, lesson size, level, and (when available) quiz type.',
                icon: BookOpen,
                gradient: 'from-blue-500 to-cyan-500',
              },
              {
                title: 'Generate and study the lesson',
                text: 'RobotTeacher builds an outline + narration. Study with audio voices, transcript view, and guided pacing.',
                icon: Sparkles,
                gradient: 'from-purple-500 to-pink-500',
              },
              {
                title: 'Take quiz, review, continue',
                text: 'Submit MCQ or short-answer responses for grading, review feedback, then move to results and next lessons.',
                icon: Award,
                gradient: 'from-emerald-500 to-teal-500',
              },
            ].map((step, index) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="relative rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm transition-all hover:bg-white/10"
                >
                  <div className="mb-6 flex items-center justify-between">
                    <div className={`rounded-2xl bg-gradient-to-br ${step.gradient} p-3 shadow-lg`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/20 bg-white/10 text-xl font-bold">
                      {index + 1}
                    </div>
                  </div>

                  <h3 className="mb-3 text-xl font-bold">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-slate-300">{step.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Trust & Who It's For Section */}
      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Trust Card */}
            <div className="group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-8 shadow-sm dark:border-white/10 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950">
              <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl" />
              <div className="relative space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-4 py-2 dark:bg-indigo-500/20">
                  <CheckCircle2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                    Official Experience
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                  Trust and authenticity
                </h2>
                <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                  <p className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                    Official DayBreak Learner experience
                  </p>
                  <p className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                    Secure and verified platform
                  </p>
                  <p className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                    We never ask for credentials on third-party sites
                  </p>
                </div>
              </div>
            </div>

            {/* Who It's For Card */}
            <div className="group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-8 shadow-sm dark:border-white/10 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950">
              <div className="absolute -left-12 -top-12 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
              <div className="relative space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 dark:bg-emerald-500/20">
                  <Globe className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    For Everyone
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                  Who it's for
                </h2>
                <div className="flex flex-wrap gap-2">
                  {WHO_FOR.map((label) => (
                    <span
                      key={label}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-all hover:border-emerald-300 hover:bg-emerald-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="bg-slate-50 py-20 dark:bg-slate-900/50 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-4xl font-extrabold text-slate-900 dark:text-white">
              Frequently asked questions
            </h2>
            <p className="text-lg text-slate-600 dark:text-slate-300">
              Everything you need to know about RobotTeacher
            </p>
          </div>

          <div className="space-y-4">
            {FAQS.map((item) => (
              <details
                key={item.q}
                className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md dark:border-white/10 dark:bg-slate-900"
                onToggle={() => handleFaqToggle(item.q)}
              >
                <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold text-slate-900 dark:text-white [&::-webkit-details-marker]:hidden">
                  <span>{item.q}</span>
                  <ChevronRight className="h-5 w-5 flex-shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
                </summary>
                <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 py-20 text-white sm:py-24">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff15_1px,transparent_1px),linear-gradient(to_bottom,#ffffff15_1px,transparent_1px)] bg-[size:4rem_4rem]" />
        <div className="absolute -left-20 top-0 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-20 -right-20 h-96 w-96 rounded-full bg-white/10 blur-3xl" />

        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 backdrop-blur-sm">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Start Your Journey Today
            </span>
          </div>

          <h2 className="mb-6 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Ready to transform your learning experience?
          </h2>

          <p className="mb-10 text-lg text-white/90">
            Join thousands of learners already using RobotTeacher to achieve their educational goals.
            Start now and continue at your own pace.
          </p>

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <button
              type="button"
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-8 py-4 text-base font-semibold text-indigo-600 shadow-2xl transition-all hover:scale-105 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-600"
              aria-label="Start RobotTeacher now"
              onClick={() => handleCtaClick('final')}
            >
              <Play className="h-5 w-5" />
              Start RobotTeacher now
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </button>

            <a
              href="#features"
              className="group inline-flex items-center gap-2 font-semibold text-white transition-colors hover:text-white/80"
              onClick={() => handleSectionClick('final_to_features')}
            >
              Review features first
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
          </div>

          <p className="mt-8 text-sm text-white/70">
            Some advanced lessons and unlocks may require tokens
          </p>
        </div>
      </section>
    </StablePageShell>
  );
};

export default RobotTeachAdLanding;