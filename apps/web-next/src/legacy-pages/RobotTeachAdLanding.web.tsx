'use client';

import React, { useEffect, useMemo, useRef } from 'react';
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
import { appUrl } from '@/lib/appOrigin';
import { motion, useReducedMotion, Variants } from 'framer-motion';

// Mock analytics tracking function
const trackEvent = (eventName: string, params?: Record<string, any>) => {
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('event', eventName, params);
  }
};

/* ------------------------------ Animations ------------------------------ */
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
};

const stagger: Variants = {
  show: { transition: { staggerChildren: 0.08 } },
};

const softIn: Variants = {
  hidden: { opacity: 0, scale: 0.985 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.55, ease: 'easeOut' } },
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
      'RobotTeacher builds a clean outline, narrated lesson, and quiz flow from your course choice or custom goal.',
    bullets: [
      'Pick a course, track, and lesson size',
      'Generate outline + narrated lesson content',
      'Move step-by-step from lesson to quiz',
    ],
    icon: Sparkles,
  },
  {
    id: 'quiz',
    title: 'Interactive quizzes with instant grading',
    description:
      'Quick checks as multiple-choice or short answers—submit once, get scoring and feedback right away.',
    bullets: [
      'MCQ and typed short-answer modes',
      'Built-in timer and submission flow',
      'Results screen after grading',
    ],
    icon: Brain,
  },
  {
    id: 'audio',
    title: 'Audio narration, voice control, transcript & highlights',
    description:
      'Listen with selectable voices, follow a synced transcript, and adjust highlights for comfortable reading.',
    bullets: [
      'Voice dropdown with available TTS voices',
      'Transcript drawer with tap-to-seek',
      'Word-level highlighting + style controls',
    ],
    icon: Volume2,
  },
  {
    id: 'progress',
    title: 'Language bundles, progress, and transparent unlocks',
    description:
      'Language sessions support your preferred help-language, with saved progress and clear unlock states.',
    bullets: [
      'Language tracks (ESL, German, French, Spanish, and more)',
      'Saved support-language preference (Auto/Arabic/Hindi/Urdu/English)',
      'Some bundles/unlocks use tokens',
    ],
    icon: Globe,
  },
];

const WHO_FOR = [
  'Quick revision modules',
  'Certificate pathways',
  'Professional/diploma study tracks',
  'Comprehensive degree-style tracks',
  'Language learning (ESL + multilingual practice)',
];

const FAQS = [
  {
    q: 'Is this the official RobotTeacher experience?',
    a: "Yes—this page takes you into DayBreak Learner’s official RobotTeacher flow.",
  },
  {
    q: 'Do all lessons and quizzes use the same format?',
    a: 'Not always. Depending on your settings, you may see multiple-choice quizzes or short-answer grading.',
  },
  {
    q: 'Are tokens ever required?',
    a: 'Some advanced unlocks and certain language bundles may require tokens.',
  },
];

const RobotTeachAdLanding: React.FC = () => {
  const prefersReducedMotion = useReducedMotion() ?? false;

  const firedDepths = useRef<Set<number>>(new Set());
  const scrollTicking = useRef(false);
  const robotTeacherHref = appUrl('/robot-teach');

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

  const heroBullets = useMemo(() => VALUE_BULLETS.slice(0, 3), []);

  return (
    <StablePageShell className="bg-gradient-to-b from-slate-50 to-white text-slate-900 dark:from-slate-950 dark:to-slate-900 dark:text-slate-100">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Animated Background Elements */}
        <motion.div
          className="absolute inset-0 overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-gradient-to-br from-indigo-400/20 via-purple-400/20 to-pink-400/20 blur-3xl dark:from-indigo-500/30 dark:via-purple-500/30 dark:to-pink-500/30" />
          <div className="absolute -right-40 top-20 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-emerald-400/20 via-teal-400/20 to-cyan-400/20 blur-3xl dark:from-emerald-500/30 dark:via-teal-500/30 dark:to-cyan-500/30" />
          <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-yellow-400/10 to-orange-400/10 blur-3xl dark:from-yellow-500/20 dark:to-orange-500/20" />
        </motion.div>

        {/* Soft sparkle pulse (like your Landing Hero) */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          initial={false}
          animate={prefersReducedMotion ? { opacity: 0 } : { opacity: [0.12, 0.22, 0.12] }}
          transition={{ repeat: Infinity, duration: 6, ease: 'easeInOut' }}
          style={{
            background:
              'radial-gradient(900px 240px at 10% 10%, rgba(255,255,255,0.12), transparent), radial-gradient(900px 240px at 90% 90%, rgba(255,255,255,0.10), transparent)',
          }}
        />

        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <motion.div
            className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center"
            initial="hidden"
            animate="show"
            variants={stagger}
          >
            {/* Left Column - Content */}
            <div className="space-y-8">
              <motion.div variants={fadeUp}>
                <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/50 bg-indigo-50/80 px-4 py-2 backdrop-blur-sm dark:border-indigo-500/20 dark:bg-indigo-500/10">
                  <Zap className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    DayBreak Learner • RobotTeacher
                  </span>
                </div>
              </motion.div>

              <div className="space-y-6">
                <motion.h1
                  variants={fadeUp}
                  className="text-5xl font-extrabold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-6xl lg:text-7xl"
                >
                  Learn smarter
                  <span className="block bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400">
                    with AI
                  </span>
                </motion.h1>

                <motion.p variants={fadeUp} className="max-w-xl text-lg text-slate-600 dark:text-slate-300">
                  AI-generated lessons with narration, interactive quizzes with instant feedback,
                  and a clear path from learning → testing → progress—without the overwhelm.
                </motion.p>
              </div>

              <motion.div variants={fadeUp} className="flex flex-wrap gap-3">
                {heroBullets.map((item) => (
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
              </motion.div>

              <motion.div variants={fadeUp} className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <motion.a
                  href={robotTeacherHref}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.98 }}
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:shadow-xl hover:shadow-indigo-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:shadow-indigo-500/20 dark:hover:shadow-indigo-500/30"
                  aria-label="Open RobotTeacher"
                  onClick={() => handleCtaClick('hero')}
                >
                  <Play className="h-5 w-5" />
                  Start RobotTeacher
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </motion.a>

                <motion.a
                  href="#how-it-works"
                  whileHover={prefersReducedMotion ? undefined : { y: -2 }}
                  whileTap={prefersReducedMotion ? undefined : { y: 0 }}
                  className="group inline-flex items-center gap-2 font-semibold text-slate-700 transition-colors hover:text-indigo-600 dark:text-slate-200 dark:hover:text-indigo-400"
                  onClick={() => handleSectionClick('how_it_works_anchor')}
                >
                  See how it works
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </motion.a>
              </motion.div>
            </div>

            {/* Right Column - Product Preview */}
            <motion.div variants={fadeUp} className="relative">
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-pink-500/20 blur-2xl" />

              <motion.div
                initial={{ scale: 1.04, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="relative rounded-3xl border border-white/20 bg-white/90 p-8 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90"
              >
                <div className="space-y-6">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 p-2.5">
                        <BookOpen className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">Sample Lesson</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Photosynthesis • Grade 8</div>
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
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Audio Narration</span>
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
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Quiz Questions</span>
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
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">AI Feedback</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        "Great start! Also mention that chlorophyll gives leaves their green color."
                      </p>
                    </div>
                  </div>

                  {/* Footer Stats */}
                  <div className="grid grid-cols-3 gap-4 border-t border-slate-200 pt-4 dark:border-white/10">
                    <div className="text-center">
                      <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400">5min</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">Avg. Lesson</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-purple-600 dark:text-purple-400">100%</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">AI-Generated</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">Instant</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">Feedback</div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            className="mb-16 text-center"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.25 }}
            variants={stagger}
          >
            <motion.div variants={fadeUp} className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 dark:border-white/10 dark:bg-white/5">
              <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Powerful Features
              </span>
            </motion.div>

            <motion.h2 variants={fadeUp} className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
              Everything you need for{' '}
              <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent dark:from-indigo-400 dark:to-purple-400">
                effective learning
              </span>
            </motion.h2>

            <motion.p variants={fadeUp} className="mx-auto mt-4 max-w-2xl text-base text-slate-600 dark:text-slate-300">
              Generate, study, test yourself, and keep momentum—with clarity at every step.
            </motion.p>
          </motion.div>

          <motion.div
            className="grid gap-6 md:grid-cols-2"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            variants={stagger}
          >
            {FEATURE_BLOCKS.map((block, index) => {
              const Icon = block.icon;
              return (
                <motion.div
                  key={block.id}
                  variants={fadeUp}
                  whileHover={prefersReducedMotion ? undefined : { y: -3 }}
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
                      <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-white">{block.title}</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-300">{block.description}</p>
                    </div>

                    <ul className="space-y-2.5">
                      {block.bullets.map((bullet) => (
                        <li key={bullet} className="flex items-start gap-3">
                          <div className="mt-0.5 rounded-full bg-indigo-100 p-1 dark:bg-indigo-500/20">
                            <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                          </div>
                          <span className="text-sm text-slate-700 dark:text-slate-200">{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="relative bg-slate-900 py-20 text-white sm:py-24">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:4rem_4rem]" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            className="mb-16 text-center"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.25 }}
            variants={stagger}
          >
            <motion.h2 variants={fadeUp} className="mb-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
              How it works
            </motion.h2>
            <motion.p variants={fadeUp} className="mx-auto max-w-2xl text-lg text-slate-300">
              Three simple steps to start learning with structure and momentum.
            </motion.p>
          </motion.div>

          <motion.div
            className="grid gap-8 md:grid-cols-3"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            variants={stagger}
          >
            {[
              {
                title: 'Choose your goal and setup',
                text: 'Pick a course or custom topic. Set track, lesson size, level, and (when available) quiz type.',
                icon: BookOpen,
                gradient: 'from-blue-500 to-cyan-500',
              },
              {
                title: 'Generate and study the lesson',
                text: 'RobotTeacher builds outline + narration. Use audio voices, transcript view, and guided pacing.',
                icon: Sparkles,
                gradient: 'from-purple-500 to-pink-500',
              },
              {
                title: 'Take quiz, review, continue',
                text: 'Submit answers for grading, review feedback, then move to results and the next lesson.',
                icon: Award,
                gradient: 'from-emerald-500 to-teal-500',
              },
            ].map((step, index) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.title}
                  variants={fadeUp}
                  whileHover={prefersReducedMotion ? undefined : { y: -3 }}
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
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* Trust & Who It's For Section */}
      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            className="grid gap-8 lg:grid-cols-2"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.25 }}
            variants={stagger}
          >
            {/* Trust Card */}
            <motion.div variants={fadeUp} className="group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-8 shadow-sm dark:border-white/10 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950">
              <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl" />
              <div className="relative space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-4 py-2 dark:bg-indigo-500/20">
                  <CheckCircle2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">Official Experience</span>
                </div>

                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Trust and authenticity</h2>

                <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                  <p className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                    Official DayBreak Learner RobotTeacher flow
                  </p>
                  <p className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                    Secure and verified platform experience
                  </p>
                  <p className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                    We never ask for credentials on third-party sites
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Who It's For Card */}
            <motion.div variants={fadeUp} className="group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-8 shadow-sm dark:border-white/10 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950">
              <div className="absolute -left-12 -top-12 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
              <div className="relative space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 dark:bg-emerald-500/20">
                  <Globe className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">For learners</span>
                </div>

                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Who it’s for</h2>

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
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="bg-slate-50 py-20 dark:bg-slate-900/50 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <motion.div
            className="mb-12 text-center"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.25 }}
            variants={stagger}
          >
            <motion.h2 variants={fadeUp} className="mb-4 text-4xl font-extrabold text-slate-900 dark:text-white">
              Frequently asked questions
            </motion.h2>
            <motion.p variants={fadeUp} className="text-lg text-slate-600 dark:text-slate-300">
              Everything you need to know before you start.
            </motion.p>
          </motion.div>

          <motion.div
            className="space-y-4"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.25 }}
            variants={stagger}
          >
            {FAQS.map((item) => (
              <motion.details
                key={item.q}
                variants={fadeUp}
                className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md dark:border-white/10 dark:bg-slate-900"
                onToggle={() => handleFaqToggle(item.q)}
              >
                <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold text-slate-900 dark:text-white [&::-webkit-details-marker]:hidden">
                  <span>{item.q}</span>
                  <ChevronRight className="h-5 w-5 flex-shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
                </summary>
                <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{item.a}</p>
              </motion.details>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 py-20 text-white sm:py-24">
        <div className="absolute -left-20 top-0 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-20 -right-20 h-96 w-96 rounded-full bg-white/10 blur-3xl" />

        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.35 }}
            variants={stagger}
          >
            <motion.div variants={fadeUp} className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 backdrop-blur-sm">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Start today</span>
            </motion.div>

            <motion.h2 variants={fadeUp} className="mb-6 text-4xl font-extrabold tracking-tight sm:text-5xl">
              Ready to learn with structure and momentum?
            </motion.h2>

            <motion.p variants={fadeUp} className="mb-10 text-lg text-white/90">
              Generate your first lesson, follow along with narration, test yourself, and keep progressing at your pace.
            </motion.p>

            <motion.div variants={fadeUp} className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <motion.a
                href={robotTeacherHref}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-8 py-4 text-base font-semibold text-indigo-600 shadow-2xl transition-all hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-600"
                aria-label="Start RobotTeacher now"
                onClick={() => handleCtaClick('final')}
              >
                <Play className="h-5 w-5" />
                Start RobotTeacher now
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </motion.a>

              <motion.a
                href="#features"
                whileHover={prefersReducedMotion ? undefined : { y: -2 }}
                whileTap={prefersReducedMotion ? undefined : { y: 0 }}
                className="group inline-flex items-center gap-2 font-semibold text-white transition-colors hover:text-white/80"
                onClick={() => handleSectionClick('final_to_features')}
              >
                Review features first
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </motion.a>
            </motion.div>

            <motion.p variants={fadeUp} className="mt-8 text-sm text-white/70">
              Some advanced lessons and unlocks may require tokens.
            </motion.p>
          </motion.div>
        </div>
      </section>
    </StablePageShell>
  );
};

export default RobotTeachAdLanding;