// apps/web/src/pages/AntiSpamPolicy.tsx
import React from 'react';
import { Link } from 'react-router-dom';

export default function AntiSpamPolicy() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10 text-sm leading-6">
      <h1 className="text-2xl font-bold">Anti-Spam Policy</h1>
      <p className="text-gray-500">Last updated: {new Date().toLocaleDateString()}</p>

      <section className="mt-6 space-y-5">
        <p>
          We prohibit unsolicited or abusive messaging on and off the Daybreak Learn platform. This
          policy applies to emails, SMS, in-app messages, and tutor/student communications.
        </p>

        <h2 className="text-lg font-semibold">1) Consent first</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            We send <strong>transactional</strong> messages (receipts, booking updates, passwords)
            without marketing content.
          </li>
          <li>
            We send <strong>marketing</strong> messages only with your consent; every message
            includes a clear unsubscribe or opt-out.
          </li>
          <li>
            Tutors may message only learners who have interacted with their listings or sessions and
            strictly about learning.
          </li>
        </ul>

        <h2 className="text-lg font-semibold">2) Prohibited content & practices</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            Purchased/harvested lists, bulk cold emails, misleading headers, or deceptive subject
            lines.
          </li>
          <li>Scams, illegal products, hate, harassment, adult content, or malware.</li>
          <li>Sending frequency or volume that causes complaints or blocks.</li>
        </ul>

        <h2 className="text-lg font-semibold">3) Compliance</h2>
        <p>
          We aim to comply with applicable anti-spam and consumer laws. We monitor bounce/complaint
          rates and may rate-limit, warn, or suspend accounts.
        </p>

        <h2 className="text-lg font-semibold">4) Report abuse</h2>
        <p>
          Forward suspicious messages to{' '}
          <a className="text-primary" href="mailto:abuse@daybreaklearner.com">
            abuse@daybreaklearner.com
          </a>{' '}
          with headers if possible. We investigate promptly.
        </p>

        <h2 className="text-lg font-semibold">5) Contact</h2>
        <div className="rounded-md p-4 bg-gray-50 dark:bg-[#121927] text-sm">
          <p>
            <strong>EKAZICONNECT SOLUTIONS LTD</strong>
          </p>
          <p>International House, Mama Ngina Street, CBD, Nairobi, Kenya</p>
          <p>Postal: P.O. Box 1830-01000, Thika, Kenya</p>
          <p>
            Phones: <a href="tel:+254728872800">+254 728 872 800</a> •{' '}
            <a href="tel:+254720423764">+254 720 423 764</a> •{' '}
            <a href="tel:+254758276900">+254 758 276 900</a>
          </p>
          <p>
            Email:{' '}
            <a className="text-primary" href="mailto:support@daybreaklearner.com">
              support@daybreaklearner.com
            </a>
          </p>
        </div>

        <p className="text-xs text-gray-500">
          See also:{' '}
          <Link to="/privacy-policy" className="text-primary">
            Privacy Policy
          </Link>{' '}
          •{' '}
          <Link to="/terms" className="text-primary">
            Terms of Service
          </Link>
        </p>
      </section>
    </main>
  );
}
