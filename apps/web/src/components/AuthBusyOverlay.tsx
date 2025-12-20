import React, { useEffect, useState } from 'react';

const BUSY_KEY = 'auth:busy';

const readBusy = () => sessionStorage.getItem(BUSY_KEY) === '1';

export default function AuthBusyOverlay() {
  const [busy, setBusy] = useState(readBusy());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== sessionStorage) return;
      if (e.key === BUSY_KEY) setBusy(readBusy());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // In case the tab comes back from redirect and we didn't get a storage event:
  useEffect(() => {
    const id = window.setInterval(() => setBusy(readBusy()), 300);
    return () => window.clearInterval(id);
  }, []);

  if (!busy) return null;

  // Fullscreen, click-through blocker with a simple spinner
  return (
    <div className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm flex items-center justify-center">
      <div className="rounded-2xl bg-white dark:bg-[#0f1821] px-6 py-5 shadow-xl ring-1 ring-black/5 flex items-center gap-4">
        <svg className="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        <p className="text-sm text-darkText dark:text-darkTextPrimary">Signing you in…</p>
      </div>
    </div>
  );
}
