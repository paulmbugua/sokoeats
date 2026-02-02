'use client';

// apps/web/src/pages/Unsubscribe.tsx
import React, { useEffect, useState } from 'react';
import { useShopContext } from '@mytutorapp/shared/context';

export default function UnsubscribePage() {
  const { backendUrl } = useShopContext();
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [email, setEmail] = useState('');
  const params = new URLSearchParams(window.location.search);
  const token = params.get('t');
  const e = params.get('e');

  useEffect(() => {
    if (e && token) {
      (async () => {
        setState('working');
        try {
          const r = await fetch(
            `${backendUrl}/api/email/unsubscribe?e=${encodeURIComponent(e)}&t=${encodeURIComponent(token)}`
          );
          setState(r.ok ? 'done' : 'error');
        } catch {
          setState('error');
        }
      })();
    }
  }, [backendUrl, e, token]);

  // Success page (covers both token flow and manual form)
  if (state === 'done') {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-2xl font-semibold mb-2">You’re unsubscribed</h1>
        <p className="text-gray-600">We won’t email you again unless you opt back in.</p>
      </div>
    );
  }

  // Tokenized link flow status
  if (e && token) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-xl font-semibold mb-2">Updating your preferences…</h1>
        {state === 'error' && (
          <p className="text-red-600">Failed to unsubscribe. Please try the form below.</p>
        )}
      </div>
    );
  }

  // Manual form
  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-semibold mb-4">Unsubscribe</h1>
      <p className="text-gray-600 mb-4">Enter your email to stop receiving messages from us.</p>
      <form
        onSubmit={async (ev) => {
          ev.preventDefault();
          setState('working');
          try {
            const r = await fetch(`${backendUrl}/api/email/unsubscribe`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email }),
            });
            setState(r.ok ? 'done' : 'error');
          } catch {
            setState('error');
          }
        }}
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full border rounded-lg px-3 py-2 mb-3"
        />
        <button
          type="submit"
          disabled={state === 'working'}
          className="w-full px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:opacity-60"
        >
          {state === 'working' ? 'Unsubscribing…' : 'Unsubscribe'}
        </button>
      </form>

      {state === 'error' && (
        <p className="text-red-600 mt-3">Something went wrong. Please try again.</p>
      )}
    </div>
  );
}
