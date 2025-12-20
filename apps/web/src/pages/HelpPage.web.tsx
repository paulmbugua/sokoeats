// apps/web/src/pages/HelpPage.web.tsx
import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';

const HelpPage: React.FC = () => {
  useEffect(() => {
    document.title = 'Help, FAQ & Support — Daybreak Learn';
  }, []);

  return (
    <main className="max-w-3xl mx-auto px-4 py-10 text-sm leading-6">
      <h1 className="text-2xl font-bold">Help, FAQ & Contact Support</h1>
      <p className="text-gray-500">New here? Start with the quick guide below.</p>

      {/* Quick links */}
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <a href="#quickstart" className="underline text-primary">
          Quick Start
        </a>
        <a href="#ai-tutor" className="underline text-primary">
          AI Tutor Studio
        </a>
        <a href="#payments" className="underline text-primary">
          Payments & Tokens
        </a>
        <a href="#troubleshooting" className="underline text-primary">
          Troubleshooting
        </a>
        <a href="#tutors" className="underline text-primary">
          For Tutors
        </a>
        <a href="#orgs" className="underline text-primary">
          For Organizations
        </a>
        <a href="#contact" className="underline text-primary">
          Contact Support
        </a>
      </div>

      {/* QUICK START */}
      <section id="quickstart" className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold">Quick Start</h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            <strong>Create your account</strong> →{' '}
            <Link to="/login" className="text-primary underline">
              Login / Sign up
            </Link>
            .
          </li>
          <li>
            <strong>Complete your profile</strong> → add your learning goals on{' '}
            <Link to="/profile/me" className="text-primary underline">
              My Profile
            </Link>
            .
          </li>
          <li>
            <strong>Find a tutor</strong> → browse and book on{' '}
            <Link to="/find-tutor" className="text-primary underline">
              Find Tutors
            </Link>
            .
          </li>
          <li>
            <strong>Join your session</strong> → we’ll send the meeting link; use any device.
          </li>
          <li>
            Prefer self-paced? Try the{' '}
            <Link to="/robot-teach" className="text-primary underline">
              AI Tutor Studio
            </Link>{' '}
            for free lessons & quizzes.
          </li>
        </ol>
      </section>

      {/* AI TUTOR STUDIO */}
      <section id="ai-tutor" className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold">AI Tutor Studio</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Pick a topic or enter your own. We generate audio lessons, slides, and captions.</li>
          <li>
            Take a quiz; score ≥ <strong>70%</strong> to unlock a certificate (optional fee applies
            only if you choose to generate it).
          </li>
          <li>If your organization gave you an assignment link, just follow it and start.</li>
        </ul>
        <p className="text-xs text-gray-500">
          See also:{' '}
          <Link to="/payment-flow" className="underline text-primary">
            How Payments Work
          </Link>{' '}
          •{' '}
          <Link to="/refunds" className="underline text-primary">
            Refund & Cancellation Policy
          </Link>
        </p>
      </section>

      {/* PAYMENTS */}
      <section id="payments" className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold">Payments & Tokens</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Tokens</strong> are store credit used for tutoring and catalog purchases.
          </li>
          <li>Some prices may appear in USD or KES; taxes/fees show at checkout.</li>
          <li>Certificates are charged only when you choose to generate them.</li>
        </ul>
        <p className="text-xs text-gray-500">
          Policies:{' '}
          <Link to="/terms" className="underline text-primary">
            Terms of Service
          </Link>{' '}
          •{' '}
          <Link to="/privacy-policy" className="underline text-primary">
            Privacy Policy
          </Link>{' '}
          •{' '}
          <Link to="/refunds" className="underline text-primary">
            Refunds
          </Link>
        </p>
      </section>

      {/* TROUBLESHOOTING */}
      <section id="troubleshooting" className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold">Troubleshooting</h2>
        <details className="rounded-md p-4 bg-gray-50 dark:bg-[#121927]">
          <summary className="font-medium cursor-pointer">I can’t log in</summary>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Reset your password from the login page.</li>
            <li>Check spam for verification or reset emails.</li>
            <li>If the issue persists, contact us (see “Contact Support”).</li>
          </ul>
        </details>

        <details className="rounded-md p-4 bg-gray-50 dark:bg-[#121927]">
          <summary className="font-medium cursor-pointer">
            Audio/video issues in live sessions
          </summary>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Restart the browser or Zoom app; check mic/camera permissions.</li>
            <li>Use a stable connection (Wi-Fi {'>'} mobile data when possible).</li>
          </ul>
        </details>

        <details className="rounded-md p-4 bg-gray-50 dark:bg-[#121927]">
          <summary className="font-medium cursor-pointer">
            AI quiz doesn’t load / certificate locked
          </summary>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Make sure you completed the lesson first, then generate the quiz.</li>
            <li>
              Score at least 70% to unlock certificates. For org assignments, timers/locks may
              apply.
            </li>
          </ul>
        </details>
      </section>

      {/* TUTORS */}
      <section id="tutors" className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold">For Tutors</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            Get started at{' '}
            <Link to="/become-tutor" className="underline text-primary">
              Become a Tutor
            </Link>
            .
          </li>
          <li>
            List services accurately and deliver professionally; payouts happen after completion and
            verification.
          </li>
          <li>
            See{' '}
            <Link to="/terms" className="underline text-primary">
              Terms
            </Link>{' '}
            and{' '}
            <Link to="/anti-spam-policy" className="underline text-primary">
              Anti-Spam Policy
            </Link>
            .
          </li>
        </ul>
      </section>

      {/* ORGS */}
      <section id="orgs" className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold">For Organizations</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            Log in to your org portal:{' '}
            <Link to="/org/login" className="underline text-primary">
              Institution Login
            </Link>
            .
          </li>
          <li>
            Provision seats and manage assignments. See{' '}
            <Link to="/fulfillment" className="underline text-primary">
              Fulfillment & Delivery
            </Link>{' '}
            and MSAs/order forms.
          </li>
        </ul>
      </section>

      {/* CONTACT */}
      <section id="contact" className="mt-10 space-y-3">
        <h2 className="text-lg font-semibold">Contact Support</h2>

        <div className="rounded-md p-4 bg-gray-50 dark:bg-[#121927]">
          <p className="font-medium">EKAZICONNECT SOLUTIONS LTD</p>
          <p>International House, Mama Ngina Street, CBD, Nairobi, Kenya</p>
          <p>Postal: P.O. Box 1830-01000, Thika, Kenya</p>
          <p className="mt-1">
            Phones:&nbsp;
            <a href="tel:+254728872800" className="text-primary underline">
              +254 728 872 800
            </a>{' '}
            •{' '}
            <a href="tel:+254720423764" className="text-primary underline">
              +254 720 423 764
            </a>{' '}
            •{' '}
            <a href="tel:+254758276900" className="text-primary underline">
              +254 758 276 900
            </a>
          </p>
          <p>
            Email:&nbsp;
            <a
              className="text-primary underline"
              href="mailto:support@daybreaklearner.com?subject=Support%20Request&body=Hi%20Daybreak%20Support%2C%0A%0AMy%20issue%3A%20"
            >
              support@daybreaklearner.com
            </a>
          </p>
          <p className="text-xs text-gray-500 mt-2">
            You can also leave structured feedback here:{' '}
            <Link to="/complaints-feedback" className="underline text-primary">
              Complaints & Feedback
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
};

export default HelpPage;
