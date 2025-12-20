import { initiateB2CPayment } from './mpesaService.js';
let stripe = null;
try {
  const Stripe = (await import('stripe')).default;
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2024-06-20',
  });
} catch {
  /* stripe optional */
}

export async function payTutor({
  currency, // 'KES' | 'USD'
  amount, // number (in currency units)
  tutor: {
    id: tutorId,
    mpesa_phone_number,
    payout_method, // 'mpesa' | 'stripe' | 'paypal'
    stripe_connect_id,
    paypal_email,
  },
}) {
  if (currency === 'KES') {
    if (payout_method !== 'mpesa' || !mpesa_phone_number) {
      return {
        status: 'Pending',
        reference: null,
        raw: { note: 'Missing M-Pesa details' },
      };
    }
    try {
      const resp = await initiateB2CPayment(
        mpesa_phone_number,
        amount,
        tutorId,
      );
      return {
        status: resp?.ResponseCode === '0' ? 'Completed' : 'Pending',
        reference: resp?.ConversationID || null,
        raw: resp,
      };
    } catch (e) {
      return { status: 'Pending', reference: null, raw: { error: e?.message } };
    }
  }

  if (currency === 'USD') {
    if (payout_method === 'stripe' && stripe && stripe_connect_id) {
      try {
        // Assumes platform has available USD balance in Stripe.
        const tr = await stripe.transfers.create({
          amount: Math.round(amount * 100), // cents
          currency: 'usd',
          destination: stripe_connect_id,
          metadata: { kind: 'tutor_payout', tutorId: String(tutorId) },
        });
        return {
          status:
            tr.status === 'paid' || tr.status === 'succeeded'
              ? 'Completed'
              : 'Pending',
          reference: tr.id,
          raw: tr,
        };
      } catch (e) {
        return {
          status: 'Pending',
          reference: null,
          raw: { error: e?.message },
        };
      }
    }

    // TODO: Add PayPal payouts here if you want
    return {
      status: 'Pending',
      reference: null,
      raw: { note: 'No USD payout method configured' },
    };
  }

  return {
    status: 'Pending',
    reference: null,
    raw: { note: 'Unsupported currency' },
  };
}
