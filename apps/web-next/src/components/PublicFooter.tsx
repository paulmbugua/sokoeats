import Link from 'next/link';
import { appUrl } from '@/lib/appOrigin';

const policyLinks = [
  { href: '/privacy-policy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/cookie-policy', label: 'Cookie Policy' },
  { href: '/anti-spam-policy', label: 'Anti-Spam' },
  { href: '/refunds', label: 'Refunds' },
  { href: '/complaints-feedback', label: 'Complaints' },
];

const PublicFooter = () => {
  return (
    <footer className="border-t border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">
              Ready to find the right tutor?
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Explore expert tutors, learning resources, and AI-powered lessons.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={appUrl('/find-tutor')}
              className="inline-flex rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
            >
              Find Tutor
            </Link>
            <Link
              href={appUrl('/resources')}
              className="inline-flex rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
            >
              Resources
            </Link>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-xs font-semibold text-slate-500">
          {policyLinks.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-slate-800">
              {link.label}
            </Link>
          ))}
        </div>

        <div className="mt-6 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} DayBreak Learner. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

export default PublicFooter;
