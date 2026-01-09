// apps/web/src/pages/PrivacyPolicy.tsx
import React from 'react';
import { Link } from 'react-router-dom';

export default function PrivacyPolicy() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10 text-sm leading-6">
      <h1 className="text-2xl font-bold">Privacy Policy</h1>
      <p className="text-gray-500">Last updated: {new Date().toLocaleDateString()}</p>

      <section className="mt-6 space-y-5">
        <p>
          This Privacy Policy explains how <strong>Daybreak Learn</strong> (
          <a className="text-primary underline" href="https://www.daybreaklearner.com">
            daybreaklearner.com
          </a>
          ) operated by <strong>EKAZICONNECT SOLUTIONS LTD</strong> (“we”, “us”, “our”) collects,
          uses, and protects your information when you use our platform for live tutoring,
          tutor-published videos/courses, and AI learning (lessons, quizzes, certificates).
        </p>

        <h2 className="text-lg font-semibold">1) Information we collect</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Account & Identity</strong>: name, email, password (hashed), role
            (student/tutor/institution admin).
          </li>
          <li>
            <strong>Contact</strong>: phone numbers you provide.
          </li>
          <li>
            <strong>Profile & Content</strong>: subjects, bio, uploaded media, course/video listings
            (tutors), certificates.
          </li>
          <li>
            <strong>Transactional</strong>: purchases, token balance, bookings, completions,
            refunds; limited payment metadata. (We do <em>not</em> store full card details—handled
            by our processors.)
          </li>
          <li>
            <strong>Usage/Device</strong>: pages viewed, features used, approximate location,
            device/browser data, cookies.
          </li>
          <li>
            <strong>Communications</strong>: messages with support or tutors, feedback/complaints.
          </li>
        </ul>

        <h2 className="text-lg font-semibold">2) How we use your information</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            Provide and improve our services (sessions, videos/courses, AI learning and quizzes).
          </li>
          <li>Process payments, tokens, bookings, tutor payouts, and institution subscriptions.</li>
          <li>
            Prevent fraud and abuse, secure accounts, and enforce our{' '}
            <Link to="/terms" className="text-primary underline">
              Terms
            </Link>
            .
          </li>
          <li>Send transactional notices (receipts, booking updates, certificate ready).</li>
          <li>With your consent, send product updates/marketing (you can opt out anytime).</li>
          <li>Comply with legal obligations and resolve disputes.</li>
        </ul>

        <h2 className="text-lg font-semibold">3) Legal bases (where applicable)</h2>
        <p>
          Contract (providing the service), Legitimate interests (security, improvement), Consent
          (marketing, some cookies), Legal obligation (records, compliance).
        </p>

        <h2 className="text-lg font-semibold">4) Sharing & disclosure</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Processors</strong>: hosting, analytics, email/SMS, payments (e.g.,
            Paystack/M-Pesa), customer support tools.
          </li>
          <li>
            <strong>Tutors</strong>: when you book/buy, tutors see the details needed to deliver the
            service.
          </li>
          <li>
            <strong>Institutions</strong>: if your seat is provided by an institution, relevant
            learning/certificate data may be visible to its admins.
          </li>
          <li>
            <strong>Legal</strong>: to comply with law, prevent fraud, or protect rights.
          </li>
        </ul>

        <h2 className="text-lg font-semibold">5) International transfers</h2>
        <p>
          Your data may be processed outside your country. We use reasonable safeguards (e.g.,
          contractual protections, encryption in transit).
        </p>

        <h2 className="text-lg font-semibold">6) Retention</h2>
        <p>
          We keep data while your account is active and as required for legal/accounting purposes.
          Financial records may be retained up to seven (7) years.
        </p>

        <h2 className="text-lg font-semibold">7) Your rights</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Access, correction, deletion (subject to legal limits).</li>
          <li>Objection/restriction to certain processing; data portability where applicable.</li>
          <li>Withdraw consent (for marketing) at any time.</li>
          <li>Complain to your local data protection authority.</li>
        </ul>

        <h2 className="text-lg font-semibold">8) Children</h2>
        <p>
          Our services are intended for learners with parental/guardian consent when required by
          law. We do not knowingly collect data from children under 13 without appropriate consent.
        </p>

        <h2 className="text-lg font-semibold">9) Cookies</h2>
        <p>
          We use cookies to keep you signed in, remember preferences, and analyze usage. You can
          control cookies via your browser. Some features may not work without essential cookies.
        </p>

        <h2 className="text-lg font-semibold">10) Contact</h2>
        <div className="rounded-md p-4 bg-gray-50 dark:bg-[#121927] text-sm">
          <p>
            <strong>EKAZICONNECT SOLUTIONS LTD</strong>
          </p>
          <p>Registered Office: International House, Mama Ngina Street, CBD, Nairobi, Kenya</p>
          <p>Postal: P.O. Box 1830-01000, Thika, Kenya</p>
          <p>
            Phones: <a href="tel:+254728872800">+254 728 872 800</a> •{' '}
            <a href="tel:+254720423764">+254 720 423 764</a> •{' '}
            <a href="tel:+254758276900">+254 758 276 900</a>
          </p>
          <p>
            Email:{' '}
            <a className="text-primary" href="mailto:privacy@daybreaklearner.com">
              privacy@daybreaklearner.com
            </a>{' '}
            /{' '}
            <a className="text-primary" href="mailto:support@daybreaklearner.com">
              support@daybreaklearner.com
            </a>
          </p>
        </div>

        <p className="text-xs text-gray-500">
          See also:{' '}
          <Link to="/anti-spam-policy" className="text-primary">
            Anti-Spam Policy
          </Link>{' '}
          •{' '}
          <Link to="/complaints-feedback" className="text-primary">
            Complaints & Feedback
          </Link>
        </p>
      </section>
    </main>
  );
}
