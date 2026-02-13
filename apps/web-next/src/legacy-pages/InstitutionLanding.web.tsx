'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { trackEvent } from '../analytics/ga4';

type Faq = { q: string; a: string };

const policies = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms' },
  { href: '/anti-spam', label: 'Anti-Spam' },
  { href: '/refunds', label: 'Refunds & Cancellations' },
  { href: '/complaints', label: 'Complaints / Feedback' },
  { href: '/fulfillment', label: 'Fulfillment Policy' },
  { href: '/payment-flow', label: 'Payment Flow' },
];

export default function InstitutionLanding() {
  const onCta = (source: string) => trackEvent('institution_portal_cta_click', { source });

  const faqs: Faq[] = useMemo(
    () => [
      {
        q: 'How secure is student data on DayBreak?',
        a: 'We follow modern security best practices including strict role-based access across staff, learners, and admins, secure transport (TLS), and clear “official portal” trust cues to reduce phishing risk.',
      },
      {
        q: 'Can we integrate with our existing tools?',
        a: 'Yes. We can support institution workflows with exports and API-friendly data structures. Request a demo and we’ll map an integration approach for your environment.',
      },
      {
        q: 'What support do you offer for large institutions?',
        a: 'We provide guided onboarding, admin training, and priority support options for institutions with larger rosters and multiple departments.',
      },
      {
        q: 'Do learners have separate access from staff/admin?',
        a: 'Yes. Learner roles are isolated from staff and admin permissions. Institutions control what learners can see and do.',
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
    <div className="bg-white text-slate-900 dark:bg-darkBg dark:text-slate-100">
      {/* HERO (no Navbar here — global one will render above) */}
      <section className="relative overflow-hidden pt-14 pb-20 sm:pt-16 sm:pb-24 lg:pt-24 lg:pb-32">
        {/* Background wash */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-950" />
          <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-indigo-500/10 blur-3xl dark:bg-indigo-500/15" />
          <div className="absolute -bottom-28 -left-28 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl dark:bg-cyan-500/10" />
        </div>

        <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            {/* Copy */}
            <div className="space-y-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/60 bg-indigo-50/70 px-4 py-2 text-sm font-semibold text-indigo-700 dark:border-white/10 dark:bg-white/5 dark:text-indigo-200">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-500 opacity-40" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
                </span>
                New: AI-powered institutional insights
              </div>

              <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                Empower Your Institution with{' '}
                <span className="text-indigo-600 dark:text-indigo-400">DayBreak</span> Learner
              </h1>

              <p className="max-w-xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
                A modern institutional workspace for staff management, assignments, eLearning access, analytics,
                and reporting — built to be simple, secure, and fast to adopt.
              </p>

              <div className="flex flex-wrap gap-3 pt-2">
                <Link
                  href="/institutions/login"
                  onClick={() => onCta('hero_login')}
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-7 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:shadow-lg hover:shadow-indigo-600/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60"
                >
                  Institution Login
                  <span className="transition-transform group-hover:translate-x-0.5">→</span>
                </Link>

                <a
                  href="mailto:support@daybreaklearner.com?subject=Institution%20Demo%20Request"
                  onClick={() => onCta('hero_demo')}
                  className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white/60 px-7 py-3.5 text-sm font-semibold text-indigo-700 backdrop-blur transition hover:border-indigo-200 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-indigo-200 dark:hover:border-white/20"
                >
                  Request a Demo
                </a>
              </div>

              <div className="pt-3">
                <div className="rounded-2xl border border-slate-200/70 bg-white/60 p-4 text-sm text-slate-600 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                  <p className="font-semibold text-slate-800 dark:text-slate-100">
                    Secure sign-in on daybreaklearner.com
                  </p>
                  <p className="mt-1">
                    We never ask for credentials on third-party sites. Always verify{' '}
                    <span className="font-semibold">daybreaklearner.com</span>.
                  </p>
                </div>
              </div>
            </div>

            {/* Glass dashboard mock */}
            <div className="relative">
              <div className="pointer-events-none absolute -inset-6 rounded-[2.5rem] bg-gradient-to-r from-indigo-500/20 to-cyan-500/20 blur-3xl opacity-50 dark:opacity-35" />

              <div className="relative overflow-hidden rounded-3xl border border-slate-200/60 bg-white/60 p-6 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold">Student Roster</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Academic Year 2026</p>
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
                    <div
                      key={i}
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
                          {row.score}% Score
                        </div>
                        <div className="mt-1 h-1.5 w-16 rounded-full bg-indigo-600/10">
                          <div className="h-full rounded-full bg-indigo-600" style={{ width: `${row.score}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pointer-events-none absolute -bottom-6 -right-6 w-52 rounded-2xl border border-indigo-200/40 bg-white p-4 shadow-xl dark:border-white/10 dark:bg-slate-900">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Total Revenue
                    </span>
                    <span className="text-xs font-bold text-emerald-600">▲</span>
                  </div>
                  <div className="mt-1 text-2xl font-extrabold">$124.5k</div>
                  <div className="mt-3 flex h-8 items-end gap-1">
                    <div className="h-3 flex-1 rounded-t bg-indigo-600/20" />
                    <div className="h-5 flex-1 rounded-t bg-indigo-600/20" />
                    <div className="h-8 flex-1 rounded-t bg-indigo-600" />
                    <div className="h-6 flex-1 rounded-t bg-indigo-600/20" />
                  </div>
                </div>
              </div>
            </div>
            {/* end visual */}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Powerful Features for Modern Schools
            </h2>
            <p className="mt-3 text-slate-600 dark:text-slate-300">
              Everything you need to manage your institution&apos;s digital transformation in one place.
            </p>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: 'Staff Management',
                desc: 'Centralize roles, permissions, departments, and staff onboarding.',
                icon: '👥',
              },
              {
                title: 'Assignment Tracking',
                desc: 'Create, submit, and grade coursework with clear status and visibility.',
                icon: '📝',
              },
              {
                title: 'eLearning Modules',
                desc: 'Deliver learning content with structured modules and student access controls.',
                icon: '🎓',
              },
              {
                title: 'Advanced Analytics',
                desc: 'Track engagement, outcomes, and growth with actionable reporting.',
                icon: '📈',
              },
            ].map((f) => (
              <div
                key={f.title}
                className="group rounded-3xl border border-slate-200 bg-slate-50 p-6 transition-all hover:-translate-y-1 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-600/10 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
              >
                <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-indigo-600/10 text-2xl transition-colors group-hover:bg-indigo-600 group-hover:text-white dark:bg-indigo-500/20">
                  <span aria-hidden>{f.icon}</span>
                </div>
                <h3 className="text-lg font-extrabold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-slate-50 py-16 sm:py-20 dark:bg-slate-950/40">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Set Up in Minutes</h2>
            <p className="mt-3 text-slate-600 dark:text-slate-300">
              A smooth onboarding flow for your institution — from account creation to reporting.
            </p>
          </div>

          <div className="relative mt-12 grid gap-10 md:grid-cols-3 md:gap-12">
            <div className="pointer-events-none absolute left-0 right-0 top-10 hidden h-px bg-slate-200 dark:bg-white/10 md:block" />

            {[
              {
                n: 1,
                title: 'Create Account',
                desc: 'Register your institution and verify your details for a secure workspace.',
                filled: true,
              },
              {
                n: 2,
                title: 'Invite Teams',
                desc: 'Add staff and learners via invites or bulk onboarding flows.',
                filled: false,
              },
              {
                n: 3,
                title: 'Track Reports',
                desc: 'Monitor learning and operational activity with clear, exportable reporting.',
                filled: false,
              },
            ].map((s) => (
              <div key={s.n} className="text-center">
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
              </div>
            ))}
          </div>

          <div className="mt-12 rounded-3xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-white/5">
            <h3 className="text-lg font-extrabold">Official DayBreak Learner portal</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Access institution tools only on DayBreak Learner domains. Need help?{' '}
              <a className="font-semibold underline" href="mailto:support@daybreaklearner.com">
                support@daybreaklearner.com
              </a>
            </p>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {policies.map((p) => (
                <Link
                  key={p.href}
                  href={p.href}
                  className="underline decoration-slate-300 underline-offset-4 hover:text-indigo-600 dark:decoration-white/20 dark:hover:text-indigo-300"
                >
                  {p.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Frequently Asked Questions</h2>
            <p className="mt-3 text-slate-600 dark:text-slate-300">
              Everything you need to know about our institutional platform.
            </p>
          </div>

          <div className="mt-10 space-y-3">
            {faqs.map((item, idx) => {
              const open = idx === openIdx;
              return (
                <div
                  key={item.q}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white/60 backdrop-blur transition hover:border-indigo-200 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
                >
                  <button
                    type="button"
                    onClick={() => setOpenIdx(open ? -1 : idx)}
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
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SUPPORT CALLOUT (no Footer here — global one will render below) */}
      <section className="pb-16 sm:pb-20">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-indigo-600 px-6 py-10 shadow-xl sm:px-10 sm:py-12">
            <div className="pointer-events-none absolute inset-0 opacity-20">
              <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-white blur-3xl" />
              <div className="absolute -right-16 -bottom-24 h-80 w-80 rounded-full bg-cyan-300 blur-3xl" />
            </div>

            <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <h3 className="text-2xl font-extrabold text-white sm:text-3xl">
                  Still have questions? Our support team is here.
                </h3>
                <p className="mt-2 text-white/80">
                  We offer personalized walkthroughs and guided onboarding to help your institution succeed.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <a
                  href="mailto:support@daybreaklearner.com?subject=Institution%20Support%20Request"
                  onClick={() => onCta('support_contact')}
                  className="inline-flex items-center justify-center rounded-full bg-white px-7 py-3.5 text-sm font-extrabold text-indigo-700 shadow-sm transition hover:bg-slate-50"
                >
                  Contact Support
                </a>
                <Link
                  href="/help"
                  onClick={() => onCta('support_help')}
                  className="inline-flex items-center justify-center rounded-full border border-white/25 bg-white/10 px-7 py-3.5 text-sm font-extrabold text-white backdrop-blur transition hover:bg-white/15"
                >
                  Help Center
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}