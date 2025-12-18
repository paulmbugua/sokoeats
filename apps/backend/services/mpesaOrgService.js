import axios from 'axios';
import { normalizePhoneNumber } from '../utils/phoneUtils.js';
import {
  getAccessToken,
  mpesaTimestamp,
  mpesaPassword,
  shortcode,
  MPESA_BASE,
} from '../utils/mpesa.js';

/**
 * STK Push for Organization Subscription (NO DB writes)
 * - amount must be integer KES
 * - callbackUrl must be absolute URL (Daraja requires it)
 */
export async function stkPushOrgSubscription({
  phone,
  amount,
  accountReference,
  description,
  callbackUrl,
}) {
  if (!phone) throw new Error('phone is required');

  const amountInt = Math.max(1, Math.round(Number(amount)));
  if (!Number.isFinite(amountInt) || amountInt <= 0) {
    throw new Error('amount must be a positive integer KES');
  }

  const cb = String(callbackUrl || process.env.MPESA_ORG_CALLBACK_URL || '').trim();
  if (!cb) {
    // This is a common silent-fail cause on Daraja
    throw new Error('MPESA_ORG_CALLBACK_URL is missing');
  }

  const accessToken = await getAccessToken();
  const ts = mpesaTimestamp();
  const pwd = mpesaPassword(ts);
  const msisdn = normalizePhoneNumber(phone);

  const payload = {
    BusinessShortCode: shortcode,
    Password: pwd,
    Timestamp: ts,
    TransactionType: 'CustomerPayBillOnline',
    Amount: amountInt,
    PartyA: msisdn,
    PartyB: shortcode,
    PhoneNumber: msisdn,
    CallBackURL: cb,
    AccountReference: String(accountReference || 'OrgSub').slice(0, 12),
    TransactionDesc: String(description || 'Organization subscription').slice(0, 100),
  };

  const url = `${MPESA_BASE}/mpesa/stkpush/v1/processrequest`;
  const { data } = await axios.post(url, payload, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return data; // { MerchantRequestID, CheckoutRequestID, ResponseCode, ... }
}
