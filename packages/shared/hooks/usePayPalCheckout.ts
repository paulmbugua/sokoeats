// packages/shared/hooks/usePayPalCheckout.ts
/// <reference types="vite/client" />

import { useEffect, useRef, useState } from 'react';
import * as paypalApi from '@mytutorapp/shared/api/paypalApi';
import { useShopContext } from '@mytutorapp/shared/context';

// ─────────────────────────────────────────────────────────────
// Minimal PayPal SDK typings used by Buttons
// ─────────────────────────────────────────────────────────────
type PayPalLayout = 'vertical' | 'horizontal';
type PayPalLabel = 'pay' | 'paypal' | 'buynow' | 'checkout';

interface PayPalButtonsStyle {
  layout?: PayPalLayout;
  label?: PayPalLabel;
}

interface PayPalOnApproveData {
  orderID: string;
}

interface PayPalButtonsOptions {
  style?: PayPalButtonsStyle;
  createOrder: () => Promise<string> | string;
  onApprove: (data: PayPalOnApproveData) => Promise<void> | void;
  onError?: (err: unknown) => void;
}

interface PayPalButtons {
  render: (container: HTMLElement) => Promise<void>;
}

interface PayPalNamespace {
  Buttons: (options: PayPalButtonsOptions) => PayPalButtons;
}

declare global {
  interface Window {
    paypal?: PayPalNamespace;
    PP_CLIENT_ID?: string;
  }
}

interface UsePayPalCheckoutOptions {
  /** Mode A (token purchase): hook does create/capture using paypalApi when packageId is provided */
  packageId?: string;
  /** Display-only; server decides the real amount */
  amountLabel?: string;

  /** Mode B (org subscription): provide your own order + approval handlers */
  createOrder?: () => Promise<string> | string;
  onApproved?: () => void;

  /** Optional UI/error knobs */
  style?: PayPalButtonsStyle;
  currency?: 'USD' | 'EUR' | 'GBP' | 'AUD' | 'CAD' | 'JPY';
  onError?: (err: unknown) => void;
}

export default function usePayPalCheckout(opts: UsePayPalCheckoutOptions) {
  const {
    packageId,
    createOrder: createOrderOverride,
    onApproved,
    style,
    currency = 'USD',
    onError,
  } = opts;

  const { token, backendUrl } = useShopContext();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load PayPal SDK
  useEffect(() => {
    const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID || window.PP_CLIENT_ID || '';
    if (!clientId) {
      setError('Missing PayPal Client ID (VITE_PAYPAL_CLIENT_ID)');
      return;
    }

    const url = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
      clientId
    )}&currency=${encodeURIComponent(currency)}&intent=capture`;

    if (document.querySelector(`script[src="${url}"]`)) {
      setReady(true);
      return;
    }

    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.onload = () => setReady(true);
    s.onerror = () => setError('Failed to load PayPal SDK');
    document.body.appendChild(s);
  }, [currency]);

  // Render PayPal Buttons
  useEffect(() => {
    if (!ready || !containerRef.current) return;

    // Must have either a packageId (Mode A) OR a custom createOrder (Mode B)
    if (!packageId && !createOrderOverride) {
      setError('Missing packageId or createOrder()');
      return;
    }

    if (!backendUrl) {
      setError('Missing backendUrl from context.');
      return;
    }
    const apiBase = backendUrl.replace(/\/+$/, '');

    containerRef.current.innerHTML = '';

    const paypal = window.paypal;
    if (!paypal?.Buttons) {
      setError('PayPal Buttons unavailable');
      return;
    }

    // Mode A: token purchase (built-in)
    const defaultCreateOrder = async (): Promise<string> => {
      try {
        if (!packageId) throw new Error('Missing packageId');
        const { id } = await paypalApi.createOrder(packageId, token, apiBase);
        return id;
      } catch (e: any) {
        const msg = e?.message || 'create-order failed';
        setError(msg);
        onError?.(e);
        throw e;
      }
    };

    const defaultOnApprove = async ({ orderID }: PayPalOnApproveData) => {
      try {
        await paypalApi.captureOrder(orderID, token, apiBase);
        await onApproved?.();
      } catch (e: any) {
        const msg = e?.message || 'capture-order failed';
        setError(msg);
        onError?.(e);
        throw e;
      }
    };

    // Mode B: org subscriptions (use caller-provided flow)
    const effectiveCreateOrder = createOrderOverride ?? defaultCreateOrder;
    const effectiveOnApprove: PayPalButtonsOptions['onApprove'] = createOrderOverride
      ? async () => {
          await onApproved?.();
        }
      : defaultOnApprove;

    paypal
      .Buttons({
        style: { layout: 'vertical', label: 'pay', ...(style || {}) },
        createOrder: effectiveCreateOrder,
        onApprove: effectiveOnApprove,
        onError: (err: unknown) => {
          setError(err instanceof Error ? err.message : 'PayPal error');
          onError?.(err);
        },
      })
      .render(containerRef.current);
  }, [ready, packageId, createOrderOverride, onApproved, style, token, backendUrl, onError]);

  return { containerRef, ready, error };
}
