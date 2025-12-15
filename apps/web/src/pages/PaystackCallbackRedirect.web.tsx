import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function PaystackCallbackRedirectWeb() {
  const { search } = useLocation();

  useEffect(() => {
    // Redirect into the native app using your scheme
    // Keep the query string Paystack provides (reference, trxref, etc)
    const deep = `daybreak://paystack-callback${search || ''}`;

    // Use replace so user can’t go “back” into this page loop
    window.location.replace(deep);

    // Optional: after a short delay, show a fallback link
  }, [search]);

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h2>Returning to the app…</h2>
      <p>If nothing happens, open the app manually.</p>
    </div>
  );
}
