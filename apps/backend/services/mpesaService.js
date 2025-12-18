import axios from 'axios';
import pkg from 'pg';
import {
  getAccessToken,
  password,
  shortcode,
  b2cShortcode,
  callbackURL,
  timeoutURL,
  resultURL,
  timestamp,
  initiatorName,
  securityCredential,
} from '../utils/mpesa.js';
import { normalizePhoneNumber } from '../utils/phoneUtils.js';

const { Pool } = pkg;

// PostgreSQL Connection Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * STK Push (C2B) Payment
 * Handles M-Pesa STK push request for student payments.
 * Inserts a record into the payments table with status "Pending".
 */
// apps/backend/services/mpesaService.js
import axios from 'axios';
import { normalizePhoneNumber } from '../utils/phoneUtils.js';
import {
  getAccessToken,
  mpesaTimestamp,
  mpesaPassword,
  shortcode,
  MPESA_BASE,
} from '../utils/mpesa.js';

export async function stkPushC2B({ phone, amount, callbackUrl }) {
  if (!phone) throw new Error('phone is required');

  const amountInt = Math.max(1, Math.round(Number(amount)));
  if (!Number.isFinite(amountInt) || amountInt <= 0) {
    throw new Error('amount must be a positive integer KES');
  }

  const cb = String(callbackUrl || process.env.MPESA_CALLBACK_URL || '').trim();
  if (!cb) throw new Error('MPESA_CALLBACK_URL is missing');

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
    AccountReference: 'TutorAppPayment',
    TransactionDesc: 'Tutor Payment',
  };

  const url = `${MPESA_BASE}/mpesa/stkpush/v1/processrequest`;
  const { data } = await axios.post(url, payload, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return data; 
}

   

/**
 * B2C Payout (for tutor payouts)
 * Initiates a B2C payment to a tutor's phone number.
 * Inserts a record into the payments table with status "Completed".
 */
export async function initiateB2CPayment(phone, amount, userId) {
  console.log('🔹 initiateB2CPayment called with:', { phone, amount, userId });

  try {
    // 1️⃣ Get M-Pesa access token
    const accessToken = await getAccessToken();
    console.log('🔑 Retrieved M-Pesa Access Token:', accessToken);

    // 2️⃣ Normalize the number
    const normalizedPhone = normalizePhoneNumber(phone);
    console.log('📞 Normalized tutor phone number:', normalizedPhone);

    // 3️⃣ Build the B2C payload using your .env URLs
    const payload = {
      InitiatorName:      initiatorName,
      SecurityCredential: securityCredential,
      CommandID:          'SalaryPayment',
      Amount:             amount,
      PartyA:             b2cShortcode,
      PartyB:             normalizedPhone,
      Remarks:            'Tutor Payment',
      QueueTimeOutURL:    timeoutURL,   // e.g. ".../api/mpesa/timeout"
      ResultURL:          resultURL,    // e.g. ".../api/mpesa/b2c-result"
      Occasion:           'Tutor Payout',
    };
    console.log('📨 B2C payload:', payload);

    // 4️⃣ Call Safaricom
    const url = 'https://api.safaricom.co.ke/mpesa/b2c/v1/paymentrequest';
    console.log('🌐 Calling M-Pesa B2C endpoint:', url);
    const response = await axios.post(url, payload, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    console.log('✅ M-Pesa B2C response:', response.data);

    return response.data;
  } catch (error) {
    const safError = error.response?.data || error.message;
    console.error('❌ B2C Payment initiation error:', safError);
    throw new Error(
      typeof safError === 'string' ? safError : JSON.stringify(safError)
    );
  }
}