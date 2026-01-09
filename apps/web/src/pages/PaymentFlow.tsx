// apps/web/src/pages/PaymentFlow.tsx
import React from 'react';
import { Link } from 'react-router-dom';

export default function PaymentFlow() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-10 text-sm leading-6">
      <h1 className="text-2xl font-bold">How Payments Work</h1>
      <p className="text-gray-500">
        Transparent flows for live sessions, on-demand courses, AI learning, and certificates
      </p>

      <div className="mt-6 grid gap-6">
        {/* Flow A: Buy Tokens */}
        <section className="rounded-xl border p-4 bg-white dark:bg-[#0f1821]">
          <h2 className="text-lg font-semibold">A) Buy Tokens</h2>
          <ol className="list-decimal pl-5 space-y-1 mt-2">
            <li>Student buys Tokens (Paystack or M-Pesa).</li>
            <li>Tokens credit the student account instantly.</li>
          </ol>
        </section>

        {/* Flow B: Book Live Session */}
        <section className="rounded-xl border p-4 bg-white dark:bg-[#0f1821]">
          <h2 className="text-lg font-semibold">B) Book a Live Session</h2>
          <ol className="list-decimal pl-5 space-y-1 mt-2">
            <li>
              Student selects tutor/time → we <strong>hold</strong> Tokens.
            </li>
            <li>After completion (or 24h auto-complete), Tokens are captured.</li>
            <li>
              Platform fee retained; <strong>tutor payout released</strong> (24–72h typical).
            </li>
          </ol>
        </section>

        {/* Flow C: Buy Tutor Videos/Courses */}
        <section className="rounded-xl border p-4 bg-white dark:bg-[#0f1821]">
          <h2 className="text-lg font-semibold">C) Buy Tutor Videos & Courses</h2>
          <ol className="list-decimal pl-5 space-y-1 mt-2">
            <li>Student browses catalog and purchases directly with Tokens.</li>
            <li>Streaming access unlocks immediately in the student library.</li>
            <li>Payouts to the tutor are scheduled per product rules.</li>
          </ol>
        </section>

        {/* Flow D: AI Learning, Quizzes & Certificates */}
        <section className="rounded-xl border p-4 bg-white dark:bg-[#0f1821]">
          <h2 className="text-lg font-semibold">D) AI Learning, Quizzes & Certificates</h2>
          <ol className="list-decimal pl-5 space-y-1 mt-2">
            <li>Students study AI lessons and attempt quizzes freely.</li>
            <li>
              Only when a <strong>certificate is requested</strong> do we charge the certificate fee
              (Tokens).
            </li>
            <li>
              Certificate is generated and added to the student’s profile for download/verification.
            </li>
          </ol>
        </section>

        {/* Flow E: Institutions */}
        <section className="rounded-xl border p-4 bg-white dark:bg-[#0f1821]">
          <h2 className="text-lg font-semibold">E) Institutions (Schools/Companies/NGOs)</h2>
          <ol className="list-decimal pl-5 space-y-1 mt-2">
            <li>Institution purchases a subscription/seat bundle or issues a PO.</li>
            <li>We provision seats to the admin (1–2 business days).</li>
            <li>
              Learners access AI learning, courses, and optional certificates (billed per plan).
            </li>
          </ol>
        </section>
      </div>

      <div className="mt-6 p-3 rounded-lg bg-gray-50 dark:bg-[#121927] text-xs">
        <p>
          <strong>Important:</strong> Tokens are non-transferable and not redeemable for cash. See
          the{' '}
          <Link to="/refunds" className="text-primary">
            Refund Policy
          </Link>{' '}
          and{' '}
          <Link to="/fulfillment" className="text-primary">
            Fulfillment Policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
