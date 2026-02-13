import { useEffect } from 'react';

const toNextPath = (path: string) => {
  const base = window.location.origin;
  return `${base}${path}`;
};

export default function InstitutionLoginRedirect() {
  useEffect(() => {
    const nextPath = `/institution/login${window.location.search || ''}`;
    window.location.replace(toNextPath(nextPath));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 text-center">
      <div>
        <p className="text-lg font-semibold">Redirecting to the official DayBreak Learner institution portal…</p>
        <p className="mt-2 text-sm text-gray-600">If you are not redirected, refresh this page.</p>
      </div>
    </div>
  );
}
