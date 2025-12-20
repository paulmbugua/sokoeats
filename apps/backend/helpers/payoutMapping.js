// helpers/payoutMapping.js
export function toTxnMethod(payout_method) {
  switch (String(payout_method || '').toLowerCase()) {
    case 'mpesa':
      return 'M-Pesa'; // matches your CHECK list
    case 'stripe':
      return 'Stripe'; // we added it
    case 'paypal':
      return 'PayPal Payout'; // we added it
    default:
      return 'B2C'; // generic fallback if you prefer
  }
}
