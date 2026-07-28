import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { useShopContext } from '@myhandymanapp/shared/context';
import { ScreenScroll } from '../../components/Screen';
import PrimaryButton from '../../components/PrimaryButton';
import SecondaryButton from '../../components/SecondaryButton';
import Input from '../../components/Input';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type OtpPurpose = 'phone_verification' | 'password_reset' | 'login';
type OtpDeliveryMethod = 'sms' | 'email';

type OtpRequestState = {
  sent?: boolean;
  rateLimited?: boolean;
  deliveryMethod?: OtpDeliveryMethod;
  email?: string;
  emailFallbackSent?: boolean;
  emailFallback?: { sent?: boolean; email?: string; reason?: string };
  resendCount?: number;
  smsAttemptsRemaining?: number;
  nextResendSeconds?: number;
  phone?: string;
};

function formatWait(totalSeconds: number) {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return minutes + ':' + String(seconds).padStart(2, '0');
}

export default function OtpVerifyScreen({ route, navigation }: any) {
  const { http, loginConsumer } = useShopContext();
  const phone = route.params?.phone ?? '+254700000001';
  const purpose: OtpPurpose = route.params?.purpose ?? 'phone_verification';
  const initialDeliveryMethod = route.params?.deliveryMethod as OtpDeliveryMethod | undefined;
  const isPasswordReset = purpose === 'password_reset';
  const isLogin2FA = purpose === 'login';
  const twoFactorToken = route.params?.twoFactorToken;
  const userId = route.params?.userId;

  const [deliveryMethod, setDeliveryMethod] = useState<OtpDeliveryMethod | null>(initialDeliveryMethod || null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsUntilResend, setSecondsUntilResend] = useState(0);
  const [requestState, setRequestState] = useState<OtpRequestState>({});
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const requestEndpoint = isPasswordReset ? '/api/auth/password/otp/request' : '/api/auth/otp/request';
  const methodLabel = deliveryMethod === 'email' ? 'email' : 'SMS';

  const requestCode = useCallback(async (manual = false, selectedMethod = deliveryMethod) => {
    if (!selectedMethod) return;
    setResending(true);
    try {
      const { data } = await http.post(requestEndpoint, {
        phone,
        purpose,
        userId,
        twoFactorToken,
        deliveryMethod: selectedMethod,
      });
      const nextSeconds = Number(data?.nextResendSeconds || 0);
      setSecondsUntilResend(nextSeconds);
      setRequestState(data || {});

      if (manual) {
        if (data?.rateLimited) {
          Alert.alert('Almost ready', 'You can request another code in ' + formatWait(nextSeconds) + '.');
        } else if (data?.sent) {
          const target = selectedMethod === 'email' ? (data?.email || data?.emailFallback?.email || 'your email') : (data?.phone || phone);
          Alert.alert('Code sent', 'We sent your Ekazi code by ' + (selectedMethod === 'email' ? 'email to ' : 'SMS to ') + target + '.');
        }
      }
    } catch (e: any) {
      const message = e?.response?.data?.message || 'Could not request a new OTP code right now.';
      if (manual) Alert.alert('Code request failed', message);
    } finally {
      setResending(false);
    }
  }, [deliveryMethod, http, phone, purpose, requestEndpoint, twoFactorToken, userId]);

  useEffect(() => {
    if (deliveryMethod) void requestCode(false, deliveryMethod);
  }, [deliveryMethod, requestCode]);

  useEffect(() => {
    if (secondsUntilResend <= 0) return undefined;
    const timer = setInterval(() => {
      setSecondsUntilResend((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsUntilResend]);

  const chooseMethod = (method: OtpDeliveryMethod) => {
    setCode('');
    setRequestState({});
    setSecondsUntilResend(0);
    setDeliveryMethod(method);
  };

  const goNextAfterVerification = (profileComplete?: boolean) => {
    const target = profileComplete ? 'Tabs' : 'CompleteProfile';
    try {
      navigation?.navigate?.(target);
    } catch {
      // The auth context also redirects after loginConsumer updates the session.
    }
  };

  const verify = async () => {
    if (loading || verified) return;
    if (!deliveryMethod) {
      Alert.alert('Choose delivery method', 'Select SMS or Email so Ekazi can send your code.');
      return;
    }
    const cleanCode = code.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      Alert.alert('Enter the code', 'Type the 6-digit Ekazi code before continuing.');
      return;
    }
    setLoading(true);
    try {
      if (isPasswordReset) {
        if (newPassword.length < 8) {
          Alert.alert('Password too short', 'Use at least 8 characters.');
          return;
        }
        if (newPassword !== confirmPassword) {
          Alert.alert('Passwords do not match', 'Enter the same password twice.');
          return;
        }
      }
      const endpoint = isPasswordReset ? '/api/auth/password/otp/reset' : '/api/auth/otp/verify';
      const payload = isPasswordReset ? { phone, code: cleanCode, newPassword } : { phone, code: cleanCode, purpose, twoFactorToken, userId };
      const { data } = await http.post(endpoint, payload);
      setVerified(true);
      setCode('');
      await loginConsumer(data.token, {
        userId: data.user?.id,
        email: data.user?.email,
        phone: data.user?.phone,
        role: data.user?.role,
        profileComplete: data.user?.profileComplete,
      });
      Alert.alert(
        isPasswordReset ? 'Password updated' : 'Phone verified',
        isPasswordReset ? 'Your password has been reset successfully.' : 'Your Ekazi account phone number is now verified.',
        [{ text: 'Continue', onPress: () => goNextAfterVerification(Boolean(data.user?.profileComplete)) }],
      );
    } catch (e: any) {
      Alert.alert('Verification failed', e?.response?.data?.message || 'Use the latest 6-digit Ekazi code sent to you.');
    } finally {
      setLoading(false);
    }
  };

  const resendCopy = useMemo(() => {
    if (!deliveryMethod) return 'Choose a delivery method first';
    if (secondsUntilResend > 0) return 'Resend available in ' + formatWait(secondsUntilResend);
    return 'Resend by ' + methodLabel;
  }, [deliveryMethod, methodLabel, secondsUntilResend]);

  const statusCopy = useMemo(() => {
    if (!deliveryMethod) return 'Pick where you want to receive the one-time code. SMS is fastest when your line can receive short codes; Email works when SMS is blocked or delayed.';
    if (requestState.rateLimited && secondsUntilResend > 0) return 'For security, wait ' + formatWait(secondsUntilResend) + ' before requesting another code.';
    if (requestState.sent) {
      if (deliveryMethod === 'email') return 'Check your inbox for the Ekazi code. If it is not visible, check spam or promotions.';
      return 'Check your messages for the Ekazi code. If your line blocks service SMS, switch to Email.';
    }
    return 'We will send the code using your selected method.';
  }, [deliveryMethod, requestState.rateLimited, requestState.sent, secondsUntilResend]);

  return (
    <ScreenScroll backgroundColor={colors.bg} contentContainerStyle={{ justifyContent: 'center' }}>
      <View style={{ backgroundColor: 'white', borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)' }}>
        <Text style={{ textAlign: 'center', fontWeight: '900', fontSize: 28, lineHeight: 34, color: colors.ink }}>
          {isPasswordReset ? 'Reset your password' : isLogin2FA ? 'Secure sign in' : 'Verify your phone'}
        </Text>
        <Text style={{ textAlign: 'center', color: colors.mutedDark, marginTop: 12, fontSize: typography.body, lineHeight: 24 }}>
          Choose how Ekazi should send your 6-digit code.
        </Text>
        <Text style={{ textAlign: 'center', fontWeight: '900', fontSize: 17, marginTop: 4, color: colors.ink }}>
          {deliveryMethod === 'email' ? requestState.email || requestState.emailFallback?.email || 'Your account email' : requestState.phone || phone}
        </Text>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: spacing.lg }}>
          <SecondaryButton
            title={resending && deliveryMethod === 'sms' ? 'Sending...' : 'Send via SMS'}
            onPress={() => chooseMethod('sms')}
            style={{ flex: 1, borderColor: deliveryMethod === 'sms' ? colors.primary : colors.border }}
          />
          <SecondaryButton
            title={resending && deliveryMethod === 'email' ? 'Sending...' : 'Send via Email'}
            onPress={() => chooseMethod('email')}
            style={{ flex: 1, borderColor: deliveryMethod === 'email' ? colors.primary : colors.border }}
          />
        </View>

        <View style={{ alignItems: 'center', marginTop: 24 }}>
          <TextInput
            value={code}
            onChangeText={setCode}
            maxLength={6}
            keyboardType="number-pad"
            placeholder="000000"
            placeholderTextColor={colors.border}
            editable={Boolean(deliveryMethod)}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.lg,
              backgroundColor: '#F8FAFC',
              paddingHorizontal: 18,
              paddingVertical: 14,
              fontSize: 24,
              letterSpacing: 8,
              textAlign: 'center',
              width: 224,
              color: colors.ink,
              fontWeight: '900',
              opacity: deliveryMethod ? 1 : 0.5,
            }}
          />
        </View>

        {isPasswordReset ? (
          <View style={{ marginTop: spacing.lg, gap: 12 }}>
            <Input label="New Password" value={newPassword} onChangeText={setNewPassword} placeholder="At least 8 characters" secureTextEntry />
            <Input label="Confirm New Password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Repeat new password" secureTextEntry />
          </View>
        ) : null}

        <View style={{ marginTop: 18 }}>
          <PrimaryButton title={verified ? 'Verified' : loading ? 'Verifying...' : isPasswordReset ? 'Reset password' : 'Continue'} onPress={verify} disabled={loading || verified || !deliveryMethod} />
        </View>

        <View style={{ marginTop: 12 }}>
          <SecondaryButton
            title={resending ? 'Requesting...' : resendCopy}
            onPress={() => requestCode(true)}
            disabled={resending || !deliveryMethod || secondsUntilResend > 0}
          />
        </View>

        <Text style={{ textAlign: 'center', color: colors.mutedDark, fontSize: 13, lineHeight: 19, marginTop: 14 }}>
          {statusCopy}
        </Text>
      </View>
    </ScreenScroll>
  );
}
