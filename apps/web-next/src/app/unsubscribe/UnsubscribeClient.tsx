'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const Unsubscribe = dynamic(() => import('@/legacy-pages/Unsubscribe'), {
  ssr: false,
  loading: () => null,
});

export default function UnsubscribeClient() {
  return <Unsubscribe />;
}
