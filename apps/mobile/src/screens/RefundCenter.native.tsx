// apps/mobile/src/screens/RefundCenter.native.tsx
import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
  Linking,
  AccessibilityInfo,
  findNodeHandle,
  Platform,
  useColorScheme,
} from 'react-native';

// ✅ same selector used in CreateProfile
import SelectField from './SelectField.native';

type RefundCenterProps = {
  backendUrl: string;
  token?: string | null;
  className?: string;
};

const REASON_OPTIONS = [
  { label: 'Accidental purchase', value: 'accidental_purchase' },
  { label: 'Duplicate charge', value: 'duplicate_charge' },
  { label: 'Didn’t receive service', value: 'didnt_receive_service' },
  { label: 'Quality issue', value: 'quality_issue' },
  { label: 'Other', value: 'other' },
] as const;

const RefundCenter: React.FC<RefundCenterProps> = ({ backendUrl, token, className }) => {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const [isOpen, setIsOpen] = useState(false);

  // form states
  const [txId, setTxId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState<string>('accidental_purchase');
  const [details, setDetails] = useState('');
  const [resolution, setResolution] = useState<'original' | 'tokens'>('original');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [agree, setAgree] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const [agreeErr, setAgreeErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const scrollRef = useRef<ScrollView | null>(null);
  const agreeRowRef = useRef<View | null>(null);

  const fmtErr = (e: unknown) =>
    typeof e === 'object' && e && (e as any).message
      ? (e as any).message
      : String(e ?? 'Request failed');

  // Helpers
  const clampApiBase = (u: string) => u.replace(/\/+$/, '');

  async function submit() {
    setMsg(null);
    setAgreeErr(false);

    if (!token) {
      setMsg({ kind: 'err', text: 'You must be logged in to request a refund.' });
      return;
    }
    if (!txId.trim()) {
      setMsg({ kind: 'err', text: 'Please enter your Transaction / Order ID.' });
      return;
    }
    if (!agree) {
      if (!isOpen) setIsOpen(true);
      setShowPolicy(true);
      setAgreeErr(true);

      requestAnimationFrame(() => {
        if (agreeRowRef.current && scrollRef.current) {
          const h = findNodeHandle(agreeRowRef.current);
          if (h) AccessibilityInfo.setAccessibilityFocus?.(h);
          scrollRef.current.scrollToEnd({ animated: true });
        }
      });

      setMsg({ kind: 'err', text: 'Please acknowledge the refund policy.' });
      return;
    }

    setBusy(true);
    try {
      const r = await fetch(`${clampApiBase(backendUrl)}/api/payment/refunds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          transactionId: txId.trim(),
          amount: amount ? Number(amount) : undefined,
          reason,
          details,
          resolution,
          attachmentUrl: attachmentUrl || undefined,
        }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`);

      setMsg({
        kind: 'ok',
        text: 'Your refund request has been submitted. We’ll email you updates.',
      });
      setAmount('');
      setDetails('');
      setAttachmentUrl('');
      setAgree(false);
      setShowPolicy(false);
      setIsOpen(false);
    } catch (e) {
      const text = fmtErr(e);
      setMsg({ kind: 'err', text });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      className={`rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] p-4 ${
        className || ''
      }`}
    >
      {!isOpen ? (
        <View className="flex-row items-center justify-end">
          <Pressable
            onPress={() => setIsOpen(true)}
            className="h-10 px-4 rounded-xl bg-indigo-600"
            android_ripple={{ color: isDark ? 'rgba(255,255,255,0.08)' : '#c7d2fe' }}
          >
            <Text className="text-white font-semibold leading-10">Request a refund</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled">
          {/* Header row */}
          <View className="flex-row items-center justify-between">
            <Text className="font-semibold text-slate-900 dark:text-white">Refund Request</Text>
            <Pressable
              onPress={() => setIsOpen(false)}
              className="px-3 py-2 rounded-lg bg-[#e7edf4] dark:bg-[#172534]"
            >
              <Text className="text-sm text-slate-900 dark:text-white">Close ✕</Text>
            </Pressable>
          </View>

          {/* Policy */}
          {showPolicy && (
            <View className="mt-3 rounded-xl p-3 bg-[#f6f9fc] dark:bg-[#0b1620] border border-[#cedbe8] dark:border-[#182430]">
              <Text className="font-semibold mb-1 text-slate-900 dark:text-white">
                Refund policy (summary)
              </Text>
              <View className="pl-3">
                <Text className="text-sm leading-5 text-slate-700 dark:text-white/80">
                  • Requests within 7 days of purchase are usually eligible.
                </Text>
                <Text className="text-sm leading-5 text-slate-700 dark:text-white/80">
                  • We review course progress and usage to determine eligibility.
                </Text>
                <Text className="text-sm leading-5 text-slate-700 dark:text-white/80">
                  • Abuse, repeated refunds, or completed certificates may be ineligible.
                </Text>
                <Text className="text-sm leading-5 text-slate-700 dark:text-white/80">
                  • Approved refunds are returned to the original method or as tokens (your choice).
                </Text>
              </View>
            </View>
          )}

          {/* Message banner */}
          {msg && (
            <View
              className={`mt-3 rounded-lg px-3 py-2 ${
                msg.kind === 'ok'
                  ? 'bg-emerald-50 border border-emerald-200'
                  : 'bg-rose-50 border border-rose-200'
              }`}
            >
              <Text className={msg.kind === 'ok' ? 'text-emerald-900' : 'text-rose-900'}>
                {msg.text}
              </Text>
            </View>
          )}

          {/* Form */}
          <View className="mt-3">
            {/* Row 1 */}
            <View className="flex-col md:flex-row md:gap-3">
              <View className="mb-3">
                <Text className="text-sm font-medium mb-1 text-slate-800 dark:text-white">
                  Transaction / Order ID
                </Text>
                <TextInput
                  value={txId}
                  onChangeText={setTxId}
                  placeholder="ABC-123..."
                  className="h-11 rounded-xl px-3 border border-[#cedbe8] dark:border-darkCard bg-slate-50 dark:bg-[#0f1821] text-slate-900 dark:text-white"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View className="mb-3">
                <Text className="text-sm font-medium mb-1 text-slate-800 dark:text-white">
                  Amount (optional)
                </Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="Leave blank for full"
                  keyboardType="decimal-pad"
                  className="h-11 rounded-xl px-3 border border-[#cedbe8] dark:border-darkCard bg-slate-50 dark:bg-[#0f1821] text-slate-900 dark:text-white"
                />
              </View>
            </View>

            {/* ✅ Reason (SelectField instead of Picker) */}
            <View className="mt-1">
              <SelectField
                label="Reason"
                value={reason}
                placeholder="Select a reason…"
                options={REASON_OPTIONS as any}
                onChange={(v) => setReason(String(v))}
              />
            </View>

            {/* Details */}
            <View className="mt-3">
              <Text className="text-sm font-medium mb-1 text-slate-800 dark:text-white">
                Additional details
              </Text>
              <TextInput
                value={details}
                onChangeText={setDetails}
                multiline
                textAlignVertical="top"
                className="min-h-[80px] rounded-xl px-3 py-2 border border-[#cedbe8] dark:border-darkCard bg-slate-50 dark:bg-[#0f1821] text-slate-900 dark:text-white"
              />
            </View>

            {/* Attachment URL */}
            <View className="mt-3">
              <Text className="text-sm font-medium mb-1 text-slate-800 dark:text-white">
                Attachment URL (optional)
              </Text>
              <TextInput
                value={attachmentUrl}
                onChangeText={setAttachmentUrl}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="https://…"
                className="h-11 rounded-xl px-3 border border-[#cedbe8] dark:border-darkCard bg-slate-50 dark:bg-[#0f1821] text-slate-900 dark:text-white"
              />
            </View>

            {/* Resolution toggle */}
            <View className="mt-3">
              <Text className="text-sm font-medium mb-1 text-slate-800 dark:text-white">
                Refund as
              </Text>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => setResolution('original')}
                  className={`px-3 py-2 rounded-xl border ${
                    resolution === 'original'
                      ? 'bg-indigo-600 border-indigo-600'
                      : 'bg-white dark:bg-[#0f1821] border-[#cedbe8] dark:border-darkCard'
                  }`}
                >
                  <Text
                    className={
                      resolution === 'original'
                        ? 'text-white font-semibold'
                        : 'text-slate-800 dark:text-white'
                    }
                  >
                    Original method
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setResolution('tokens')}
                  className={`px-3 py-2 rounded-xl border ${
                    resolution === 'tokens'
                      ? 'bg-indigo-600 border-indigo-600'
                      : 'bg-white dark:bg-[#0f1821] border-[#cedbe8] dark:border-darkCard'
                  }`}
                >
                  <Text
                    className={
                      resolution === 'tokens'
                        ? 'text-white font-semibold'
                        : 'text-slate-800 dark:text-white'
                    }
                  >
                    Tokens
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Agree row */}
            <View
              ref={agreeRowRef}
              className={`mt-3 rounded-xl px-3 py-2 ${agreeErr ? 'border border-rose-400' : ''}`}
              accessible
              accessibilityLabel="Agree to refund policy"
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-sm text-slate-800 dark:text-white">
                  I agree to the refund policy
                </Text>
                <Switch
                  value={agree}
                  onValueChange={(v) => {
                    setAgree(v);
                    if (agreeErr && v) setAgreeErr(false);
                  }}
                />
              </View>
              <Pressable onPress={() => setShowPolicy((v) => !v)} className="mt-1">
                <Text className="text-xs underline text-[#49739c]">
                  {showPolicy ? 'Hide policy' : 'View policy'}
                </Text>
              </Pressable>
            </View>

            {/* Actions */}
            <View className="mt-4 flex-row items-center gap-2">
              <Pressable
                disabled={busy}
                onPress={submit}
                className={`h-10 px-4 rounded-xl bg-indigo-600 ${busy ? 'opacity-60' : ''}`}
              >
                <Text className="text-white font-semibold leading-10">
                  {busy ? 'Submitting…' : 'Submit refund request'}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  const url = `${clampApiBase(backendUrl)}/support`;
                  Linking.openURL(url).catch(() => {
                    Alert.alert('Support', 'Please contact support via the website.');
                  });
                }}
              >
                <Text className="text-xs underline text-[#49739c]">Need help? Contact support</Text>
              </Pressable>
            </View>

            {busy && (
              <View className="mt-3">
                <ActivityIndicator />
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
};

export default RefundCenter;
