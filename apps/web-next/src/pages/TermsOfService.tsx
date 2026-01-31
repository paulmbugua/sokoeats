// apps/web/src/pages/TermsOfService.tsx
import React from 'react';
import Link from 'next/link';

export default function TermsOfService() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10 text-sm leading-6">
      <h1 className="text-2xl font-bold">Terms of Service</h1>
      <p className="text-gray-500">Last updated: {new Date().toLocaleDateString()}</p>

      <section className="mt-6 space-y-5">
        <p>
          Welcome to <strong>Daybreak Learn</strong>. These Terms form a binding agreement between
          you and <strong>EKAZICONNECT SOLUTIONS LTD</strong>. By using our website or apps, you
          agree to these Terms.
        </p>

        <h2 className="text-lg font-semibold">1) Services</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Live online tutoring sessions.</li>
          <li>Tutor-published videos and courses purchasable from our catalog.</li>
          <li>AI learning: lessons, quizzes, and optional paid certificates.</li>
          <li>Institutional subscriptions for organizations.</li>
        </ul>

        <h2 className="text-lg font-semibold">2) Accounts & eligibility</h2>
        <p>
          You must provide accurate information and keep credentials secure. You are responsible for
          activity under your account.
        </p>

        <h2 className="text-lg font-semibold">3) Tokens & payments</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>“Tokens” are store credit used to purchase services on Daybreak Learn.</li>
          <li>
            Tokens are <strong>non-transferable</strong> and{' '}
            <strong>not redeemable for cash</strong>.
          </li>
          <li>
            Prices, taxes, and fees are shown at checkout. Some services may be priced in USD or
            KES.
          </li>
          <li>Certificates are charged only when you choose to generate them.</li>
        </ul>
        <p>
          Refunds and cancellations are governed by our{' '}
          <Link href="/refunds" className="text-primary underline">
            Refund & Cancellation Policy
          </Link>
          .
        </p>

        <h2 className="text-lg font-semibold">4) Live sessions; videos/courses</h2>
        <p>
          For live sessions, we place a token hold and capture upon completion. Video/course
          purchases grant streaming access immediately after payment.
        </p>

        <h2 className="text-lg font-semibold">5) Tutors</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Tutors must provide accurate listings and deliver services professionally.</li>
          <li>
            Payouts occur after completion and any required verification, minus platform fees.
          </li>
          <li>
            Tutors are responsible for applicable taxes and compliance in their jurisdictions.
          </li>
        </ul>

        <h2 className="text-lg font-semibold">6) Institutional plans</h2>
        <p>
          Institutions may subscribe for seats; provisioning and billing terms are described in our{' '}
          <Link href="/fulfillment" className="text-primary underline">
            Fulfillment Policy
          </Link>{' '}
          and order forms or MSAs.
        </p>

        <h2 className="text-lg font-semibold">7) Acceptable use</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>No harassment, hate speech, IP infringement, or unlawful activity.</li>
          <li>
            No spamming or unsolicited marketing—see our{' '}
            <Link href="/anti-spam-policy" className="text-primary underline">
              Anti-Spam Policy
            </Link>
            .
          </li>
          <li>No attempts to bypass security, scrape at scale, or interfere with the service.</li>
        </ul>

        <h2 className="text-lg font-semibold">8) Content & IP</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            You retain rights to your uploads. You grant us a license to host, stream, and display
            them on the platform.
          </li>
          <li>
            Do not upload content you don’t have rights to. We honor reasonable takedown requests.
          </li>
          <li>Our trademarks, brand, and code are protected; do not misuse them.</li>
        </ul>

        <h2 className="text-lg font-semibold">9) Disclaimers</h2>
        <p>
          Services are provided “as is” without warranties. We do not guarantee outcomes, grades, or
          results.
        </p>

        <h2 className="text-lg font-semibold">10) Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, our liability is limited to the amount you paid
          for the service giving rise to the claim.
        </p>

        <h2 className="text-lg font-semibold">11) Termination</h2>
        <p>
          We may suspend or terminate accounts for violations. You may stop using the services at
          any time.
        </p>

        <h2 className="text-lg font-semibold">12) Governing law; disputes</h2>
        <p>
          Kenyan law governs these Terms. We encourage good-faith resolution first; courts in Kenya
          have jurisdiction, without prejudice to any consumer rights you hold.
        </p>

        <h2 className="text-lg font-semibold">13) Changes</h2>
        <p>We may update these Terms; continued use means you accept the updated terms.</p>

        <h2 className="text-lg font-semibold">14) Contact</h2>
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
      </section>
    </main>
  );
}
