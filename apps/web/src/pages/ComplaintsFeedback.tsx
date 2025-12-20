// apps/web/src/pages/ComplaintsFeedback.tsx
import React from 'react';
import { Link } from 'react-router-dom';

export default function ComplaintsFeedback() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10 text-sm leading-6">
      <h1 className="text-2xl font-bold">Complaints & Feedback</h1>
      <p className="text-gray-500">Last updated: {new Date().toLocaleDateString()}</p>

      <section className="mt-6 space-y-5">
        <p>
          We want every learner, tutor, and institution to have a great experience. Tell us what
          went well and what we should improve.
        </p>

        <h2 className="text-lg font-semibold">1) How to contact us</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            Email support:{' '}
            <a className="text-primary" href="mailto:support@daybreaklearner.com">
              support@daybreaklearner.com
            </a>
          </li>
          <li>
            Abuse/spam reports:{' '}
            <a className="text-primary" href="mailto:abuse@daybreaklearner.com">
              abuse@daybreaklearner.com
            </a>
          </li>
          <li>
            Privacy requests:{' '}
            <a className="text-primary" href="mailto:privacy@daybreaklearner.com">
              privacy@daybreaklearner.com
            </a>
          </li>
          <li>
            Phones: <a href="tel:+254728872800">+254 728 872 800</a>,{' '}
            <a href="tel:+254720423764">+254 720 423 764</a>,{' '}
            <a href="tel:+254758276900">+254 758 276 900</a>
          </li>
        </ul>

        <h2 className="text-lg font-semibold">2) What to include</h2>
        <p>
          Order/booking ID (if any), your account email, date/time, tutor/course title, screenshots,
          and a short description of the issue.
        </p>

        <h2 className="text-lg font-semibold">3) Our response times</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>General support: initial response within 2 business days.</li>
          <li>
            Payment/refund issues: initial response within 2 business days; resolution as fast as
            your processor allows.
          </li>
          <li>Abuse/spam reports: we triage within 24 hours.</li>
        </ul>

        <h2 className="text-lg font-semibold">4) Escalation</h2>
        <p>
          If you’re not satisfied with the outcome, reply to the thread requesting escalation. A
          senior reviewer will reassess the case.
        </p>

        <h2 className="text-lg font-semibold">5) Helpful links</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <Link to="/refunds" className="text-primary underline">
              Refund & Cancellation Policy
            </Link>
          </li>
          <li>
            <Link to="/fulfillment" className="text-primary underline">
              Fulfillment & Delivery Policy
            </Link>
          </li>
          <li>
            <Link to="/privacy-policy" className="text-primary underline">
              Privacy Policy
            </Link>
          </li>
          <li>
            <Link to="/anti-spam-policy" className="text-primary underline">
              Anti-Spam Policy
            </Link>
          </li>
          <li>
            <Link to="/payment-flow" className="text-primary underline">
              How Payments Work
            </Link>
          </li>
        </ul>

        <h2 className="text-lg font-semibold">6) Company & address</h2>
        <div className="rounded-md p-4 bg-gray-50 dark:bg-[#121927] text-sm">
          <p>
            <strong>EKAZICONNECT SOLUTIONS LTD</strong>
          </p>
          <p>Registered Office: International House, Mama Ngina Street, CBD, Nairobi, Kenya</p>
          <p>Postal: P.O. Box 1830-01000, Thika, Kenya</p>
        </div>
      </section>
    </main>
  );
}
