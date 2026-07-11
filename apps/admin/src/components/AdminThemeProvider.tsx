import React, { useEffect } from 'react';

type Props = {
  children: React.ReactNode;
  storageKey?: string;
};

export default function AdminThemeProvider({ children, storageKey = 'theme' }: Props) {
  useEffect(() => {
    const root = document.documentElement;
    const stored = localStorage.getItem(storageKey);
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    const shouldDark = stored ? stored === 'dark' : prefersDark;
    root.classList.toggle('dark', shouldDark);
    if (!stored) localStorage.setItem(storageKey, shouldDark ? 'dark' : 'light');
  }, [storageKey]);

  return <>{children}</>;
}
