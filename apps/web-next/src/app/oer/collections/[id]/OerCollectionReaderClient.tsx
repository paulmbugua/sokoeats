'use client';

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';

const OerCollectionReader = dynamic(() => import('@/legacy-pages/OerCollectionReader.web'), {
  ssr: false,
  loading: () => null,
});

export default function OerCollectionReaderClient() {
  return (
    <Suspense fallback={null}>
      <OerCollectionReader />
    </Suspense>
  );
}
