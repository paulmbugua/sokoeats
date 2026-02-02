'use client';

import dynamic from 'next/dynamic';

const Analytics = dynamic(() => import('./Analytics'), {
  ssr: false,
  loading: () => null,
});

export default function AnalyticsClient() {
  return <Analytics />;
}
