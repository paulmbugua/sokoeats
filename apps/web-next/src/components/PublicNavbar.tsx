import Link from 'next/link';
import { appUrl } from '@/lib/appOrigin';

const navLinks = [
  { href: '/robot-teach', label: 'Robot Teacher' },
  { href: '/resources', label: 'Resources' },
  { href: '/find-tutor', label: 'Find Tutor' },
  { href: '/courses', label: 'Courses' },
];

const PublicNavbar = () => {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
            D
          </span>
          <span className="tracking-tight">DayBreak</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-600 md:flex">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-slate-900">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href={appUrl('/org/login?next=/org')}
            className="hidden rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 sm:inline-flex"
          >
            For Institutions
          </Link>
          <Link
            href={appUrl('/login')}
            className="inline-flex rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500"
          >
            Get started
          </Link>
        </div>
      </div>

      <div className="border-t border-slate-200 px-4 py-3 text-xs font-semibold text-slate-600 md:hidden">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap gap-3">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-slate-900">
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
};

export default PublicNavbar;
