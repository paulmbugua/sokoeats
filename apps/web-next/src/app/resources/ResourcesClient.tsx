'use client';

import React, { Suspense } from 'react';
import Resources from '@/legacy-pages/Resources.web';

export default function ResourcesClient() {
  return (
    <Suspense fallback={null}>
      <Resources />
    </Suspense>
  );
}
