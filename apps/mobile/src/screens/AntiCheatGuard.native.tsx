// apps/mobile/src/screens/AntiCheatGuard.native.tsx
import React, { useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, Alert, AccessibilityInfo, ScrollView } from 'react-native';
import tw from '../../tailwind';

type Props = {
  deviceId: string;
  setDeviceId?: (id: string) => void;
  quizActive: boolean;
  elapsedMs: number;
  backgrounds: number;
  suspicions: number;
  policy?: {
    heartbeatSec: number;
    maxBackgrounds: number;
    maxSuspicion: number;
    timerSec?: number;
  };
  onTooManyBackgrounds?: () => void;
  onBumpSuspicion?: (delta?: number) => void;
};

const fmtHMS = (totalSeconds?: number | null) => {
  const n = Number(totalSeconds);
  const s = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

const Pill = ({
  label,
  value,
  tone = 'muted',
  hint,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'danger' | 'muted';
  hint?: string;
}) => {
  const ring =
    tone === 'ok'
      ? 'border-emerald-300 dark:border-emerald-500/40'
      : tone === 'warn'
        ? 'border-amber-300 dark:border-amber-500/40'
        : tone === 'danger'
          ? 'border-red-300 dark:border-red-500/40'
          : 'border-black/10 dark:border-white/10';

  const bg =
    tone === 'ok'
      ? 'bg-emerald-50 dark:bg-emerald-500/10'
      : tone === 'warn'
        ? 'bg-amber-50 dark:bg-amber-500/10'
        : tone === 'danger'
          ? 'bg-red-50 dark:bg-red-500/10'
          : 'bg-white dark:bg-white/5';

  const text =
    tone === 'ok'
      ? 'text-emerald-800 dark:text-emerald-200'
      : tone === 'warn'
        ? 'text-amber-800 dark:text-amber-200'
        : tone === 'danger'
          ? 'text-red-800 dark:text-red-200'
          : 'text-slate-700 dark:text-white/80';

  return (
    <View
      accessibilityLabel={`${label}: ${value}${hint ? `. ${hint}` : ''}`}
      style={tw.style(`px-2.5 py-1 rounded-full border`, ring, bg)}
    >
      <Text style={tw.style(`text-[11px] font-medium`, text)}>
        {label}: <Text style={tw`font-semibold`}>{value}</Text>
      </Text>
    </View>
  );
};

const Metric = ({ label, value }: { label: string; value: string }) => (
  <View
    style={tw`flex-1 min-w-0 items-center rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3 py-3`}
    accessible
    accessibilityLabel={`${label}: ${value}`}
  >
    <Text style={tw`text-[11px] uppercase tracking-wide text-slate-500 dark:text-white/60`}>
      {label}
    </Text>
    <Text style={tw`mt-0.5 text-lg font-semibold text-slate-900 dark:text-white`} numberOfLines={1}>
      {value}
    </Text>
  </View>
);

const AntiCheatGuard: React.FC<Props> = ({
  deviceId,
  setDeviceId,
  quizActive,
  elapsedMs,
  backgrounds,
  suspicions,
  policy,
  onTooManyBackgrounds,
  onBumpSuspicion,
}) => {
  // Normalize policy
  const maxBg = policy?.maxBackgrounds ?? 2;
  const maxSus = policy?.maxSuspicion ?? 5;
  const heartbeat = policy?.heartbeatSec ?? 15;

  const lockNotifiedRef = React.useRef(false);

  // Compute times (up front)
  const elapsedS = useMemo(() => {
    const n = Number(elapsedMs);
    return Math.max(0, Math.floor(Number.isFinite(n) ? n / 1000 : 0));
  }, [elapsedMs]);

  const safeTimer = useMemo(() => {
    const n = Number(policy?.timerSec ?? 0);
    return Number.isFinite(n) ? n : 0;
  }, [policy?.timerSec]);

  const remainingS = Math.max(0, Math.floor(safeTimer - elapsedS));
  const pct =
    safeTimer > 0 ? Math.min(100, Math.max(0, (remainingS / Math.max(1, safeTimer)) * 100)) : 0;

  // Tones
  const bgTone: 'ok' | 'warn' | 'danger' =
    backgrounds > maxBg ? 'danger' : backgrounds === maxBg ? 'warn' : 'ok';
  const susTone: 'ok' | 'warn' | 'danger' =
    suspicions >= maxSus
      ? 'danger'
      : suspicions >= Math.max(1, Math.floor(maxSus * 0.7))
        ? 'warn'
        : 'ok';

  // Lock effect
  useEffect(() => {
    if (!quizActive || backgrounds <= (policy?.maxBackgrounds ?? 2)) {
      lockNotifiedRef.current = false;
    }
  }, [quizActive, backgrounds, policy?.maxBackgrounds]);

  useEffect(() => {
    if (!quizActive) return;
    const maxBg = policy?.maxBackgrounds;
    if (maxBg != null && backgrounds > maxBg && !lockNotifiedRef.current) {
      lockNotifiedRef.current = true;
      Alert.alert('Quiz locked', 'App was switched too many times. Submitting your answers.');
      onTooManyBackgrounds?.();
      AccessibilityInfo.announceForAccessibility?.(
        'Quiz locked due to focus changes. Submitting now.'
      );
    }
  }, [quizActive, backgrounds, policy?.maxBackgrounds, onTooManyBackgrounds]);

  return (
    <View
      style={tw`overflow-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-transparent mb-3`}
      accessible
      accessibilityRole="summary"
    >
      {/* Hairline ring */}
      <View
        pointerEvents="none"
        style={tw`absolute inset-0 rounded-2xl border border-black/10 dark:border-white/10`}
      />

      {/* Header */}
      <View style={tw`px-4 pt-4 pb-2`}>
        <View style={tw`flex-row items-center gap-3`}>
          <View
            style={tw`h-10 w-10 items-center justify-center rounded-xl shadow-md bg-indigo-600`}
          >
            <Text accessible={false} style={tw`text-white text-base`}>
              🛡️
            </Text>
          </View>
          <View style={tw`flex-1`}>
            <Text style={tw`text-base font-extrabold text-slate-900 dark:text-white`}>
              Quiz Integrity
            </Text>
            <Text
              style={tw`mt-0.5 text-[11px] text-slate-600 dark:text-white/70`}
              numberOfLines={1}
            >
              Device:{' '}
              <Text style={tw`font-medium text-slate-900 dark:text-white`}>
                {deviceId ? deviceId.slice(0, 12) : 'binding…'}
              </Text>
            </Text>
          </View>
        </View>

        {/* Badges (horizontal scroll to avoid overflow) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={tw`mt-3 pb-1 flex-row gap-2`}
        >
          <Pill
            label="Exits"
            value={`${backgrounds}/${maxBg}`}
            tone={bgTone}
            hint="Times app lost focus"
          />
          <Pill
            label="Suspicion"
            value={`${suspicions}/${maxSus}`}
            tone={susTone}
            hint="Suspicion level"
          />
          <Pill
            label="Heartbeat"
            value={`${heartbeat}s`}
            tone="muted"
            hint="Anti-cheat ping interval"
          />
          {safeTimer > 0 && <Pill label="Remaining" value={fmtHMS(remainingS)} tone="muted" />}
        </ScrollView>
      </View>

      {/* Timer bar */}
      {safeTimer > 0 && (
        <View style={tw`px-4`}>
          <View style={tw`flex-row items-center justify-between`}>
            <Text style={tw`text-[11px] text-slate-600 dark:text-white/60`}>Time limit</Text>
            <Text style={tw`text-[11px] font-medium text-slate-900 dark:text-white`}>
              {fmtHMS(remainingS)} left
            </Text>
          </View>
          <View style={tw`mt-1.5 h-3 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden`}>
            <View
              style={[tw`h-3 rounded-full bg-indigo-600`, { width: `${pct}%` }]}
              accessible
              accessibilityLabel={`Time remaining ${Math.round(pct)} percent`}
            />
          </View>
        </View>
      )}

      {/* Metrics grid (2-up, wraps on tiny screens) */}
      <View style={tw`px-4 mt-3`}>
        {/* Row 1 */}
        <View style={tw`flex-row gap-2`}>
          <Metric label="Remaining" value={safeTimer > 0 ? fmtHMS(remainingS) : 'No limit'} />
          <Metric label="Focus exits" value={`${backgrounds}/${maxBg}`} />
        </View>

        {/* Row 2 */}
        <View style={tw`flex-row gap-2 mt-2`}>
          <Metric label="Suspicion" value={`${suspicions}/${maxSus}`} />
          <Metric label="Elapsed" value={fmtHMS(elapsedS)} />
        </View>
      </View>

      {/* Divider */}
      <View style={tw`mt-4 h-px bg-black/10 dark:bg-white/10`} />

      {/* Actions (wrap if narrow) */}
      <View style={tw`px-4 py-3 flex-row flex-wrap gap-2 justify-end`}>
        <TouchableOpacity
          onPress={() => onBumpSuspicion?.(1)}
          accessibilityRole="button"
          accessibilityLabel="Flag paste"
          style={tw`px-4 py-2 rounded-xl border border-slate-300 dark:border-white/15`}
        >
          <Text style={tw`text-xs font-medium text-slate-700 dark:text-white/90`}>Flag paste</Text>
        </TouchableOpacity>

        {setDeviceId ? (
          <TouchableOpacity
            onPress={() => setDeviceId(String(Date.now()))}
            accessibilityRole="button"
            accessibilityLabel="Rebind device id"
            style={tw`px-4 py-2 rounded-xl bg-indigo-600`}
          >
            <Text style={tw`text-xs font-semibold text-white`}>Rebind</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Notices */}
      <View style={tw`px-4 pb-4`}>
        <Text style={tw`text-[11px] text-slate-500 dark:text-white/60`}>
          Don’t leave the app while the quiz is active. Unusual activity may auto-submit your
          attempt.
        </Text>

        {(backgrounds === maxBg || suspicions >= Math.max(1, Math.floor(maxSus * 0.7))) && (
          <View
            style={tw`mt-3 rounded-xl p-3 border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10`}
          >
            <Text style={tw`text-xs text-amber-800 dark:text-amber-200`}>
              Heads up: you’re close to the limit. Switching apps or suspicious actions could lock
              and submit your quiz.
            </Text>
          </View>
        )}

        {(backgrounds > maxBg || suspicions >= maxSus) && (
          <View
            style={tw`mt-3 rounded-xl p-3 border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10`}
          >
            <Text style={tw`text-xs text-red-800 dark:text-red-200`}>
              Quiz locked due to policy limits. Please wait while your attempt is submitted.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

export default React.memo(AntiCheatGuard);
