'use client';

import React, { useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { trackEvent } from '../analytics/ga4';
import StablePageShell from '@/components/layout/StablePageShell';
import { motion, useReducedMotion, Variants } from 'framer-motion';

type Faq = { q: string; a: string };

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
};

const stagger: Variants = {
  show: { transition: { staggerChildren: 0.08 } },
};

const policies = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms' },
  { href: '/anti-spam', label: 'Anti-Spam' },
  { href: '/refunds', label: 'Refunds & Cancellations' },
  { href: '/complaints', label: 'Complaints / Feedback' },
  { href: '/fulfillment', label: 'Fulfillment Policy' },
  { href: '/payment-flow', label: 'Payment Flow' },
];

const featureSections = [
  {
    title: 'Onboarding, roles & access control',
    subtitle:
      'Set up admins, teachers, and learners with clean permissions and fast onboarding paths.',
    cta: { label: 'See login & access', href: '/institutions/login', source: 'features_roles_access' },
    cards: [
      {
        icon: '👥',
        title: 'Staff & learner rosters',
        desc: 'Organize by class, subject, staff code, admission number, and learner profile details.',
      },
      {
        icon: '✉️',
        title: 'Invite links that just work',
        desc: 'Send role-specific invites with secure “accept invite” onboarding flows.',
      },
      {
        icon: '📥',
        title: 'CSV onboarding',
        desc: 'Import learners in bulk using templates, then filter and export class rosters anytime.',
      },
      {
        icon: '🔐',
        title: 'Role-safe sign-in',
        desc: 'Separate admin/teacher/learner routes with guarded access and first-login password prompts.',
      },
    ],
  },
  {
    title: 'Academics, assessments & daily operations',
    subtitle:
      'Run learning delivery, exams, attendance, and fees from a single institution workspace.',
    cta: { label: 'Explore workflows', href: '/institutions/login', source: 'features_academics_ops' },
    cards: [
      {
        icon: '📝',
        title: 'Assignments portal',
        desc: 'Create AI-assisted or classic assignments, share to classes/subjects, and review submissions.',
      },
      {
        icon: '🧾',
        title: 'Exams & report cards',
        desc: 'Configure terms, enter marks, generate learner/class PDFs, and include teacher remarks.',
      },
      {
        icon: '✅',
        title: 'Attendance sessions',
        desc: 'Create sessions, bulk mark Present/Absent/Late/Excused, and export attendance reports.',
      },
      {
        icon: '💳',
        title: 'Fees & statements',
        desc: 'Build fee structures, post charges/payments, reconcile receipts, and download statements.',
      },
    ],
  },
  {
    title: 'Communication, activities & reporting',
    subtitle:
      'Keep parents and learners informed, manage activities, and export data for leadership.',
    cta: {
      label: 'Request a guided demo',
      href: 'mailto:support@daybreaklearner.com?subject=Institution%20Demo%20Request',
      source: 'features_comms_reporting',
    },
    cards: [
      {
        icon: '📰',
        title: 'Newsletters & announcements',
        desc: 'Draft updates, pin announcements, send newsletters, and generate branded PDFs.',
      },
      {
        icon: '🏆',
        title: 'Sports & events',
        desc: 'Plan fixtures, publish results, record scores, and export events spreadsheets.',
      },
      {
        icon: '🤝',
        title: 'Clubs & societies',
        desc: 'Create clubs, enroll learners, assign roles like captain/member, and manage participation.',
      },
      {
        icon: '📈',
        title: 'Analytics & exports',
        desc: 'Track outcomes across assignments/exams/quizzes and export insights on eligible plans.',
      },
    ],
  },
];

export default function InstitutionLanding() {
  const prefersReducedMotion = useReducedMotion() ?? false;

  const safeTrack = useCallback((name: string, payload?: Record<string, any>) => {
    try {
      trackEvent(name as any, payload as any);
    } catch {}
  }, []);

  const onCta = (source: string) => safeTrack('institution_portal_cta_click', { source });
  const onFeatureCta = (source: string) => safeTrack('feature_section_cta_click', { source });
  const onFaqToggle = (q: string) => safeTrack('faq_toggle', { q });
  const onPolicyClick = (href: string) => safeTrack('policies_click', { href });

  const faqs: Faq[] = useMemo(
    () => [
      {
        q: 'How do you separate admin, teacher, and learner access?',
        a: 'The portal uses role-based routes and guarded permissions. Admins manage setup and operations, teachers run teaching workflows, and learners see learner-only pages such as assignments, results, and newsletters.',
      },
      {
        q: 'What onboarding options do we get?',
        a: 'You can onboard via direct adds, invite links, and CSV-assisted learner imports. Invite acceptance flows guide users through secure sign-in before entering the organization workspace.',
      },
      {
        q: 'Can we download and export records?',
        a: 'Yes. Export attendance and sports data as CSV, download fee statements/structures as PDFs, and generate exam report-card PDFs for individual learners and entire classes.',
      },
      {
        q: 'Do eLearning tools connect to reporting?',
        a: 'Yes. Assignments, submissions, exams, and summaries live in one environment—so leadership can track progress across coursework and assessments without switching systems.',
      },
    ],
    []
  );

  const [openIdx, setOpenIdx] = useState<number>(0);

  const roster = [
    {
      score: 94,
      labelW: 'w-28',
      img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBlhvB0v7rNH9q8BwYPWduyGcpZEj9DlGsFDWRZm3HhXkn2dYK5nhmOnB45Scx4sh53zfu3vUedNZkhgARFrdBds860sCYvhmI2n_6BrEhDTLYai8h1cXxjjj26If2i3IzqaC7yzj_62wFpan7AfBAiuS28KMukLcINsxbm4_En8sllDFhXRkDgPZ4MIeJfCtAnAAutwJZOMcX7lq-HQJyIIT-_HCHmrJ2xFqtSo-9rgnxB8H5XP1wvnNutAOmBo49kuz4dJkYQ4mWd',
      alt: 'Portrait of a female student smiling',
    },
    {
      score: 88,
      labelW: 'w-36',
      img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA5Xg8SILWMSH6W8iz-WNLUR-E4LBw_c8F3xZ_6F2BrQpC30sHC7xtueoKSHPbZWSW7EFIrUkWQylpWAfM8NtWpevZ_cc0xU1JFtWZfTb3xgqzPQic2pU2S-qGo-De1YvnjzluIeOi5DavdYrwo4BHsc1OGrjrlRb0M9H8A2Dmnrjl3sbapuX7pVY5VSYizFNn0MPvlvCm8G6gugm5goT7OCD6k6hCv_YH5mN_6lrkh5hD7OIydhc3QN4Rv8q7XaITV-dPfeLVYsuAJ',
      alt: 'Portrait of a male student smiling',
    },
  ];

  return (
    <StablePageShell className="bg-white text-slate-900 dark:bg-darkBg dark:text-slate-100">
      {/* HERO */}
      <section className="relative overflow-hidden pt-14 pb-20 sm:pt-16 sm:pb-24 lg:pt-24 lg:pb-32">
        {/* Background */}
        <motion.div
          className="pointer-events-none absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-950" />
          <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-indigo-500/10 blur-3xl dark:bg-indigo-500/15" />
          <div className="absolute -bottom-28 -left-28 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl dark:bg-cyan-500/10" />
        </motion.div>

        {/* Soft sparkle pulse (respects reduced motion) */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          initial={false}
          animate={
            prefersReducedMotion
              ? { opacity: 0 }
              : { opacity: [0.12, 0.22, 0.12] }
          }
          transition={{ repeat: Infinity, duration: 6, ease: 'easeInOut' }}
          style={{
            background:
              'radial-gradient(900px 240px at 10% 10%, rgba(255,255,255,0.12), transparent), radial-gradient(900px 240px at 90% 90%, rgba(255,255,255,0.10), transparent)',
          }}
        />

        <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6">
          <motion.div
            className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16"
            initial="hidden"
            animate="show"
            variants={stagger}
          >
            {/* Left */}
            <div className="space-y-7">
              <motion.div variants={fadeUp}>
                <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/60 bg-indigo-50/70 px-4 py-2 text-sm font-semibold text-indigo-700 dark:border-white/10 dark:bg-white/5 dark:text-indigo-200">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-500 opacity-40" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
                  </span>
                  Built for real school & training workflows
                </div>
              </motion.div>

              <motion.h1
                variants={fadeUp}
                className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl"
              >
                Your institution portal, upgraded with{' '}
                <span className="text-indigo-600 dark:text-indigo-400">DayBreak Learner</span>
              </motion.h1>

              <motion.p
                variants={fadeUp}
                className="max-w-xl text-lg leading-relaxed text-slate-600 dark:text-slate-300"
              >
                Manage rosters, assignments, exams, fees, attendance, newsletters, clubs, sports,
                and analytics—inside one secure workspace for admins, teachers, and learners.
              </motion.p>

              <motion.div variants={fadeUp} className="flex flex-wrap gap-3 pt-2">
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                  <Link
                    href="/institutions/login"
                    onClick={() => onCta('hero_login')}
                    className="group inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-7 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:shadow-lg hover:shadow-indigo-600/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60"
                  >
                    Institution Login
                    <span className="transition-transform group-hover:translate-x-0.5">→</span>
                  </Link>
                </motion.div>

                <motion.div whileHover={{ y: -2 }} whileTap={{ y: 0 }}>
                  <a
                    href="mailto:support@daybreaklearner.com?subject=Institution%20Demo%20Request"
                    onClick={() => onCta('hero_demo')}
                    className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white/60 px-7 py-3.5 text-sm font-semibold text-indigo-700 backdrop-blur transition hover:border-indigo-200 hover:bg-white dark:border-white/10 dark:bg-white/10 dark:text-indigo-200 dark:hover:bg-white/15"
                  >
                    Request a Demo
                  </a>
                </motion.div>
              </motion.div>

              <motion.div
                variants={fadeUp}
                className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
              >
                <p>
                  <span className="font-semibold">Secure sign-in on daybreaklearner.com</span>
                </p>
                <p className="mt-1">
                  We never ask for credentials on third-party sites. Always confirm the portal URL
                  is <span className="font-semibold">daybreaklearner.com</span>.
                </p>
              </motion.div>
            </div>

            {/* Right */}
            <motion.div variants={fadeUp} className="relative">
              <div className="pointer-events-none absolute -inset-6 rounded-[2.5rem] bg-gradient-to-r from-indigo-500/20 to-cyan-500/20 blur-3xl opacity-50 dark:opacity-35" />

              <motion.div
                initial={{ scale: 1.04, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="relative overflow-hidden rounded-3xl border border-slate-200/60 bg-white/60 p-6 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold">Learner Snapshot</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Sample institution dashboard</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-indigo-600/15 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">
                      <span className="text-sm font-bold">+</span>
                    </div>
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
                      <span className="text-lg leading-none">⋯</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  {roster.map((row, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.5 }}
                      transition={{ duration: 0.5, ease: 'easeOut', delay: 0.05 * i }}
                      className="flex items-center gap-4 rounded-2xl border border-white/30 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-900/40"
                    >
                      <div className="h-11 w-11 overflow-hidden rounded-full bg-indigo-600/10">
                        <img alt={row.alt} src={row.img} className="h-full w-full object-cover" />
                      </div>

                      <div className="flex-1">
                        <div className={`h-2.5 ${row.labelW} rounded-full bg-indigo-600/20`} />
                        <div className="mt-2 h-2 w-24 rounded-full bg-slate-200 dark:bg-slate-700" />
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-bold text-indigo-700 dark:text-indigo-200">
                          {row.score}% progress
                        </div>
                        <div className="mt-1 h-1.5 w-16 rounded-full bg-indigo-600/10">
                          <div className="h-full rounded-full bg-indigo-600" style={{ width: `${row.score}%` }} />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.55, ease: 'easeOut', delay: 0.15 }}
                  className="pointer-events-none absolute -bottom-6 -right-6 w-56 rounded-2xl border border-indigo-200/40 bg-white p-4 shadow-xl dark:border-white/10 dark:bg-slate-900"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sample metrics</span>
                    <span className="text-xs font-bold text-emerald-600">Live</span>
                  </div>
                  <div className="mt-1 text-lg font-extrabold">1,248 Active learners</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    912 submissions • 96% exam completion
                  </div>
                  <div className="mt-3 flex h-8 items-end gap-1">
                    <div className="h-3 flex-1 rounded-t bg-indigo-600/20" />
                    <div className="h-5 flex-1 rounded-t bg-indigo-600/20" />
                    <div className="h-8 flex-1 rounded-t bg-indigo-600" />
                    <div className="h-6 flex-1 rounded-t bg-indigo-600/20" />
                  </div>
                </motion.div>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
          <motion.div
            className="mx-auto max-w-3xl text-center"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.25 }}
            variants={stagger}
          >
            <motion.h2 variants={fadeUp} className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              What your institution can run today
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-3 text-slate-600 dark:text-slate-300">
              Everything below mirrors real workflows already available in the organization portal.
            </motion.p>
          </motion.div>

          <div className="mt-10 space-y-8">
            {featureSections.map((section, idx) => (
              <motion.div
                key={section.title}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, amount: 0.2 }}
                variants={stagger}
                className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 dark:border-white/10 dark:bg-white/5"
              >
                <motion.div variants={fadeUp} className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-extrabold">{section.title}</h3>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{section.subtitle}</p>
                  </div>
                  <Link
                    href={section.cta.href}
                    onClick={() => onFeatureCta(section.cta.source)}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-700 hover:text-indigo-600 dark:text-indigo-300"
                  >
                    {section.cta.label} →
                  </Link>
                </motion.div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {section.cards.map((f, i) => (
                    <motion.div
                      key={f.title}
                      variants={fadeUp}
                      transition={{ duration: 0.55, ease: 'easeOut', delay: 0.03 * (i + idx) }}
                      whileHover={prefersReducedMotion ? undefined : { y: -3 }}
                      className="group rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-600/10 dark:border-white/10 dark:bg-slate-900/40 dark:hover:border-white/20"
                    >
                      <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-indigo-600/10 text-lg dark:bg-indigo-500/20">
                        <span aria-hidden>{f.icon}</span>
                      </div>
                      <h4 className="text-base font-extrabold">{f.title}</h4>
                      <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{f.desc}</p>

                      <motion.span
                        aria-hidden
                        initial={{ x: '-120%' }}
                        whileHover={{ x: '120%' }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className="pointer-events-none absolute -inset-y-8 -left-20 w-24 rotate-[20deg] bg-gradient-to-r from-transparent via-white/25 to-transparent"
                      />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-slate-50 py-16 sm:py-20 dark:bg-slate-950/40">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
          <motion.div
            className="mx-auto max-w-3xl text-center"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.25 }}
            variants={stagger}
          >
            <motion.h2 variants={fadeUp} className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              How institutions onboard
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-3 text-slate-600 dark:text-slate-300">
              A simple rollout you can complete quickly—based on existing admin and teacher portal flows.
            </motion.p>
          </motion.div>

          <motion.div
            className="relative mt-12 grid gap-10 md:grid-cols-3 md:gap-12"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            variants={stagger}
          >
            <div className="pointer-events-none absolute left-0 right-0 top-10 hidden h-px bg-slate-200 dark:bg-white/10 md:block" />

            {[
              {
                n: 1,
                title: 'Sign in & set roles',
                desc: 'Admins configure the institution profile, branding, and role-based access for staff and learners.',
                filled: true,
              },
              {
                n: 2,
                title: 'Add your roster',
                desc: 'Onboard teachers and learners via invites, direct adds, or CSV import with class-level grouping.',
                filled: false,
              },
              {
                n: 3,
                title: 'Run school operations',
                desc: 'Launch assignments, exams, attendance, fees, and communication—then export PDFs/CSVs for stakeholders.',
                filled: false,
              },
            ].map((s, i) => (
              <motion.div key={s.n} variants={fadeUp} transition={{ delay: 0.05 * i }} className="text-center">
                <div
                  className={[
                    'mx-auto grid h-20 w-20 place-items-center rounded-full text-3xl font-extrabold shadow-lg ring-8',
                    s.filled
                      ? 'bg-indigo-600 text-white ring-slate-50 dark:ring-slate-950/40'
                      : 'bg-white text-indigo-700 ring-slate-50 dark:bg-white/10 dark:text-indigo-200 dark:ring-slate-950/40',
                  ].join(' ')}
                >
                  {s.n}
                </div>
                <h4 className="mt-6 text-lg font-extrabold">{s.title}</h4>
                <p className="mt-2 px-6 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{s.desc}</p>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.25 }}
            variants={stagger}
            className="mt-12 rounded-3xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-white/5"
          >
            <motion.h3 variants={fadeUp} className="text-lg font-extrabold">
              Official DayBreak Learner portal
            </motion.h3>
            <motion.p variants={fadeUp} className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Access institution tools only on DayBreak Learner domains. Need help?{' '}
              <a className="font-semibold underline" href="mailto:support@daybreaklearner.com">
                support@daybreaklearner.com
              </a>
            </motion.p>

            <motion.div variants={fadeUp} className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {policies.map((p) => (
                <Link
                  key={p.href}
                  href={p.href}
                  onClick={() => onPolicyClick(p.href)}
                  className="underline decoration-slate-300 underline-offset-4 hover:text-indigo-600 dark:decoration-white/20 dark:hover:text-indigo-300"
                >
                  {p.label}
                </Link>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
          <motion.div
            className="text-center"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.25 }}
            variants={stagger}
          >
            <motion.h2 variants={fadeUp} className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Frequently Asked Questions
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-3 text-slate-600 dark:text-slate-300">
              Quick answers based on workflows currently available in the institution portal.
            </motion.p>
          </motion.div>

          <motion.div
            className="mt-10 space-y-3"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.25 }}
            variants={stagger}
          >
            {faqs.map((item, idx) => {
              const open = idx === openIdx;
              return (
                <motion.div
                  key={item.q}
                  variants={fadeUp}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white/60 backdrop-blur transition hover:border-indigo-200 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onFaqToggle(item.q);
                      setOpenIdx(open ? -1 : idx);
                    }}
                    className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
                  >
                    <span className="text-base font-bold sm:text-lg">{item.q}</span>
                    <span
                      className={[
                        'grid h-9 w-9 place-items-center rounded-full border text-indigo-700 transition',
                        open ? 'rotate-180 border-indigo-200 bg-indigo-50' : 'border-slate-200 bg-white',
                        'dark:border-white/10 dark:bg-white/5 dark:text-indigo-200',
                      ].join(' ')}
                      aria-hidden
                    >
                      ▼
                    </span>
                  </button>

                  <div
                    className={[
                      'grid transition-all duration-200 ease-out',
                      open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                    ].join(' ')}
                  >
                    <div className="overflow-hidden px-6 pb-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      {item.a}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* SUPPORT CALLOUT */}
      <section className="pb-16 sm:pb-20">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
          <motion.div
            className="relative overflow-hidden rounded-3xl bg-indigo-600 px-6 py-10 shadow-xl sm:px-10 sm:py-12"
            initial={{ opacity: 0, scale: 0.98 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <div className="pointer-events-none absolute inset-0 opacity-20">
              <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-white blur-3xl" />
              <div className="absolute -right-16 -bottom-24 h-80 w-80 rounded-full bg-cyan-300 blur-3xl" />
            </div>

            <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <h3 className="text-2xl font-extrabold text-white sm:text-3xl">
                  Want a walkthrough? We’ll help you set it up.
                </h3>
                <p className="mt-2 text-white/80">
                  Get a personalized demo, onboarding guidance, and best-practice rollout steps for your institution.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <motion.a
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                  href="mailto:support@daybreaklearner.com?subject=Institution%20Support%20Request"
                  onClick={() => onCta('support_contact')}
                  className="inline-flex items-center justify-center rounded-full bg-white px-7 py-3.5 text-sm font-extrabold text-indigo-700 shadow-sm transition hover:bg-slate-50"
                >
                  Contact Support
                </motion.a>

                <motion.div whileHover={{ y: -2 }} whileTap={{ y: 0 }}>
                  <Link
                    href="/help"
                    onClick={() => onCta('support_help')}
                    className="inline-flex items-center justify-center rounded-full border border-white/25 bg-white/10 px-7 py-3.5 text-sm font-extrabold text-white backdrop-blur transition hover:bg-white/15"
                  >
                    Help Center
                  </Link>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </StablePageShell>
  );
}