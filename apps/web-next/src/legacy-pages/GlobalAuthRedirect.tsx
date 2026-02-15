'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useShopContext } from '@mytutorapp/shared/context';
import { appUrl, siteUrl } from '@/lib/appOrigin';

type Props = {
  mode: 'consumer' | 'institution';
};

export default function GlobalAuthRedirect({ mode }: Props) {
  const router = useRouter();
  const { token, orgToken, hydrated } = useShopContext() as any;
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;

    if (mode === 'institution') {
      if (!hydrated) return;
      if (orgToken) router.replace(appUrl('/org'));
      return;
    }

    if (token) {
      router.replace(siteUrl('/profile/me'));
    }
  }, [mode, token, orgToken, hydrated, mounted, router]);

  return null;
}
