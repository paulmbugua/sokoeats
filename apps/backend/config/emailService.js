// apps/backend/config/emailService.js
import { sendNotification } from '../utils/sendNotification.js'; // <- adjust path to where your util lives

/**
 * Send a branded OTP email that expires in 10 minutes.
 * Keeps the same API your controllers already import: sendOTP(email, otp)
 */
export async function sendOTP(to, otp) {
  const subject = 'Your DayBreak verification code';
  const intro =
    'Use the one-time code below to complete your password reset. ' +
    'For security, this code expires in 10 minutes.';

  // You can add a CTA to a reset page if you have one:
  // const ctaUrl  = `${process.env.APP_URL}/reset?email=${encodeURIComponent(to)}`;
  // const ctaText = 'Reset your password';

  await sendNotification({
    to,
    subject,
    details: {
      intro,
      items: {
        'One-time code': `<div style="font-size:28px;font-weight:700;letter-spacing:3px">${otp}</div>`,
        Expires: '10 minutes',
        // 'Requested for': to,
      },
      // ctaUrl,
      // ctaText,
      plainText: `Your DayBreak verification code is: ${otp}\n\nThis code expires in 10 minutes.`,
    },
  });
}
