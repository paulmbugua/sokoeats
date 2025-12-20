/* eslint-disable prettier/prettier */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  BackHandler,
  Platform,
  LayoutChangeEvent,
  GestureResponderEvent,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import tw from '../../tailwind';

import ClassroomPlayer from './ClassroomPlayer.native';
import ClassroomBackdrop from './ClassroomBackdrop.native';
// ✅ shared location so both web & native can import it
import { DARK_PRESET_THEMES as RAW_THEMES } from '../../utils/backdropThemes';

const DARK_PRESET_THEMES = RAW_THEMES as readonly string[];

type ThemeMode = 'auto' | 'preset';

type ClassroomThemeShellProps = Record<string, any> & {
  themeOpen?: boolean;
  onThemeOpenChange?: (open: boolean) => void;
  showFloatingThemeButton?: boolean;
  onWordSync?: (p: { words: any[]; currentIndex: number }) => void;

  /** index + navigation parity with web */
  activeIndex?: number;
  onPrev?: () => Promise<boolean> | boolean;

  /** request lifecycle parity with web */
  onRequestStart?: () => void;

  /** loading callback – we support both names for safety */
  onPlayerLoadingChange?: (loading: boolean) => void;
  onLoadingChange?: (loading: boolean) => void;

  gateMode?: 'narration' | 'notes_only';
  gateNotice?: {
    reason?: string;
    resetsAt?: string | null;
    remainingMinutes?: number | null;
  } | null;
  gateUsage?: Array<{
    bucket?: string;
    remainingSeconds?: number;
    limitSeconds?: number;
    resetsAt?: string | null;
  }>;
};

/* --------------------------- storage helpers --------------------------- */

const K_MODE = 'cb_themeMode';
const K_PRESET = 'cb_presetIndex';
const K_DIM = 'cb_dim';
const K_BRIGHT = 'cb_brightness';
const K_SAT = 'cb_saturation';
const K_BLUR = 'cb_blurPx';
const K_VIGN = 'cb_vignetteInner';

async function readStr(key: string, fallback: string) {
  try {
    const v = await AsyncStorage.getItem(key);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
async function readNum(key: string, fallback: number) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}
const writeStr = (k: string, v: string) => AsyncStorage.setItem(k, v).catch(() => {});
const writeNum = (k: string, n: number) => AsyncStorage.setItem(k, String(n)).catch(() => {});

/* ------------------------------- UI bits ------------------------------- */

const Chip: React.FC<{
  active?: boolean;
  label: string;
  onPress(): void;
}> = ({ active, label, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    style={tw.style('px-2.5 py-1 rounded-full', active ? 'bg-white' : 'bg-white/10')}
  >
    <Text style={tw.style('text-[11px] font-medium', active ? 'text-black' : 'text-white')}>
      {label}
    </Text>
  </TouchableOpacity>
);

const PresetThumb: React.FC<{
  src: string;
  selected: boolean;
  onPress(): void;
  index: number;
}> = ({ src, selected, onPress, index }) => (
  <Pressable
    onPress={onPress}
    style={tw`relative w-24 h-18 rounded-xl overflow-hidden border ${
      selected ? 'border-white' : 'border-white/20'
    }`}
    accessibilityRole="button"
    accessibilityLabel={`Preset ${index + 1}`}
    accessibilityState={{ selected }}
  >
    {/* Placeholder thumb; replace with ImageBackground if you add previews */}
    <View style={tw`absolute inset-0 bg-black/20`} />
    <View style={tw`absolute inset-0 ${selected ? 'items-center justify-center' : ''}`}>
      {selected && <Text style={tw`text-white text-[10px] font-semibold`}>Selected</Text>}
    </View>
  </Pressable>
);

/* ---- Inline slider (compact, emits live) ---- */
const InlineSlider: React.FC<{
  value: number; // absolute (min..max)
  minimumValue?: number; // default 0
  maximumValue?: number; // default 1
  onValueChange?: (val: number) => void; // emits continuous absolute value
  onSlidingComplete?: (val: number) => void; // emits absolute at release
  minimumTrackTintColor?: string;
  maximumTrackTintColor?: string;
  thumbTintColor?: string;
}> = ({
  value,
  minimumValue = 0,
  maximumValue = 1,
  onValueChange,
  onSlidingComplete,
  minimumTrackTintColor = '#FFFFFF',
  maximumTrackTintColor = 'rgba(255,255,255,0.25)',
  thumbTintColor = '#FFFFFF',
}) => {
  const [width, setWidth] = useState(1);
  const hi = (n: number) => (Number.isFinite(n) ? n : 1);
  const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(hi(b), n));

  const clamped = clamp(value, minimumValue, maximumValue);
  const ratio = (clamped - minimumValue) / Math.max(1e-6, maximumValue - minimumValue);

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.max(1, e.nativeEvent.layout.width));
  const toAbs = (x: number) => {
    const r = Math.max(0, Math.min(1, x / Math.max(1, width)));
    return minimumValue + r * (maximumValue - minimumValue);
  };

  const onStart = () => true;
  const onMove = (e: GestureResponderEvent) => onValueChange?.(toAbs(e.nativeEvent.locationX));
  const onRelease = (e: GestureResponderEvent) => {
    const v = toAbs(e.nativeEvent.locationX);
    onValueChange?.(v);
    onSlidingComplete?.(v);
  };

  return (
    <View
      onLayout={onLayout}
      onStartShouldSetResponder={onStart}
      onMoveShouldSetResponder={() => true}
      onResponderMove={onMove}
      onResponderRelease={onRelease}
      style={tw`h-6 justify-center`}
    >
      <View
        style={[tw`h-1.5 rounded-full overflow-hidden`, { backgroundColor: maximumTrackTintColor }]}
      >
        <View
          style={{
            width: `${ratio * 100}%`,
            backgroundColor: minimumTrackTintColor,
            height: '100%',
          }}
        />
      </View>
      <View
        pointerEvents="none"
        style={[
          tw`absolute h-4 w-4 rounded-full`,
          {
            backgroundColor: thumbTintColor,
            top: 6 - 8,
            left: Math.max(0, Math.min(ratio * width - 8, Math.max(0, width - 16))),
          },
        ]}
      />
    </View>
  );
};

const RowSlider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange(v: number): void;
}> = ({ label, value, min, max, onChange }) => (
  <View style={tw`mb-2`}>
    <View style={tw`flex-row items-center justify-between mb-1`}>
      <Text style={tw`text-white/85 text-[11px]`}>{label}</Text>
      <Text style={tw`text-white/60 text-[11px]`}>{value.toFixed(2)}</Text>
    </View>
    <InlineSlider
      minimumValue={min}
      maximumValue={max}
      value={value}
      onValueChange={onChange}
      onSlidingComplete={onChange}
      minimumTrackTintColor="#FFFFFF"
      maximumTrackTintColor="rgba(255,255,255,0.25)"
      thumbTintColor="#FFFFFF"
    />
  </View>
);

/* ----------------------------- Main Shell ----------------------------- */

const ClassroomThemeShell: React.FC<ClassroomThemeShellProps> = (props) => {
  const { height: WIN_H } = useWindowDimensions();
  const SHEET_MAX_H = Math.min(500, Math.floor(WIN_H * 0.6)); // ~60% of screen on phones
  const SHEET_SIDE_M = 8;

  const { onPlayerLoadingChange, onLoadingChange } = props;

  // unify loading callback name (support both web-style + old prop)
  const handleLoadingChange = onPlayerLoadingChange ?? onLoadingChange;

  const [internalThemeOpen, setInternalThemeOpen] = useState(false);
  const isControlled = typeof props.themeOpen === 'boolean';
  const showTheme = isControlled ? (props.themeOpen as boolean) : internalThemeOpen;

  const setShowTheme = useCallback(
    (v: boolean | ((s: boolean) => boolean)) => {
      const next = typeof v === 'function' ? (v as (s: boolean) => boolean)(showTheme) : v;
      if (!isControlled) setInternalThemeOpen(next);
      props.onThemeOpenChange?.(next);
    },
    [isControlled, props, showTheme]
  );

  // Defaults immediately for first paint; then hydrate from storage.
  const [mode, setMode] = useState<ThemeMode>('auto');
  const [presetIndex, setPresetIndex] = useState<number>(0);
  const [dim, setDim] = useState<number>(0.35);
  const [brightness, setBrightness] = useState<number>(0.6);
  const [saturation, setSaturation] = useState<number>(0.9);
  const [blurPx, setBlurPx] = useState<number>(2);
  const [vignetteInner, setVignetteInner] = useState<number>(0.45);

  // Hydrate persisted values once
  useEffect(() => {
    let mounted = true;
    (async () => {
      const [m, pi, d, b, s, bl, vg] = await Promise.all([
        readStr(K_MODE, 'auto'),
        readNum(K_PRESET, 0),
        readNum(K_DIM, 0.35),
        readNum(K_BRIGHT, 0.6),
        readNum(K_SAT, 0.9),
        readNum(K_BLUR, 2),
        readNum(K_VIGN, 0.45),
      ]);
      if (!mounted) return;
      setMode((m as ThemeMode) || 'auto');
      setPresetIndex(pi);
      setDim(d);
      setBrightness(b);
      setSaturation(s);
      setBlurPx(bl);
      setVignetteInner(vg);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Persist on change
  useEffect(() => {
    writeStr(K_MODE, mode);
  }, [mode]);
  useEffect(() => {
    writeNum(K_PRESET, presetIndex);
  }, [presetIndex]);
  useEffect(() => {
    writeNum(K_DIM, dim);
  }, [dim]);
  useEffect(() => {
    writeNum(K_BRIGHT, brightness);
  }, [brightness]);
  useEffect(() => {
    writeNum(K_SAT, saturation);
  }, [saturation]);
  useEffect(() => {
    writeNum(K_BLUR, blurPx);
  }, [blurPx]);
  useEffect(() => {
    writeNum(K_VIGN, vignetteInner);
  }, [vignetteInner]);

  const imagesOverride = useMemo(() => {
    if (mode !== 'preset') return undefined;
    const idx = Math.max(0, Math.min(DARK_PRESET_THEMES.length - 1, presetIndex));
    return [DARK_PRESET_THEMES[idx]] as string[];
  }, [mode, presetIndex]);

  const backdropOverride = useMemo(
    () => (
      <ClassroomBackdrop
        course={props.course || null}
        outline={props.outline}
        backendUrl={props.backendUrlOverride}
        playing={typeof props.playing === 'boolean' ? props.playing : undefined}
        intervalSec={14}
        dim={dim}
        brightness={brightness}
        saturation={saturation}
        blurPx={blurPx}
        vignetteInner={vignetteInner}
        imagesOverride={imagesOverride}
      />
    ),
    [
      props.course,
      props.outline,
      props.backendUrlOverride,
      props.playing,
      dim,
      brightness,
      saturation,
      blurPx,
      vignetteInner,
      imagesOverride,
    ]
  );

  // Back handler to close the panel (Android hardware back)
  useEffect(() => {
    if (!showTheme) return;
    const onBack = () => {
      setShowTheme(false);
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [showTheme, setShowTheme]);

  /* ----------------------------- Theme Panel ----------------------------- */

  const Panel = (
    <SafeAreaView style={tw`flex-1 justify-end`}>
      {/* Scrim */}
      <Pressable
        onPress={() => setShowTheme(false)}
        style={tw`absolute inset-0 bg-black/40`}
        accessibilityLabel="Close theme panel"
        accessibilityRole="button"
      />
      {/* Bottom sheet (compact) */}
      <View
        style={[
          tw`rounded-2xl bg-black/90 border border-white/10 p-2`,
          {
            marginHorizontal: SHEET_SIDE_M,
            marginBottom: 10,
            maxHeight: SHEET_MAX_H,
          },
        ]}
        accessibilityLabel="Theme settings"
      >
        {/* Header (compact) */}
        <View style={tw`flex-row items-center justify-between mb-1`}>
          <Text style={tw`text-white font-semibold text-sm`}>Theme</Text>
          <TouchableOpacity
            onPress={() => setShowTheme(false)}
            hitSlop={{
              top: 8,
              bottom: 8,
              left: 8,
              right: 8,
            }}
          >
            <Text style={tw`text-white text-base`}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Mode chips */}
        <View style={tw`flex-row flex-wrap gap-2 mb-2`}>
          <Chip
            label="Auto (subject-aware)"
            active={mode === 'auto'}
            onPress={() => setMode('auto')}
          />
          <Chip label="Presets" active={mode === 'preset'} onPress={() => setMode('preset')} />
        </View>

        {/* Presets (shrunk) */}
        {mode === 'preset' && (
          <View style={tw`mb-2`}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={tw`gap-2`}
              keyboardShouldPersistTaps="handled"
            >
              {DARK_PRESET_THEMES.map((src: string, i: number) => (
                <PresetThumb
                  key={i}
                  src={src}
                  selected={presetIndex === i}
                  onPress={() => setPresetIndex(i)}
                  index={i}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Sliders */}
        <ScrollView
          style={tw`flex-1`}
          contentContainerStyle={tw`pb-2`}
          keyboardShouldPersistTaps="handled"
        >
          <RowSlider label="Darken" value={dim} min={0} max={0.85} onChange={setDim} />
          <RowSlider
            label="Brightness"
            value={brightness}
            min={0.3}
            max={1.2}
            onChange={setBrightness}
          />
          <RowSlider
            label="Saturation"
            value={saturation}
            min={0.6}
            max={1.3}
            onChange={setSaturation}
          />
          <RowSlider label="Blur" value={blurPx} min={0} max={6} onChange={setBlurPx} />
          <RowSlider
            label="Vignette Center"
            value={vignetteInner}
            min={0.2}
            max={0.7}
            onChange={setVignetteInner}
          />
        </ScrollView>

        {/* Quick presets (compact buttons) */}
        <View style={tw`flex-row flex-wrap gap-2 mt-1`}>
          <TouchableOpacity
            onPress={() => {
              setDim(0.4);
              setBrightness(0.6);
              setSaturation(0.95);
              setBlurPx(2);
              setVignetteInner(0.45);
            }}
            style={tw`px-2.5 py-1 rounded bg-white/10`}
          >
            <Text style={tw`text-white text-[11px]`}>Reset nice dark</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setDim(0.2);
              setBrightness(0.8);
              setSaturation(1.05);
              setBlurPx(0);
              setVignetteInner(0.5);
            }}
            style={tw`px-2.5 py-1 rounded bg-white/10`}
          >
            <Text style={tw`text-white text-[11px]`}>Brighter</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setDim(0.6);
              setBrightness(0.5);
              setSaturation(0.9);
              setBlurPx(3);
              setVignetteInner(0.4);
            }}
            style={tw`px-2.5 py-1 rounded bg-white/10`}
          >
            <Text style={tw`text-white text-[11px]`}>Super dim</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );

  return (
    <View style={tw.style('relative', 'flex-1')}>
      <ClassroomPlayer
        {...props}
        onWordSync={props.onWordSync}
        disableInternalBackdrop
        backdropOverride={backdropOverride}
        onToggleThemePanel={() => setShowTheme((s) => !s)}
        /** parity with web: just forward loading + request hooks */
        onPlayerLoadingChange={handleLoadingChange}
        onRequestStart={props.onRequestStart}
        activeIndex={props.activeIndex}
        onPrev={props.onPrev}
      />

      {/* Floating Theme button (compact) */}
      {props.showFloatingThemeButton !== false && (
        <TouchableOpacity
          onPress={() => setShowTheme((s) => !s)}
          style={tw`absolute right-2 ${Platform.select({
            ios: 'bottom-24',
            android: 'bottom-20',
            default: 'bottom-20',
          })} px-3 py-1.5 rounded-xl bg-black/80 border border-white/10`}
          accessibilityLabel="Theme"
        >
          <Text style={tw`text-white text-[11px]`}>Theme</Text>
        </TouchableOpacity>
      )}

      {/* Theme Modal */}
      <Modal
        transparent
        visible={!!showTheme}
        animationType="fade"
        onRequestClose={() => setShowTheme(false)}
      >
        {Panel}
      </Modal>
    </View>
  );
};

export default ClassroomThemeShell;
