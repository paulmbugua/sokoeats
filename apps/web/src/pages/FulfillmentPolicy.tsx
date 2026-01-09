// apps/web/src/pages/FulfillmentPolicy.tsx
import React from 'react';
import { Link } from 'react-router-dom';

export default function FulfillmentPolicy() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10 text-sm leading-6">
      <h1 className="text-2xl font-bold">Fulfillment & Delivery Policy</h1>
      <p className="text-gray-500">Last updated: {new Date().toLocaleDateString()}</p>

      <section className="mt-6 space-y-5">
        <h2 className="text-lg font-semibold">1) What you receive</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Tokens</strong> (store credit) immediately after confirmed payment.
          </li>
          <li>
            Access to book <strong>live online tutoring</strong>.
          </li>
          <li>
            Streaming access to <strong>tutor-published videos and courses</strong> purchased
            directly from the catalog.
          </li>
          <li>
            Access to <strong>AI learning</strong> (lessons, quizzes). Certificates are optional and
            paid only when generated.
          </li>
        </ul>

        <h2 className="text-lg font-semibold">2) Token delivery</h2>
        <p>
          Tokens appear instantly after payment is confirmed. If you don’t see them, contact support
          with your receipt.
        </p>

        <h2 className="text-lg font-semibold">3) Booking & joining live sessions</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Choose a tutor/time; we place a hold on the required Tokens.</li>
          <li>Sessions run online via a meeting link in your dashboard and email.</li>
          <li>Please join a few minutes early to test audio/video.</li>
        </ul>

        <h2 className="text-lg font-semibold">4) On-demand purchases (videos/courses)</h2>
        <p>
          Streaming access is granted immediately in your library. Some items may include
          downloadable notes; any downloads are watermarked.
        </p>

        <h2 className="text-lg font-semibold">5) Completion & payouts</h2>
        <p>
          After a live session, you or the tutor mark it complete. If no issue is reported within 24
          hours, it auto-completes. We then capture Tokens, retain the platform fee, and{' '}
          <strong>release tutor payouts</strong> (typically 24–72h) via the tutor’s selected method
          (e.g., M-Pesa or Paystack).
        </p>

        <h2 className="text-lg font-semibold">6) Institutional subscriptions</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            We provision seats to the institution’s admin within 1–2 business days of payment or PO
            acceptance.
          </li>
          <li>Admins assign seats to learners/staff; SSO/invite links may be provided.</li>
          <li>
            Bulk onboarding, reporting, and certificate verification pages are available on request.
          </li>
        </ul>

        <h2 className="text-lg font-semibold">7) Receipts & invoices</h2>
        <p>
          Receipts live in your account. For company invoices, email{' '}
          <a className="text-primary" href="mailto:billing@daybreaklearner.com">
            billing@daybreaklearner.com
          </a>
          .
        </p>

        <div className="rounded-md p-4 bg-gray-50 dark:bg-[#121927] text-xs">
          <strong>Note:</strong> Tokens are non-transferable and not redeemable for cash. See our{' '}
          <Link to="/refunds" className="text-primary">
            Refund & Cancellation Policy
          </Link>
          .
        </div>

        <div className="mt-6 text-xs text-gray-500">
          See also:{' '}
          <Link to="/payment-flow" className="text-primary">
            How Payments Work
          </Link>
        </div>
      </section>
    </main>
  );
}
