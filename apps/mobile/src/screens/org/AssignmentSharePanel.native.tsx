/* eslint-disable prettier/prettier */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import DateTimePicker from '@react-native-community/datetimepicker';
// ❌ remove this line:
// import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import tw from '../../../tailwind';

import { createOrgAssignment, getOrgUsage } from '@mytutorapp/shared/api/orgApi';
import type { CreateAssignmentBody } from '@mytutorapp/shared/api/orgApi';
import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';

// Optional QR dependency (react-native-qrcode-svg)
let QRCodeComponent: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  QRCodeComponent = require('react-native-qrcode-svg').default;
} catch {
  QRCodeComponent = null;
}

type Props = {
  courseId: string;
  suggestedTitle?: string;
  defaultPassMark?: number | null;
  defaultTimerS?: number | null;
};

const AssignmentSharePanelNative: React.FC<Props> = ({
  courseId,
  suggestedTitle = '',
  defaultPassMark = null,
  defaultTimerS = null,
}) => {
  const { backendUrl, token } = useShopContext();
  const { activeOrgId, org, orgSeats, orgTier } = useOrg();

  const [titleOverride, setTitleOverride] = useState(suggestedTitle);
  const [passMark, setPassMark] = useState<number | ''>(defaultPassMark ?? '');
  const [timerS, setTimerS] = useState<number | ''>(defaultTimerS ?? '');
  const [dueAt, setDueAt] = useState<Date | null>(null);
  const [maxAttempts, setMaxAttempts] = useState<number>(1);

  const [creating, setCreating] = useState(false);
  const [shareUrl, setShareUrl] = useState<string>('');
  const [err, setErr] = useState<string>('');
  const [seatsUsed, setSeatsUsed] = useState<number | null>(null);

  const [showDatePicker, setShowDatePicker] = useState(false);

  const orgName = org?.name || 'Your organization';

  // Build a base host for join links (native has no window.location)
  const inviteBase = useMemo(() => {
    if (backendUrl && backendUrl.length > 0) {
      const base = backendUrl.replace(/\/+$/, '');
      const maybeApp = base.replace(/\/api($|\/.*)/i, '');
      return `${maybeApp}/org/join`;
    }
    return 'https://app.mytutorapp.com/org/join';
  }, [backendUrl]);

  // Seat usage hint (non-blocking UX)
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!backendUrl || !token || !activeOrgId) return;
      try {
        const { seats_used } = await getOrgUsage(backendUrl, token, activeOrgId);
        if (mounted) setSeatsUsed(seats_used);
      } catch {
        // silent
      }
    })();
    return () => {
      mounted = false;
    };
  }, [backendUrl, token, activeOrgId]);

  const onCreate = useCallback(async () => {
    setErr('');
    setShareUrl('');
    if (!token || !activeOrgId) {
      setErr('You must be signed in and have an active organization.');
      Alert.alert('Missing access', 'Sign in and select an organization first.');
      return;
    }
    if (!courseId) {
      setErr('Missing courseId.');
      Alert.alert('Missing data', 'No course selected.');
      return;
    }

    setCreating(true);
    try {
      const body: CreateAssignmentBody & { max_attempts?: number | null } = {
        courseId,
        title_override: titleOverride || null,
        pass_mark: passMark === '' ? null : Number(passMark),
        timer_s: timerS === '' ? null : Number(timerS),
        due_at: dueAt ? dueAt.toISOString() : null,
        max_attempts: maxAttempts ?? 1,
      };
      const resp = await createOrgAssignment(backendUrl, token, activeOrgId, body);
      const url = `${inviteBase}/${resp.invite_code}`;
      setShareUrl(url);
      Alert.alert('Invite created', 'You can copy or share the invite link.');
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'Failed to create assignment.';
      setErr(msg);
      Alert.alert('Error', msg);
    } finally {
      setCreating(false);
    }
  }, [
    token,
    activeOrgId,
    courseId,
    titleOverride,
    passMark,
    timerS,
    dueAt,
    maxAttempts,
    backendUrl,
    inviteBase,
  ]);

  const copy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await Clipboard.setStringAsync(shareUrl);
      Alert.alert('Copied', 'Invite link copied to clipboard.');
    } catch {
      // ignore
    }
  }, [shareUrl]);

  const openMail = useCallback(() => {
    if (!shareUrl) return;
    const subject = encodeURIComponent(`You're invited to ${orgName}`);
    const body = encodeURIComponent(
      `Hi,\n\nYou've been assigned a course by ${orgName}.\n\nOpen this link to start:\n${shareUrl}\n\nGood luck!`
    );
    const href = `mailto:?subject=${subject}&body=${body}`;
    Linking.openURL(href).catch(() => Alert.alert('Error', 'Unable to open mail app.'));
  }, [shareUrl, orgName]);

  const openWhatsApp = useCallback(() => {
    if (!shareUrl) return;
    const text = encodeURIComponent(`You're invited to a course by ${orgName}: ${shareUrl}`);
    const href = `https://wa.me/?text=${text}`;
    Linking.openURL(href).catch(() => Alert.alert('Error', 'Unable to open WhatsApp.'));
  }, [shareUrl, orgName]);

  const openLink = useCallback(() => {
    if (!shareUrl) return;
    Linking.openURL(shareUrl).catch(() => Alert.alert('Error', 'Unable to open link.'));
  }, [shareUrl]);

  const formatDateShort = (d: Date | null) => {
    if (!d) return 'No due date';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(
      2,
      '0'
    )}`;
  };

  // 🔧 Derive the correct event type from the component (no direct import needed)
  type PickerOnChangeParams = Parameters<
    NonNullable<React.ComponentProps<typeof DateTimePicker>['onChange']>
  >;
  type PickerEvent = PickerOnChangeParams[0];

  const handleDueChange = (_event: PickerEvent, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) setDueAt(selectedDate);
  };

  return (
    <ScrollView
      style={tw`flex-1 bg-[#0b1220]`}
      contentContainerStyle={tw`px-4 py-5`}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={tw`flex-row items-start justify-between`}>
        <View style={tw`flex-1 pr-3`}>
          <Text style={tw`text-white text-lg font-semibold`}>Share with learners</Text>
          <Text style={tw`text-white/70 text-sm`}>
            Create an assignment → get a magic link → share via link, email, WhatsApp, or QR.
          </Text>
        </View>
        <BadgeSeats tier={orgTier} used={seatsUsed} total={orgSeats} />
      </View>

      {/* Form */}
      <View style={tw`mt-4`}>
        <Field
          label="Assignment title (optional)"
          value={titleOverride}
          onChangeText={setTitleOverride}
          placeholder="e.g., Safety 101 – Team A"
        />

        <NumberField
          label="Pass mark % (optional)"
          value={passMark}
          onChange={(n) => setPassMark(n)}
          placeholder={`${org?.default_pass_mark ?? 70}`}
          min={1}
          max={100}
        />

        <NumberField
          label="Timer (seconds, optional)"
          value={timerS}
          onChange={(n) => setTimerS(n)}
          placeholder={`${org?.quiz_time_limit_s ?? 900}`}
          min={60}
          step={30}
        />

        {/* Due at (datetime) */}
        <View style={tw`mb-3`}>
          <Text style={tw`text-white/70 text-xs mb-1`}>Due at (optional)</Text>
          <TouchableOpacity
            onPress={() => setShowDatePicker(true)}
            style={tw`rounded-lg bg-black/40 border border-white/10 px-3 py-3`}
          >
            <Text style={tw`text-white`}>{formatDateShort(dueAt)}</Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={dueAt ?? new Date()}
              mode="datetime"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={handleDueChange}
            />
          )}
        </View>

        <NumberField
          label="Max attempts"
          value={maxAttempts}
          onChange={(n) => setMaxAttempts(Math.max(1, Number(n || 1)))}
          min={1}
        />
      </View>

      {/* Action buttons */}
      <View style={tw`mt-2 flex-row flex-wrap`}>
        <PrimaryButton
          title={creating ? 'Creating…' : 'Create invite'}
          onPress={onCreate}
          disabled={creating}
        />

        {!!shareUrl && (
          <>
            <GhostButton title="Copy link" onPress={copy} />
            <GhostButton title="Email" onPress={openMail} />
            <GhostButton title="WhatsApp" onPress={openWhatsApp} />
            <GhostButton title="Open link" onPress={openLink} />
          </>
        )}
      </View>

      {/* Link + QR */}
      {!!shareUrl && (
        <View style={tw`mt-4 flex-row items-center`}>
          <View style={tw`flex-1 mr-3`}>
            <Text
              selectable
              style={tw`text-white text-xs bg-black/40 border border-white/10 rounded-lg px-3 py-3`}
            >
              {shareUrl}
            </Text>
          </View>

          {QRCodeComponent ? (
            <View style={tw`items-center justify-center bg-white rounded-lg p-2`}>
              <QRCodeComponent value={shareUrl} size={112} />
            </View>
          ) : (
            <Text style={tw`text-white/60 text-xs w-28`}>
              Install <Text style={tw`font-semibold`}>react-native-qrcode-svg</Text> for QR
            </Text>
          )}
        </View>
      )}

      {!!err && <Text style={tw`mt-3 text-amber-300 text-sm`}>{err}</Text>}
    </ScrollView>
  );
};

export default AssignmentSharePanelNative;

/* ───────────────── UI Bits ───────────────── */

function BadgeSeats({ tier, used, total }: { tier?: string; used: number | null; total?: number }) {
  const text =
    used == null
      ? `${tier ?? 'starter'}`
      : total
        ? `${tier ?? 'starter'} · ${used}/${total} seats`
        : `${tier ?? 'starter'} · ${used} seats used`;
  return (
    <View style={tw`px-2 py-1 rounded-full bg-white/10`}>
      <Text style={tw`text-white text-xs`}>{text}</Text>
    </View>
  );
}

const Field: React.FC<{
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}> = ({ label, value, onChangeText, placeholder }) => (
  <View style={tw`mb-3`}>
    <Text style={tw`text-white/70 text-xs mb-1`}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="rgba(255,255,255,0.55)"
      style={tw`w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white`}
    />
  </View>
);

const NumberField: React.FC<{
  label: string;
  value: number | '';
  onChange: (v: number | '') => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}> = ({ label, value, onChange, placeholder, min, max }) => (
  <View style={tw`mb-3`}>
    <Text style={tw`text-white/70 text-xs mb-1`}>{label}</Text>
    <TextInput
      keyboardType="numeric"
      value={value === '' ? '' : String(value)}
      onChangeText={(raw) => {
        if (raw.trim() === '') return onChange('');
        const n = Number(raw);
        if (Number.isNaN(n)) return;
        let next = n;
        if (typeof min === 'number' && next < min) next = min;
        if (typeof max === 'number' && next > max) next = max;
        onChange(next);
      }}
      placeholder={placeholder}
      placeholderTextColor="rgba(255,255,255,0.55)"
      style={tw`w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white`}
    />
  </View>
);

const PrimaryButton: React.FC<{ title: string; onPress: () => void; disabled?: boolean }> = ({
  title,
  onPress,
  disabled,
}) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    style={tw.style(
      'px-4 py-2 rounded-xl bg-emerald-600',
      disabled ? 'opacity-60' : 'active:opacity-90',
      'mr-2 mb-2'
    )}
  >
    <Text style={tw`text-white font-semibold`}>{title}</Text>
  </TouchableOpacity>
);

const GhostButton: React.FC<{ title: string; onPress: () => void }> = ({ title, onPress }) => (
  <TouchableOpacity onPress={onPress} style={tw`px-4 py-2 rounded-xl bg-white/10 mr-2 mb-2`}>
    <Text style={tw`text-white`}>{title}</Text>
  </TouchableOpacity>
);
