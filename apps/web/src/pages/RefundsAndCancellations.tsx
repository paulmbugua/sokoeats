// apps/web/src/pages/RefundsAndCancellations.tsx
import React from 'react';
import { Link } from 'react-router-dom';

export default function RefundsAndCancellations() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10 text-sm leading-6">
      <h1 className="text-2xl font-bold">Refund & Cancellation Policy</h1>
      <p className="text-gray-500">Last updated: {new Date().toLocaleDateString()}</p>

      <section className="mt-6 space-y-5">
        <p>
          This policy applies to <strong>Daybreak Learn</strong> (
          <a className="text-primary underline" href="https://www.daybreaklearner.com">
            daybreaklearner.com
          </a>
          ), operated by <strong>EKAZICONNECT SOLUTIONS LTD</strong> (Kenya Co. No. PVT-5JJZ5LQD).
          We provide live tutoring, tutor-published video lessons and courses, and AI-powered
          learning (lessons, quizzes, certificates).
        </p>

        <h2 className="text-lg font-semibold">1) Tokens (Store Credit)</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            Tokens are <strong>non-transferable</strong> and{' '}
            <strong>not redeemable for cash</strong>.
          </li>
          <li>Tokens purchase services on Daybreak Learn (sessions, courses, certificates).</li>
          <li>
            Approved refunds may be issued as Token credits or to the original payment method (see
            §7).
          </li>
        </ul>

        <h2 className="text-lg font-semibold">2) Live session cancellations by students</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>≥ 12 hours before</strong> start: 100% returned as Tokens.
          </li>
          <li>
            <strong>1–12 hours</strong> before: 50% returned as Tokens.
          </li>
          <li>
            <strong>&lt; 1 hour</strong>, after start, or no-show: not refundable.
          </li>
        </ul>

        <h2 className="text-lg font-semibold">3) Live session cancellations by tutors</h2>
        <p>100% returned as Tokens, or—on request—refunded to the original payment method.</p>

        <h2 className="text-lg font-semibold">4) Tutor videos & on-demand courses</h2>
        <p>
          Streaming access begins immediately after purchase. Because this is digital content,
          purchases are
          <strong> non-refundable once access has begun</strong>, except where the content is
          defective/unusable or materially not as described (then we’ll replace it or issue a Token
          credit/refund).
        </p>

        <h2 className="text-lg font-semibold">5) AI learning, quizzes & certificates</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            AI lessons and quizzes are included in platform access; learners may attempt quizzes
            freely.
          </li>
          <li>
            Certificate fees are charged{' '}
            <strong>only when you opt to generate a certificate</strong>.
          </li>
          <li>
            Certificates are personalized digital goods;{' '}
            <strong>non-refundable once generated</strong>, except for errors on our side (we’ll
            correct/reissue).
          </li>
        </ul>

        <h2 className="text-lg font-semibold">6) Service not delivered / technical failure</h2>
        <p>
          If a booked service can’t be delivered and we can’t re-schedule reasonably, you’ll receive
          100% back (Tokens or original method).
        </p>

        <h2 className="text-lg font-semibold">7) Refund method & timing</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Token credits: instant once approved.</li>
          <li>
            Original method: cards/PayPal ~5–10 business days; M-Pesa ~1–3 business days
            (processor/bank times vary).
          </li>
        </ul>

        <h2 className="text-lg font-semibold">8) Institutional subscriptions</h2>
        <p>
          Institutions (schools, NGOs, companies) may subscribe on behalf of learners/staff for AI
          learning and courses. Unless otherwise agreed in a master services agreement,
          institutional plans are billed in advance and are
          <strong> non-refundable once seats are provisioned</strong>. We can pro-rate on
          upgrades/add-seats; mid-term downgrades take effect next renewal.
        </p>

        <h2 className="text-lg font-semibold">9) How to request a refund</h2>
        <p>
          Email{' '}
          <a className="text-primary" href="mailto:support@daybreaklearner.com">
            support@daybreaklearner.com
          </a>{' '}
          with name, order/booking ID, date/time, and reason. We aim to reply within 2 business
          days.
        </p>

        <h2 className="text-lg font-semibold">10) Disputes & chargebacks</h2>
        <p>
          Please contact us first—we resolve most issues quickly. Filing a chargeback before
          contacting support may delay resolution.
        </p>

        <h2 className="text-lg font-semibold">11) Company & contact</h2>
        <div className="rounded-md p-4 bg-gray-50 dark:bg-[#121927] text-sm">
          <p>
            <strong>EKAZICONNECT SOLUTIONS LTD</strong>
          </p>
          <p>Registered Office: International House, Mama Ngina Street, CBD, Nairobi, Kenya</p>
          <p>Postal Address: P.O. Box 1830-01000, Thika, Kenya</p>
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

        <div className="mt-6 text-xs text-gray-500">
          See also:{' '}
          <Link to="/fulfillment" className="text-primary">
            Fulfillment & Delivery Policy
          </Link>{' '}
          •{' '}
          <Link to="/payment-flow" className="text-primary">
            How Payments Work
          </Link>
        </div>
      </section>
    </main>
  );
}
