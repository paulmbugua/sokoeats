// apps/web/src/components/Footer.web.tsx (or wherever it lives)
'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useShopContext } from '@mytutorapp/shared/context';
import { appUrl } from '@/lib/appOrigin';
import { publicEnv } from '@/lib/env';

const Footer: React.FC = () => {
  const router = useRouter();
  const { token, orgToken, logout, orgLogout } = useShopContext() as any;
  const playStoreBadgeUrl =
    publicEnv.playStoreBadgeUrl ||
    'https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png';

  const handleJoinClick = () => {
    // "Become a Tutor" should only care about normal user accounts
    if (!token) {
      window.location.href = '/login';
      return;
    }
    window.location.href = appUrl('/become-tutor');
  };

  const handleAuthClick = async () => {
    const isAnyLoggedIn = Boolean(token || orgToken);

    if (isAnyLoggedIn) {
      // Log out whichever identity is active
      try {
        if (orgToken && typeof orgLogout === 'function') {
          await orgLogout();
        }
        if (token && typeof logout === 'function') {
          await logout();
        }
      } finally {
        // After any logout, go back to main landing flow
        router.replace('/');
      }
    } else {
      // When it's showing "Login", always go to the normal user login page
      window.location.href = '/login';
    }
  };

  const isAnyLoggedIn = Boolean(token || orgToken);

  return (
    <footer className="bg-white text-darkText dark:bg-darkCard dark:text-darkTextPrimary border-t border-gray-200 dark:border-darkCard">
      <div className="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-10">
        {/* Top CTA Row */}
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between pb-6 mb-6 border-b border-gray-200 dark:border-darkCard">
          <div className="text-center md:text-left">
            <p className="text-lg font-semibold">Become a Tutor!</p>
            <button
              onClick={handleJoinClick}
              className="mt-1 inline-flex items-center gap-1 text-primary hover:underline focus:outline-none"
            >
              Join <span className="font-bold">DayBreak Tutors</span>
            </button>
          </div>

          <div className="text-center md:text-left">
            <p className="text-lg font-semibold">Partner with Us!</p>
            <a href="#" className="mt-1 inline-block text-primary hover:underline">
              DayBreak <span className="font-bold">PARTNERS</span>
            </a>
          </div>

          <div className="text-center md:text-left">
            <p className="text-lg font-semibold">Need Assistance?</p>
            <Link href="/help" className="mt-1 inline-block text-primary hover:underline">
              FAQ / Contact Support
            </Link>
          </div>

          <div className="flex items-center justify-center gap-4">
            <a href="#" className="hover:text-primary transition">
              Facebook
            </a>
            <a href="#" className="hover:text-primary transition">
              Telegram
            </a>
          </div>
        </div>

        {/* Middle: Contact + Store */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 pb-6 mb-6 border-b border-gray-200 dark:border-darkCard">
          {/* Contact info */}
          <div className="md:w-1/3 text-center md:text-left text-sm text-mutedGray dark:text-darkTextSecondary">
            <p className="mb-3">Support • FAQ • Partner with Us • Report Issues</p>
            <p className="text-xs leading-relaxed">
              <strong>EKAZICONNECT SOLUTIONS LTD</strong>
              <br />
              Registered Office: International House, Mama Ngina Street, CBD, Nairobi
              <br />
              Phones: <a href="tel:+254728872800">+254 728 872 800</a> •{' '}
              <a href="tel:+254720423764">+254 720 423 764</a> •{' '}
              <a href="tel:+254758276900">+254 758 276 900</a>
              <br />
              Email: <a href="mailto:support@daybreaklearner.com">support@daybreaklearner.com</a>
            </p>
          </div>

          {/* Center buttons */}
          <div className="md:w-1/3 flex flex-col items-center justify-center gap-3">
            <Link
              href="/find-tutor"
              className="px-4 py-2 rounded-md bg-primary text-white hover:opacity-90 transition"
            >
              Find Tutors
            </Link>

            <button
              onClick={handleAuthClick}
              className="px-4 py-2 rounded-md text-primary font-bold hover:underline transition"
            >
              {isAnyLoggedIn ? 'Log out' : 'Login'}
            </button>
          </div>

          {/* Store badge */}
  
          <div className="md:w-1/3 flex justify-center md:justify-end items-center">
            <a
              href="https://play.google.com/store/apps/details?id=com.paulmbugua2.mytutorapp"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Get the DayBreak app on Google Play"
              className="inline-flex"
            >
              <img
                src={playStoreBadgeUrl}
                alt="Get it on Google Play"
                className="h-12 md:h-14 lg:h-16"
              />
            </a>
          </div>

        </div>

        {/* Policy Links */}
        <div className="w-full text-center">
          <div className="grid grid-cols-2 place-items-center sm:flex sm:flex-wrap sm:justify-center gap-3 sm:gap-6 text-xs">
            <Link href="/privacy-policy" className="hover:text-primary">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-primary">
              Terms of Service
            </Link>
            <Link href="/anti-spam-policy" className="hover:text-primary">
              Anti-Spam Policy
            </Link>
            <Link href="/complaints-feedback" className="hover:text-primary">
              Complaints & Feedback
            </Link>
            <Link href="/refunds" className="hover:text-primary">
              Refund & Cancellation Policy
            </Link>
            <Link href="/fulfillment" className="hover:text-primary">
              Fulfillment & Delivery Policy
            </Link>
            <Link href="/payment-flow" className="hover:text-primary">
              How Payments Work
            </Link>
          </div>
        </div>

        {/* Bottom Copy */}
        <div className="mt-8 text-center space-y-2 text-xs text-mutedGray dark:text-darkTextSecondary">
          <h3 className="text-sm font-semibold">EXPERIENCE LIVE TUTORING ONLINE</h3>
          <p>
            Connecting with skilled tutors is easy on DayBreak.com; use any device to join a live
            session for personalized learning.
          </p>
          <p className="font-medium">HOW DOES LIVE TUTORING WORK?</p>
          <p>
            Just book a session with your preferred tutor, join the online Zoom meeting room, and
            enjoy real-time guidance.
          </p>
        </div>

        {/* Final copyright */}
        <div className="mt-6 text-center text-xs text-mutedGray dark:text-darkTextSecondary">
          © 2024 DayBreakLearner. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
