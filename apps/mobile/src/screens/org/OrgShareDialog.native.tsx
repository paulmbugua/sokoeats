/* eslint-disable prettier/prettier */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Clipboard from 'expo-clipboard';
import tw from '../../../tailwind';
import { useNavigation } from '@react-navigation/native';
import type { MainStackParamList } from '../../navigation/types';
import type { StackNavigationProp } from '@react-navigation/stack';

import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import {
  createOrgAssignment,
  ensureOrgShareableAssignment,
} from '@mytutorapp/shared/api/orgApi';

type Props = {
  open: boolean;
  onClose: () => void;
  onCancel?: () => void;
  courseId: string | null | undefined;
  onResolvedCourseId?: (courseId: string) => void; // ⬅️ NEW (parity with web)
  courseTitle?: string | null;
  totalLessons?: number;
  quizCount?: number;
  minutes?: number;
};

const STARTER_MAX_TIMER = 1800;
const PLAN_DEFAULTS = {
  start: { pass: 70, time: STARTER_MAX_TIMER },
  starter: { pass: 70, time: STARTER_MAX_TIMER },
  pro: { pass: 75, time: 1200 },
  enterprise: { pass: 80, time: 1500 },
} as const;

type PlanKey = keyof typeof PLAN_DEFAULTS;

function resolvePlanDefaults(rawKey?: string) {
  const k = (rawKey ?? '').toLowerCase() as PlanKey;
  return PLAN_DEFAULTS[k] ?? PLAN_DEFAULTS.starter;
}

const hmToSeconds = (h: number, m: number) => {
  const hh = Number.isFinite(h) ? h : 0;
  const mm = Number.isFinite(m) ? m : 0;
  return Math.max(0, hh * 3600 + mm * 60);
};

const endOfDayIso = (d: Date | null): string | null => {
  if (!d) return null;
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy.toISOString();
};

// pick courseId from multiple shapes (parity with web)
const pickCourseId = (obj: any): string | null =>
  obj?.assignment?.courseId ??
  obj?.assignment?.course_id ??
  obj?.courseId ??
  obj?.course_id ??
  null;

export default function OrgShareDialogNative({
  open,
  onClose,
  onCancel,
  courseId,
  onResolvedCourseId,
  courseTitle,
  totalLessons,
  quizCount,
  minutes,
}: Props) {
  const { backendUrl, token, orgToken } = useShopContext();
  const { org, activeOrgId, orgTier } = useOrg();
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const planKey = (
    orgTier ||
    (org as any)?.subscription?.tier ||
    (org as any)?.tier ||
    (org as any)?.plan ||
    ''
  )
    .toString()
    .toLowerCase();

  const isStarter = planKey === 'start' || planKey === 'starter';
  const planDefaults = resolvePlanDefaults(planKey);

  const fixedPass = Number.isFinite(Number(org?.default_pass_mark))
    ? Number(org?.default_pass_mark)
    : planDefaults.pass;

  const baseTime = Number.isFinite(Number(org?.quiz_time_limit_s))
    ? Number(org?.quiz_time_limit_s)
    : planDefaults.time;

  const fixedTime = isStarter
    ? Math.min(baseTime || STARTER_MAX_TIMER, STARTER_MAX_TIMER)
    : baseTime;

  const lockTimer = isStarter;
  const lockPass = false;
  const lockAttempts = isStarter;

  const [titleOverride, setTitleOverride] = useState('');
  const [passMark, setPassMark] = useState<number | ''>(fixedPass);
  const [timerH, setTimerH] = useState<number>(0);
  const [timerM, setTimerM] = useState<number>(30);
  const [maxAttempts, setMaxAttempts] = useState<number>(isStarter ? 1 : 2);
  const [dueDate, setDueDate] = useState<Date | null>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [inviteLink, setInviteLink] = useState('');
  const [createdCourseId, setCreatedCourseId] = useState<string | null>(null); // ⬅️ NEW
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [quizType, setQuizType] = useState<'mcq' | 'short'>('mcq');

  // Build app origin for join links (native has no window.location)
  const inviteBase = useMemo(() => {
    if (backendUrl && backendUrl.length > 0) {
      const base = backendUrl.replace(/\/+$/, '');
      const maybeApp = base.replace(/\/api($|\/.*)/i, '');
      return `${maybeApp}/org/join`;
    }
    return 'https://app.mytutorapp.com/org/join';
  }, [backendUrl]);

  useEffect(() => {
    if (!open) return;

    // init values on (re)open
    setInviteLink('');
    setCreatedCourseId(null);
    setErr('');
    setBusy(false);
    setTitleOverride('');
    setDueDate(new Date());
    setPassMark(fixedPass);

    const initH = Math.floor((fixedTime || 0) / 3600);
    const initM = Math.floor(((fixedTime || 0) % 3600) / 60);

    if (isStarter) {
      setTimerH(0);
      setTimerM(30);
      setMaxAttempts(1);
    } else {
      setTimerH(initH);
      setTimerM(initM);
      setMaxAttempts((prev) => (prev === 1 ? 2 : prev));
    }
  }, [open, fixedPass, fixedTime, isStarter]);

  const resetLocal = () => {
    setInviteLink('');
    setCreatedCourseId(null);
    setErr('');
    setBusy(false);
    setTitleOverride('');
    setDueDate(new Date());
  };

  const handleCancel = () => {
    resetLocal();
    onCancel ? onCancel() : onClose();
  };

  const canCreate = !!courseId || !!(courseTitle && courseTitle.trim());

  const handleShare = useCallback(async () => {
    setErr('');
    const bearer = orgToken || token;
    if (!bearer) {
      Alert.alert('Sign in required', 'Please sign in to share.');
      return;
    }
    if (!activeOrgId) {
      setErr('You are not in an organization.');
      Alert.alert('No organization', 'Join or create an organization first.');
      return;
    }
    if (!canCreate) {
      setErr('Select a course or type a topic first.');
      Alert.alert('Missing info', 'Select a course or enter a topic.');
      return;
    }

    const dueAtISO = endOfDayIso(dueDate);
    const pickedSeconds = hmToSeconds(timerH || 0, timerM || 0);
    const requestedTimer = pickedSeconds === 0 ? 0 : pickedSeconds;
    const effectiveTimer = isStarter
      ? Math.min(requestedTimer || STARTER_MAX_TIMER, STARTER_MAX_TIMER)
      : requestedTimer;

    const effectivePass = passMark === '' ? null : Number(passMark);
    const effectiveAttempts = isStarter ? 1 : Math.max(1, Math.min(10, Number(maxAttempts) || 1));

    setBusy(true);
    try {
      const assignOpts = {
        title_override: titleOverride.trim() || null,
        pass_mark: effectivePass,
        timer_s: effectiveTimer,
        max_attempts: effectiveAttempts,
        due_at: dueAtISO,
        locked_config: {
          totalLessons: typeof totalLessons === 'number' ? totalLessons : undefined,
          quizSize: typeof quizCount === 'number' ? quizCount : undefined,
          minutes: typeof minutes === 'number' ? minutes : undefined,
          quizType,
        },
      };

      const payload = {
        ...(courseId ? { courseId } : { title: (courseTitle || '').trim() }),
        ...(typeof minutes === 'number' ? { minutes } : {}),
        ...assignOpts,
      } as any;

      const resp = await ensureOrgShareableAssignment(
        backendUrl,
        bearer,
        activeOrgId,
        payload
      );
      const code =
        resp?.assignment?.invite_code ??
        resp?.assignment?.inviteCode ??
        resp?.assignment?.code;
      if (!code) throw new Error('Invite code missing');

      const cid = pickCourseId(resp);
      if (cid) {
        setCreatedCourseId(cid);
        onResolvedCourseId?.(cid);
      }

      setInviteLink(`${inviteBase}/${code}`);
    } catch (e: any) {
      const status = e?.response?.status;
      const canFallback = !!courseId && (status === 404 || status === 501 || status === 400);
      if (canFallback) {
        try {
          const legacy = await createOrgAssignment(backendUrl, bearer, activeOrgId, {
            courseId,
            title_override: titleOverride.trim() || null,
            pass_mark: effectivePass,
            timer_s: effectiveTimer,
            max_attempts: effectiveAttempts,
            due_at: dueAtISO,
          } as any);
          const code = legacy.invite_code || legacy.inviteCode || legacy.code;
          setInviteLink(`${inviteBase}/${code}`);

          const cid2 = pickCourseId(legacy);
          if (cid2) {
            setCreatedCourseId(cid2);
            onResolvedCourseId?.(cid2);
          }
        } catch (e2: any) {
          const m =
            e2?.response?.data?.message ||
            e2?.message ||
            'Failed to create invite.';
          setErr(m);
          Alert.alert('Error', m);
        }
      } else {
        const m =
          e?.response?.data?.message ||
          e?.message ||
          'Failed to share course.';
        setErr(m);
        Alert.alert('Error', m);
      }
    } finally {
      setBusy(false);
    }
  }, [
    orgToken,
    token,
    backendUrl,
    activeOrgId,
    canCreate,
    courseId,
    courseTitle,
    dueDate,
    timerH,
    timerM,
    isStarter,
    passMark,
    maxAttempts,
    totalLessons,
    quizCount,
    minutes,
    quizType,
    inviteBase,
    onResolvedCourseId,
  ]);

  const copy = async () => {
    if (!inviteLink) return;
    try {
      await Clipboard.setStringAsync(inviteLink);
      Alert.alert('Copied', 'Invite link copied to clipboard.');
    } catch {}
  };

  const openLink = () => {
    if (!inviteLink) return;
    Linking.openURL(inviteLink).catch(() =>
      Alert.alert('Error', 'Unable to open link.')
    );
  };

  const emailShare = () => {
    if (!inviteLink) return;
    const href = `mailto:?subject=${encodeURIComponent(
      'Course invite'
    )}&body=${encodeURIComponent(inviteLink)}`;
    Linking.openURL(href).catch(() => {});
  };

  const whatsappShare = () => {
    if (!inviteLink) return;
    const href = `https://wa.me/?text=${encodeURIComponent(inviteLink)}`;
    Linking.openURL(href).catch(() => {});
  };

  const NumberInput = ({
    value,
    setValue,
    min,
    max,
    disabled,
  }: {
    value: number | '';
    setValue: (n: number | '') => void;
    min?: number;
    max?: number;
    disabled?: boolean;
  }) => (
    <TextInput
      editable={!disabled}
      keyboardType="numeric"
      value={value === '' ? '' : String(value)}
      onChangeText={(raw) => {
        if (raw.trim() === '') return setValue('');
        const n = Number(raw);
        if (Number.isNaN(n)) return;
        let v = n;
        if (typeof min === 'number' && v < min) v = min;
        if (typeof max === 'number' && v > max) v = max;
        setValue(v);
      }}
      placeholderTextColor="rgba(255,255,255,0.6)"
      style={tw.style(
        'px-3 py-2 rounded-lg border border-white/10 bg-black/40 text-white',
        disabled && 'opacity-60'
      )}
    />
  );

  // RN DateTimePicker safe onChange
  const handleDueChange = (_e: unknown, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) setDueDate(selectedDate);
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={tw`flex-1 bg-black/60`}>
        <TouchableOpacity style={tw`flex-1`} activeOpacity={1} onPress={onClose} />

        <View style={tw`mx-4 mb-8 rounded-xl bg-[#0f1821] p-3 border border-white/10`}>
          {/* Header */}
          <View style={tw`flex-row items-start justify-between`}>
            <View style={tw`flex-1 pr-2`}>
              <Text style={tw`text-white/70 text-[10px]`}>Share course with learners</Text>
              <Text style={tw`text-white font-semibold text-sm`} numberOfLines={1}>
                {courseTitle || 'Selected course'}
              </Text>
              {(typeof totalLessons === 'number' || typeof quizCount === 'number') && (
                <Text style={tw`text-white/60 text-3xs mt-0.5`}>
                  {typeof totalLessons === 'number' ? `${totalLessons} lessons` : '—'}
                  {typeof quizCount === 'number' ? ` • ${quizCount} questions` : ''}
                </Text>
              )}
            </View>

            <TouchableOpacity
              onPress={handleCancel}
              style={tw`h-8 w-8 rounded-md border border-white/20 items-center justify-center`}
            >
              <Text style={tw`text-white text-base`}>×</Text>
            </TouchableOpacity>
          </View>

          {/* Body */}
          <ScrollView style={tw`max-h-[70vh] mt-3`} keyboardShouldPersistTaps="handled">
            {!inviteLink ? (
              <View style={tw`gap-3`}>
                {/* Title override */}
                <View>
                  <Text style={tw`text-white/70 text-[10px] mb-1`}>
                    Title (optional override)
                  </Text>
                  <TextInput
                    placeholder="e.g., Algebra Essentials — Cohort A"
                    placeholderTextColor="rgba(255,255,255,0.6)"
                    value={titleOverride}
                    onChangeText={setTitleOverride}
                    style={tw`px-3 py-2 rounded-lg border border-white/10 bg-black/40 text-white`}
                  />
                </View>

                {/* Pass mark / Timer */}
                <View style={tw`gap-3`}>
                  <View>
                    <Text style={tw`text-white/70 text-[10px] mb-1`}>Pass mark (%)</Text>
                    <NumberInput
                      value={passMark}
                      setValue={setPassMark}
                      min={0}
                      max={100}
                      disabled={lockPass}
                    />
                  </View>

                  <View>
                    <Text style={tw`text-white/70 text-[10px] mb-1`}>
                      Timer (duration){' '}
                      {isStarter && (
                        <Text style={tw`text-white/60 text-3xs`}>
                          • Starter fixed at 30 min
                        </Text>
                      )}
                    </Text>

                    <View style={tw`flex-row items-center gap-2`}>
                      <View style={tw`flex-1`}>
                        <Picker
                          enabled={!lockTimer}
                          selectedValue={timerH}
                          onValueChange={(v) => setTimerH(Number(v))}
                          style={tw`text-white bg-black/40 rounded-lg border border-white/10`}
                          dropdownIconColor={
                            Platform.OS === 'android' ? '#ffffff' : undefined
                          }
                          mode={Platform.OS === 'android' ? 'dropdown' : 'dialog'}
                        >
                          {Array.from({ length: 13 }).map((_, h) => (
                            <Picker.Item
                              key={h}
                              label={`${h} ${h === 1 ? 'hour' : 'hours'}`}
                              value={h}
                            />
                          ))}
                        </Picker>
                      </View>

                      <View style={tw`flex-1`}>
                        <Picker
                          enabled={!lockTimer}
                          selectedValue={timerM}
                          onValueChange={(v) => setTimerM(Number(v))}
                          style={tw`text-white bg-black/40 rounded-lg border border-white/10`}
                          dropdownIconColor={
                            Platform.OS === 'android' ? '#ffffff' : undefined
                          }
                          mode={Platform.OS === 'android' ? 'dropdown' : 'dialog'}
                        >
                          {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                            <Picker.Item
                              key={m}
                              label={`${m} ${m === 1 ? 'minute' : 'minutes'}`}
                              value={m}
                            />
                          ))}
                        </Picker>
                      </View>

                      <Text style={tw`text-white/70 text-3xs`}>
                        {String(timerH ?? 0).padStart(2, '0')}:
                        {String(timerM ?? 0).padStart(2, '0')}:00
                      </Text>
                    </View>

                    <Text style={tw`text-white/60 text-3xs mt-1`}>
                      Set both to 0 for no time limit.
                    </Text>
                  </View>
                </View>

                {/* Max attempts */}
                <View>
                  <Text style={tw`text-white/70 text-[10px] mb-1`}>
                    Max quiz attempts
                    {isStarter && (
                      <Text style={tw`text-white/60 text-3xs`}>
                        {' '}
                        • Starter locked to 1
                      </Text>
                    )}
                  </Text>
                  <View style={tw`flex-row items-center gap-2`}>
                    <View style={tw`flex-1`}>
                      <NumberInput
                        value={maxAttempts}
                        setValue={(n) =>
                          setMaxAttempts(
                            Math.max(1, Math.min(10, Number(n) || 1))
                          )
                        }
                        min={1}
                        max={10}
                        disabled={lockAttempts}
                      />
                    </View>
                    <Text style={tw`text-white/60 text-3xs`}>
                      Learners can retry up to this number.
                    </Text>
                  </View>
                </View>

                {/* Question type */}
                <View>
                  <Text style={tw`text-white/70 text-[10px] mb-1`}>
                    Question type
                  </Text>
                  <View style={tw`flex-row gap-2`}>
                    <Choice
                      label="Multiple choice (MCQ)"
                      active={quizType === 'mcq'}
                      onPress={() => setQuizType('mcq')}
                    />
                    <Choice
                      label="Short answers (typed)"
                      active={quizType === 'short'}
                      onPress={() => setQuizType('short')}
                    />
                  </View>
                  <Text style={tw`text-white/60 text-3xs mt-1`}>
                    You can change this later per assignment if needed.
                  </Text>
                </View>

                {/* Due date */}
                <View>
                  <Text style={tw`text-white/70 text-[10px] mb-1`}>
                    Due date (defaults to today)
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowDatePicker(true)}
                    style={tw`px-3 py-2 rounded-lg border border-white/10 bg-black/40`}
                  >
                    <Text style={tw`text-white`}>
                      {dueDate
                        ? `${dueDate.getFullYear()}-${String(
                            dueDate.getMonth() + 1
                          ).padStart(2, '0')}-${String(
                            dueDate.getDate()
                          ).padStart(2, '0')}`
                        : 'Pick a date'}
                    </Text>
                    <Text style={tw`text-white/60 text-3xs mt-1`}>
                      Deadline is end of day (23:59:59).
                    </Text>
                  </TouchableOpacity>

                  {showDatePicker && (
                    <DateTimePicker
                      value={dueDate ?? new Date()}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'inline' : 'default'}
                      onChange={handleDueChange}
                    />
                  )}
                </View>

                {!!err && <Text style={tw`text-amber-300 text-[10px]`}>{err}</Text>}
              </View>
            ) : (
              <View style={tw`gap-2`}>
                <Text style={tw`text-white/70 text-[10px]`}>Invite link</Text>
                <View style={tw`flex-row items-stretch gap-2`}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={tw`flex-1 px-3 py-2 rounded-lg border border-white/10 bg-black/40`}
                  >
                    <Text selectable style={tw`text-white`}>
                      {inviteLink}
                    </Text>
                  </ScrollView>
                  <TouchableOpacity
                    onPress={copy}
                    style={tw`px-3 rounded-lg bg-white/10 items-center justify-center`}
                  >
                    <Text style={tw`text-white text-[10px]`}>Copy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={openLink}
                    style={tw`px-3 rounded-lg bg-white/10 items-center justify-center`}
                  >
                    <Text style={tw`text-white text-[10px]`}>Open</Text>
                  </TouchableOpacity>
                </View>

                {/* Share helpers (parity) */}
                <View style={tw`flex-row flex-wrap gap-2 mt-1`}>
                  <TouchableOpacity
                    onPress={emailShare}
                    style={tw`px-3 py-1.5 rounded-lg bg-white/10`}
                  >
                    <Text style={tw`text-white text-[11px]`}>Email</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={whatsappShare}
                    style={tw`px-3 py-1.5 rounded-lg bg-white/10`}
                  >
                    <Text style={tw`text-white text-[11px]`}>WhatsApp</Text>
                  </TouchableOpacity>
                </View>

                <Text style={tw`text-white/60 text-3xs`}>
                  Share this link with your learners.
                </Text>

                {!!(createdCourseId || courseId) && (
                  <View style={tw`mt-2`}>
                    <TouchableOpacity
                      onPress={() => {
                        onClose();
                        try {
                          if (createdCourseId) {
                            // optionally store breadcrumbs here
                          }
                        } catch {}
                        navigation.navigate('OrgElearnPortal', {
                          tab: 'assign',
                          from: 'share',
                          courseId: createdCourseId || (courseId ?? undefined),
                        });
                      }}
                      style={tw`self-start px-3 py-1.5 rounded-lg bg-indigo-600`}
                    >
                      <Text style={tw`text-white text-[11px] font-semibold`}>
                        Open Assign pane
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          {!inviteLink && (
            <View
              style={tw`mt-3 pt-2 border-t border-white/10 flex-row justify-end`}
            >
              <TouchableOpacity
                onPress={handleShare}
                disabled={busy || !canCreate}
                style={tw.style(
                  'px-4 py-2 rounded-lg bg-emerald-600',
                  (busy || !canCreate) && 'opacity-60'
                )}
              >
                <Text style={tw`text-white font-semibold`}>
                  {busy ? 'Creating…' : 'Create invite'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <TouchableOpacity style={tw`flex-1`} activeOpacity={1} onPress={onClose} />
      </View>
    </Modal>
  );
}

/* ------- small UI bits ------- */
const Choice: React.FC<{ label: string; active: boolean; onPress: () => void }> = ({
  label,
  active,
  onPress,
}) => (
  <TouchableOpacity
    onPress={onPress}
    style={tw.style(
      'flex-1 rounded-md p-3 border',
      active ? 'bg-emerald-600/15 border-emerald-500' : 'bg-white/5 border-white/10'
    )}
  >
    <Text
      style={tw.style(
        'text-[10px]',
        active ? 'text-white' : 'text-white/80'
      )}
    >
      {label}
    </Text>
  </TouchableOpacity>
);
