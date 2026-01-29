'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { trackPageView } from '@/analytics/ga4';

export default function AnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    const search = searchParams?.toString();
    const path = search ? `${pathname}?${search}` : pathname;
    trackPageView(path);
  }, [pathname, searchParams]);

  return null;
}
