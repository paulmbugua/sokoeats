import Link from 'next/link';

const policyLinks = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/anti-spam', label: 'Anti-Spam' },
  { href: '/refunds', label: 'Refunds' },
  { href: '/complaints', label: 'Complaints' },
  { href: '/fulfillment', label: 'Fulfillment' },
  { href: '/payment-flow', label: 'Payment Flow' },
];

type TrustBlockProps = {
  compactNote?: boolean;
};

export default function TrustBlock({ compactNote = true }: TrustBlockProps) {
  return (
    <section className="mx-auto mt-8 w-full max-w-5xl rounded-2xl border border-slate-200 bg-white/90 p-5 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100">
      {compactNote ? (
        <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          Secure sign-in on daybreaklearner.com
        </p>
      ) : null}

      <h2 className="text-lg font-bold">DayBreak Learner</h2>
      <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
        DayBreak Learner, operated by EKAZICONNECT SOLUTIONS LTD, provides AI learning tools,
        tutor discovery, and institution-ready teaching workflows.
      </p>
      <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
        Contact:
        {' '}
        <a className="font-medium underline" href="mailto:support@daybreaklearner.com">
          support@daybreaklearner.com
        </a>
      </p>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {policyLinks.map((item) => (
          <Link key={item.href} href={item.href} className="font-medium text-indigo-700 underline dark:text-indigo-300">
            {item.label}
          </Link>
        ))}
      </div>

      <p className="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
        We never ask for credentials on third-party sites. Always verify daybreaklearner.com.
      </p>
    </section>
  );
}
