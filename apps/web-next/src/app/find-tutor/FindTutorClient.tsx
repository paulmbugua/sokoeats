'use client';

import React, { Suspense } from 'react';
import FindTutor from '@/legacy-pages/FindTutor.web';

export default function FindTutorClient() {
  return (
    <Suspense fallback={null}>
      <FindTutor />
    </Suspense>
  );
}
