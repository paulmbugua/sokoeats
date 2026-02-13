'use client';

import Link from 'next/link';
import React from 'react';
import { trackEvent } from '../analytics/ga4';

const policies = [
  { href: '/privacy-policy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms' },
  { href: '/refunds', label: 'Refunds & Cancellations' },
  { href: '/help', label: 'Contact / Support' },
];

export default function InstitutionLanding() {
  const onCta = (source: string) => trackEvent('institution_portal_cta_click', { source });

  return (
    <div className="bg-white text-slate-900 dark:bg-darkBg dark:text-slate-100">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-slate-900 dark:to-slate-950" />
        <div className="relative mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">Institution Portal</p>
          <h1 className="mt-3 text-4xl font-extrabold sm:text-5xl">Institution Portal for Schools</h1>
          <p className="mt-4 max-w-3xl text-slate-600 dark:text-slate-300">
            Manage staff and learners, assignments, exam results, eLearning access, and reporting in one
            secure DayBreak Learner workspace.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link onClick={() => onCta('hero_login')} href="/institution/login" className="rounded-full bg-indigo-600 px-6 py-3 font-semibold text-white">
              Institution Login
            </Link>
            <a onClick={() => onCta('hero_demo')} href="mailto:support@daybreaklearner.com?subject=Institution%20Demo%20Request" className="rounded-full border border-slate-300 px-6 py-3 font-semibold">
              Request a Demo
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-3xl font-bold">What you can do</h2>
        <ul className="mt-6 grid gap-4 md:grid-cols-2">
          {[
            'Invite staff/students (Org invites)',
            'Manage classes and roster',
            'Assignments and exam results',
            'eLearning portal for students',
            'Analytics and reporting',
            'Secure roles (admin/staff/student)',
          ].map((item) => (
            <li key={item} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">{item}</li>
          ))}
        </ul>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6">
        <h2 className="text-3xl font-bold">How it works</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {['Create your institution account', 'Invite your team and students', 'Track learning, fees, and reports'].map((step, idx) => (
            <div key={step} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-700">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">{idx + 1}</div>
              <p className="mt-3 font-semibold">{step}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-900">
          <h3 className="text-xl font-bold">Official DayBreak Learner portal</h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Access institution tools only on DayBreak Learner domains. Need help? support@daybreaklearner.com
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            {policies.map((policy) => (
              <Link key={policy.href} href={policy.href} className="underline">
                {policy.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
        <h2 className="text-2xl font-bold">FAQs</h2>
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <p className="font-semibold">Who should use this portal?</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">School owners, admins, staff, and institution learners.</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <p className="font-semibold">Do learners have separate access?</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">Yes. Learner roles are isolated from admin and staff permissions.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
