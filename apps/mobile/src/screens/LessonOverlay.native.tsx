import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  PanResponder,
  PanResponderInstance,
  ScrollView,
  Platform,
  useWindowDimensions,
  AccessibilityActionEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import tw from '../../tailwind';
import Markdown from '../screens/Markdown.native';

/* ── Types ───────────────────────────────── */
type Word = { text: string; start: number; end: number };

type Formula = {
  id: string;
  latex: string;
  title?: string;
  speakAs?: 'math' | 'spell-out' | 'characters' | 'none';
  variables?: { symbol: string; meaning: string }[];
  announceAtSentence?: number; // 1-based
};

type Table = {
  id?: string;
  title: string;
  columns: string[];
  rows: (string | number | boolean)[][];
  caption?: string;
  announceAtSentence?: number; // 1-based
};

type ImageItem = {
  id: string;
  title?: string;
  alt?: string;
  url?: string;
  caption?: string;
  announceAtSentence?: number;
};

type ChartItem = {
  id: string;
  title?: string;
  kind?: 'bar' | 'line' | 'pie' | 'histogram' | 'scatter' | 'box' | 'heatmap' | 'other';
  alt?: string;
  url?: string;
  svg?: string; // unused on native, but kept for parity
  caption?: string;
  announceAtSentence?: number;
};

type SnippetItem = {
  id: string;
  title?: string;
  language?: string;
  code: string;
  explanation?: string;
  announceAtSentence?: number;
};

type LessonLike = {
  id: string;
  title?: string;
  markdown?: string;
  formulas?: Formula[];
  tables?: Table[];
  images?: ImageItem[];
  snippets?: SnippetItem[];
  charts?: ChartItem[];
};

export interface LessonOverlayProps {
  words: Word[];
  currentIndex: number;
  lesson?: LessonLike | null;

  topOffset?: number;          // header offset
  lingerMs?: number;           // auto-hide delay when not pinned
  defaultPinned?: boolean;
  rememberKey?: string;        // persistence key
  zIndex?: number;             // overlay z-order
  freeMove?: boolean;          // allow dragging to top edge
  fullOnMaximize?: boolean;    // Modal only in maximize
  allowMarkdownFallback?: boolean; // ⬅ parity with web; default false
}

/* ── Helpers ─────────────────────────────── */
type OverlayItem =
  | { kind: 'formula'; at: number; key: string; md: string; title?: string; speakAs?: string }
  | { kind: 'table';   at: number; key: string; md: string; title?: string }
  | { kind: 'image';   at: number; key: string; md: string; title?: string }
  | { kind: 'snippet'; at: number; key: string; md: string; title?: string; language?: string }
  | { kind: 'chart';   at: number; key: string; md: string; title?: string };

const SENTENCE_END = /[.!?…]+["')\]]?$/;
const groupSignature = (arr: OverlayItem[]) =>
  arr.map((it) => `${it.key}:${it.md.length}`).sort().join('|');

function renderGfmTable(t: {
  title?: string;
  caption?: string;
  columns: string[];
  rows: (string | number | boolean)[][];
}) {
  const head = `| ${t.columns.join(' | ')} |\n| ${t.columns.map(() => '---').join(' | ')} |`;
  const body = (t.rows || [])
    .map((r) => `| ${r.map((x) => String(x)).join(' | ')} |`)
    .join('\n');
  return `\n**${t.title || 'Table'}**${t.caption ? ` — _${t.caption}_` : ''}\n\n${head}\n${body}\n`;
}

const KIND_LABEL: Record<OverlayItem['kind'], string> = {
  formula: 'Formula',
  table: 'Table',
  image: 'Illustration',
  snippet: 'Code',
  chart: 'Chart',
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/* ── Debug helpers (parity with web overlay) ───────────────────────────── */
function overlayDebugEnabledNative() {
  try {
    // In RN dev, you can toggle via: (global as any).__DBG_OVERLAY = true;
    return !!(globalThis as any)?.__DBG_OVERLAY;
  } catch {
    return false;
  }
}
const olog = (...args: unknown[]) => {
  if (!overlayDebugEnabledNative()) return;
  // eslint-disable-next-line no-console
  console.log('[LessonOverlayNative]', ...args);
};

/* ── Component ───────────────────────────── */
const LessonOverlayNative: React.FC<LessonOverlayProps> = ({
  words,
  currentIndex,
  lesson,
  topOffset = 56,
  lingerMs = 6000,
  defaultPinned = true,
  rememberKey,
  zIndex = 10000,
  freeMove = true,
  fullOnMaximize = true,
  allowMarkdownFallback = false,
}) => {
  const { width: WIN_W, height: WIN_H } = useWindowDimensions();
  const isPortrait = WIN_H >= WIN_W;

  const SMALL_PHONE = WIN_W <= 390;
  const SHEET_MODE = isPortrait && WIN_W <= 480; // bottom-sheet behavior

  const MARGIN = 8;
  const HEADER_H = 44 + (Platform.OS === 'ios' ? 6 : 0);

  /* 0) Debug raw props (similar to web) */
  useEffect(() => {
    olog('props', {
      wordsLen: words.length,
      currentIndex,
      lessonId: lesson?.id,
      lessonTitle: lesson?.title,
      hasLesson: !!lesson,
      hasMarkdown: typeof lesson?.markdown === 'string' && lesson.markdown.length > 0,
      formulas: lesson?.formulas?.length ?? 0,
      tables: lesson?.tables?.length ?? 0,
      images: lesson?.images?.length ?? 0,
      snippets: lesson?.snippets?.length ?? 0,
      charts: lesson?.charts?.length ?? 0,
      allowMarkdownFallback,
    });
  }, [words.length, currentIndex, lesson, allowMarkdownFallback]);

  /* 1) Sentence ranges */
  const sentences = useMemo(() => {
    if (!words.length) return [] as { startWi: number; endWi: number; index: number }[];
    const spans: { startWi: number; endWi: number; index: number }[] = [];
    let start = 0;
    for (let i = 0; i < words.length; i++) {
      const w = words[i]?.text || '';
      if (SENTENCE_END.test(w)) {
        spans.push({ startWi: start, endWi: i, index: spans.length });
        start = i + 1;
      }
    }
    if (start < words.length) spans.push({ startWi: start, endWi: words.length - 1, index: spans.length });
    return spans;
  }, [words]);

  const currentSentenceIndex = useMemo(() => {
    if (!sentences.length) return 0;
    const idx = sentences.findIndex((s) => currentIndex >= s.startWi && currentIndex <= s.endWi);
    return idx === -1 ? 0 : idx;
  }, [sentences, currentIndex]);

  /* 2) Build items tied to sentences (parity with web) */
  const items = useMemo<OverlayItem[]>(() => {
    if (!lesson) return [];

    const normalizeAt = (n?: number) =>
      typeof n === 'number' && Number.isFinite(n)
        ? Math.max(0, Math.round(n - 1))
        : undefined;

    const onlyOneSentence = sentences.length <= 1;

    const atFor = (n?: number) => {
      if (onlyOneSentence) return 0;
      const v = normalizeAt(typeof n === 'number' ? n : 1);
      return typeof v === 'number' ? v : 0;
    };

    const out: OverlayItem[] = [];

    // Formulas
    (lesson.formulas || []).forEach((f, i) => {
      const at0 = atFor(f.announceAtSentence);
      if (typeof at0 === 'number') {
        const varsMd =
          Array.isArray(f.variables) && f.variables.length
            ? `\n\n**Variables**\n${f.variables
                .map((v) => `- **${v.symbol}** — ${v.meaning}`)
                .join('\n')}`
            : '';
        const readLine = f.speakAs ? `\n\n_Read as_: ${f.speakAs}` : '';
        // On web we use $$...$$ KaTeX; here we use ```math``` fenced block for RN markdown renderer.
        const md = `**${f.title || f.id || 'Formula'}**\n\n\`\`\`math\n${f.latex || ''}\n\`\`\`${varsMd}${readLine}`;
        out.push({
          kind: 'formula',
          at: at0,
          key: `F${i}:${f.id || i}`,
          md,
          title: f.title || f.id,
          speakAs: f.speakAs,
        });
      }
    });

    // Charts
    (lesson.charts || []).forEach((ch, i) => {
      const at0 = atFor(ch.announceAtSentence);
      if (typeof at0 === 'number') {
        const caption = ch.caption ? `\n\n_${ch.caption}_` : '';
        const label =
          ch.title || (ch.kind ? ch.kind.charAt(0).toUpperCase() + ch.kind.slice(1) : 'Chart');
        const imgMd = ch.url ? `\n\n![${label}](${ch.url})` : '';
        const md = `**${label}**${caption}${imgMd}`;
        out.push({
          kind: 'chart',
          at: at0,
          key: `H${i}:${ch.id || i}`,
          md,
          title: ch.title,
        });
      }
    });

    // Tables
    (lesson.tables || []).forEach((t, i) => {
      const at0 = atFor(t.announceAtSentence);
      if (typeof at0 === 'number' && (t.columns?.length || 0) && (t.rows?.length || 0)) {
        out.push({
          kind: 'table',
          at: at0,
          key: `T${i}:${t.title || i}`,
          md: renderGfmTable(t),
          title: t.title,
        });
      }
    });

    // Images (parity with web "image" kind)
    (lesson.images || []).forEach((img, i) => {
      const at0 = atFor(img.announceAtSentence);
      if (typeof at0 === 'number' && img.url) {
        const label = img.title || img.alt || 'Illustration';
        const caption = img.caption ? `\n\n_${img.caption}_` : '';
        const md = `**${label}**${caption}\n\n![${label}](${img.url})`;
        out.push({
          kind: 'image',
          at: at0,
          key: `I${i}:${img.id || i}`,
          md,
          title: img.title,
        });
      }
    });

    // Code snippets
    (lesson.snippets || []).forEach((sn, i) => {
      const at0 = atFor(sn.announceAtSentence);
      if (typeof at0 === 'number' && (sn.code || '').trim()) {
        const head = `**${sn.title || 'Code snippet'}**${
          sn.explanation ? ` — _${sn.explanation}_` : ''
        }\n\n`;
        const lang = (sn.language || '').toLowerCase();
        const md = `${head}\`\`\`${lang}\n${sn.code}\n\`\`\``;
        out.push({
          kind: 'snippet',
          at: at0,
          key: `C${i}:${sn.id || i}`,
          md,
          title: sn.title,
          language: sn.language,
        });
      }
    });

    // Optional markdown fallback (behind prop, unlike old hard-coded version)
    if (!out.length && allowMarkdownFallback && typeof lesson.markdown === 'string' && lesson.markdown) {
      const preview = lesson.markdown.split('\n').slice(0, 12).join('\n').trim();
      if (preview) {
        const md = `**Notes**\n\n${preview}`;
        out.push({
          kind: 'table', // reuse styling; semantically "notes"
          at: 0,
          key: 'N0:fallback',
          md,
          title: 'Notes',
        });
      }
    }

    return out.sort((a, b) => a.at - b.at);
  }, [lesson, sentences.length, allowMarkdownFallback]);

  const latestIdx = useMemo(() => {
    if (!items.length) return -1;
    let idx = -1;
    for (const [i, it] of items.entries()) {
      if (it.at <= currentSentenceIndex) idx = i;
      else break;
    }
    return idx;
  }, [items, currentSentenceIndex]);

  /* 3) Position/size/persistence */
  type Saved = {
    x: number;
    y: number;
    w: number;
    h: number;
    pinned: boolean;
    maximized: boolean;
    minimized: boolean;
    zoom: number;
  };

  const defaultWidth = SHEET_MODE
    ? WIN_W - MARGIN * 2
    : clamp(Math.floor(WIN_W - MARGIN * 2), 320, 560);
  const defaultHeight = SHEET_MODE
    ? clamp(
        Math.floor(WIN_H * 0.52),
        Math.floor(WIN_H * 0.38),
        Math.floor(WIN_H * 0.9)
      )
    : clamp(
        Math.floor((isPortrait ? WIN_H * 0.5 : WIN_H * 0.45) - topOffset),
        Math.floor(WIN_H * 0.4),
        Math.floor(WIN_H - MARGIN * 2)
      );

  const sheetSnapTop = Math.max(topOffset + MARGIN, Math.floor(WIN_H * 0.08));
  const sheetSnapMid = Math.floor(WIN_H * (WIN_W <= 390 ? 0.56 : 0.5));
  const sheetSnapLow = Math.floor(WIN_H - (WIN_W <= 390 ? 120 : 140));

  const defaultSaved: Saved = {
    x: MARGIN,
    y: SHEET_MODE
      ? sheetSnapMid
      : clamp(topOffset + MARGIN, MARGIN, WIN_H - defaultHeight - MARGIN),
    w: defaultWidth,
    h: defaultHeight,
    pinned: defaultPinned,
    maximized: false,
    minimized: false,
    zoom: 1,
  };

  const [pos, setPos] = useState({ x: defaultSaved.x, y: defaultSaved.y });
  const [size, setSize] = useState({ w: defaultSaved.w, h: defaultSaved.h });
  const [zoom, setZoom] = useState(defaultSaved.zoom);
  const [pinned, setPinned] = useState(defaultSaved.pinned);
  const [maximized, setMaximized] = useState(defaultSaved.maximized);
  const [minimized, setMinimized] = useState(defaultSaved.minimized);

  // Re-clamp on window changes
  useEffect(() => {
    setSize((s) => ({
      w: clamp(
        SHEET_MODE ? WIN_W - MARGIN * 2 : s.w,
        Math.min(300, WIN_W - MARGIN * 2),
        WIN_W - MARGIN * 2
      ),
      h: clamp(
        s.h,
        Math.floor(WIN_H * 0.35),
        WIN_H - MARGIN * 2
      ),
    }));
    setPos((p) => ({
      x: SHEET_MODE ? MARGIN : clamp(p.x, MARGIN, WIN_W - size.w - MARGIN),
      y: SHEET_MODE
        ? clamp(p.y, sheetSnapTop, sheetSnapLow)
        : clamp(p.y, topOffset, WIN_H - size.h - MARGIN),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [WIN_W, WIN_H, isPortrait, topOffset, SHEET_MODE]);

  // Load saved settings
  useEffect(() => {
    if (!rememberKey) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(`overlay:${rememberKey}`);
        if (!raw) return;
        const o = JSON.parse(raw) as Partial<Saved>;
        const w = clamp(
          Number(o.w ?? defaultSaved.w),
          Math.min(300, WIN_W - MARGIN * 2),
          WIN_W - MARGIN * 2
        );
        const h = clamp(
          Number(o.h ?? defaultSaved.h),
          Math.floor(WIN_H * 0.35),
          WIN_H - MARGIN * 2
        );
        setSize({ w: SHEET_MODE ? WIN_W - MARGIN * 2 : w, h });
        setPos({
          x: SHEET_MODE
            ? MARGIN
            : clamp(
                Number(o.x ?? defaultSaved.x),
                MARGIN,
                Math.max(MARGIN, WIN_W - w - MARGIN)
              ),
          y: SHEET_MODE
            ? clamp(
                Number(o.y ?? defaultSaved.y),
                sheetSnapTop,
                sheetSnapLow
              )
            : clamp(
                Number(o.y ?? defaultSaved.y),
                topOffset,
                Math.max(MARGIN, WIN_H - h - MARGIN)
              ),
        });
        setZoom(Number.isFinite(o.zoom || 0) ? Number(o.zoom) : defaultSaved.zoom);
        setPinned(!!o.pinned);
        setMaximized(!!o.maximized);
        setMinimized(!!o.minimized);
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rememberKey, WIN_W, WIN_H, topOffset, SHEET_MODE]);

  // Persist
  useEffect(() => {
    if (!rememberKey) return;
    const payload: Saved = {
      x: pos.x,
      y: pos.y,
      w: size.w,
      h: size.h,
      pinned,
      maximized,
      minimized,
      zoom,
    };
    AsyncStorage.setItem(`overlay:${rememberKey}`, JSON.stringify(payload)).catch(() => {});
  }, [rememberKey, pos, size, pinned, maximized, minimized, zoom]);

  /* 4) Visibility timing */
  const [activeIdx, setActiveIdx] = useState(-1);
  const [lastSeenAt, setLastSeenAt] = useState(0);
  useEffect(() => {
    if (latestIdx >= 0 && latestIdx !== activeIdx) {
      setActiveIdx(latestIdx);
      setLastSeenAt(Date.now());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestIdx]);

  // Items for current sentence
  const group = useMemo(() => {
    if (activeIdx < 0) return [] as OverlayItem[];
    const at = items[activeIdx]?.at;
    return items.filter((it) => it.at === at);
  }, [activeIdx, items]);

  const currentGroupSig = useMemo(() => groupSignature(group), [group]);
  const [dismissedSig, setDismissedSig] = useState<string | null>(null);

  // Only show overlay when there's at least one non-image item (parity with web)
  const hasNonImageInGroup = useMemo(
    () => group.some((it) => it.kind !== 'image'),
    [group]
  );

  const visible = useMemo(() => {
    if (minimized || activeIdx < 0) return false;
    if (!hasNonImageInGroup) return false; // hide image-only groups (like web)
    if (dismissedSig && currentGroupSig === dismissedSig) return false;
    if (pinned || maximized) return true;
    const justTriggeredOrCurrent = items[activeIdx]?.at === currentSentenceIndex;
    if (justTriggeredOrCurrent) return true;
    return Date.now() - lastSeenAt < lingerMs;
  }, [
    minimized,
    activeIdx,
    dismissedSig,
    currentGroupSig,
    pinned,
    maximized,
    items,
    currentSentenceIndex,
    lastSeenAt,
    lingerMs,
    hasNonImageInGroup,
  ]);

  // Visibility debug (parity with web)
  useEffect(() => {
    olog('visibility', {
      latestIdx,
      activeIdx,
      currentSentenceIndex,
      groupLen: group.length,
      currentGroupSig,
      dismissedSig,
      visible,
      minimized,
      pinned,
      maximized,
      lastSeenAt,
      lingerMs,
    });
  }, [
    latestIdx,
    activeIdx,
    currentSentenceIndex,
    group,
    currentGroupSig,
    dismissedSig,
    visible,
    minimized,
    pinned,
    maximized,
    lastSeenAt,
    lingerMs,
  ]);

  useEffect(() => {
    if (!group.length || !visible) {
      olog('hidden', {
        reason: !group.length ? 'no-items-for-current-sentence' : 'visible=false',
        groupLen: group.length,
        visible,
        activeIdx,
        latestIdx,
        sentencesLen: sentences.length,
        currentSentenceIndex,
        itemsLen: items.length,
        minimized,
        pinned,
        maximized,
        dismissedSig,
        currentGroupSig,
        lastSeenAt,
        lingerMs,
      });
    }
  }, [
    group.length,
    visible,
    activeIdx,
    latestIdx,
    sentences.length,
    currentSentenceIndex,
    items.length,
    minimized,
    pinned,
    maximized,
    dismissedSig,
    currentGroupSig,
    lastSeenAt,
    lingerMs,
  ]);

  /* 5) Zoom helpers (same range as web: 70–200%) */
  const zoomOut   = () => setZoom((z) => Math.max(0.7, +(z - 0.1).toFixed(2)));
  const zoomIn    = () => setZoom((z) => Math.min(2,   +(z + 0.1).toFixed(2)));
  const zoomReset = () => setZoom(1);

  /* 6) Drag (PanResponder) with sheet snaps */
  const panRef = useRef<PanResponderInstance>(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !maximized,
      onPanResponderMove: (_evt, g) => {
        if (maximized) return;
        if (SHEET_MODE) {
          setPos(() => ({
            x: MARGIN,
            y: clamp(defaultSaved.y + g.dy, sheetSnapTop, sheetSnapLow),
          }));
        } else {
          const loX = MARGIN;
          const hiX = WIN_W - size.w - MARGIN;
          const loY = freeMove ? MARGIN : topOffset || 0;
          const hiY = WIN_H - size.h - MARGIN;
          setPos((p) => ({
            x: clamp(p.x + g.dx, loX, Math.max(loX, hiX)),
            y: clamp(p.y + g.dy, loY, Math.max(loY, hiY)),
          }));
        }
      },
      onPanResponderRelease: (_e, g) => {
        if (!SHEET_MODE || maximized) return;
        const candidates: [number, number, number] = [
          sheetSnapTop,
          sheetSnapMid,
          sheetSnapLow,
        ];
        const target = defaultSaved.y + g.dy;
        const dest = candidates.reduce<number>(
          (best, y) => (Math.abs(target - y) < Math.abs(target - best) ? y : best),
          candidates[0]
        );
        setPos({ x: MARGIN, y: dest });
      },
    })
  );

  /* 7) Minimized chip (never blocks other taps) */
  if (minimized) {
    return (
      <View
        pointerEvents="box-none"
        style={[{ position: 'absolute', right: MARGIN, bottom: MARGIN, zIndex }]}
      >
        <TouchableOpacity
          onPress={() => setMinimized(false)}
          accessibilityRole="button"
          accessibilityLabel="Show lesson notes"
          accessibilityHint="Expands the notes overlay"
          style={[
            tw`px-3 py-2 rounded-full`,
            { backgroundColor: 'rgba(2,6,23,0.75)' },
          ]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={tw`text-white text-xs font-semibold`}>Notes</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!group.length || !visible) return null;

  /* 8) Controls (with accessibility) */
  const ABtn = ({
    label,
    onPress,
    a11yLabel,
    a11yHint,
    a11yState,
  }: {
    label: string;
    onPress: () => void;
    a11yLabel: string;
    a11yHint?: string;
    a11yState?: { disabled?: boolean; selected?: boolean; expanded?: boolean };
  }) => (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={a11yHint}
      accessibilityState={a11yState}
      style={[
        tw`px-2.5 py-1.5 rounded-xl ml-1`,
        {
          backgroundColor: 'rgba(2,6,23,0.7)',
          borderWidth: 1,
          borderColor: 'rgba(148,163,184,0.2)',
        },
      ]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={tw`text-slate-100 text-xs font-semibold`}>{label}</Text>
    </TouchableOpacity>
  );

  const ControlsRow = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={tw`flex-row items-center`}
      keyboardShouldPersistTaps="handled"
      accessible
      accessibilityRole="toolbar"
      accessibilityLabel="Notes controls"
    >
      <View style={tw`flex-row items-center mr-1`}>
        <ABtn
          label="−"
          onPress={zoomOut}
          a11yLabel="Zoom out"
          a11yHint="Decreases text size"
        />
        <Text
          style={tw`text-slate-200 text-xs mx-1`}
          accessible
          accessibilityLabel={`Zoom level ${Math.round(zoom * 100)} percent`}
        >
          {Math.round(zoom * 100)}%
        </Text>
        <ABtn
          label="+"
          onPress={zoomIn}
          a11yLabel="Zoom in"
          a11yHint="Increases text size"
        />
        <ABtn
          label="Reset"
          onPress={zoomReset}
          a11yLabel="Reset zoom"
          a11yHint="Resets text size to default"
        />
      </View>

      <ABtn
        label={pinned ? 'Unpin' : 'Pin'}
        onPress={() => setPinned((p) => !p)}
        a11yLabel={pinned ? 'Unpin notes' : 'Pin notes'}
        a11yHint={
          pinned ? 'Notes will auto-hide when unpinned' : 'Keeps notes visible'
        }
        a11yState={{ selected: pinned }}
      />

      <ABtn
        label="Min"
        onPress={() => setMinimized(true)}
        a11yLabel="Minimize notes"
        a11yHint="Collapses to a small chip"
      />

      {maximized ? (
        <ABtn
          label="Restore"
          onPress={() => setMaximized(false)}
          a11yLabel="Restore from full screen"
        />
      ) : (
        <ABtn
          label="Max"
          onPress={() => setMaximized(true)}
          a11yLabel="Maximize notes"
          a11yHint="Opens notes full screen"
        />
      )}

      <ABtn
        label="✕"
        onPress={() => {
          setPinned(false);
          setMaximized(false);
          setMinimized(false);
          setDismissedSig(currentGroupSig || '');
        }}
        a11yLabel="Close notes"
        a11yHint="Hides current notes until the next section"
      />
    </ScrollView>
  );

  /* 9) Full-screen maximize in a Modal (intentionally blocks taps) */
  if (maximized && fullOnMaximize) {
    return (
      <Modal
        animationType="fade"
        transparent
        visible
        onRequestClose={() => setMaximized(false)}
      >
        <View
          style={[
            tw`flex-1`,
            { backgroundColor: 'rgba(2,6,23,0.85)', paddingTop: 10 },
          ]}
        >
          <View style={tw`flex-1`}>
            {/* Header */}
            <View
              style={[
                tw`flex-row items-center px-2 py-2`,
                {
                  minHeight: HEADER_H,
                  backgroundColor: 'rgba(15,23,42,0.85)',
                  borderBottomWidth: 1,
                  borderBottomColor: 'rgba(255,255,255,0.08)',
                },
              ]}
              accessible
              accessibilityRole="header"
              accessibilityLabel="Notes full screen"
            >
              <View
                style={[
                  tw`rounded-full mx-1`,
                  {
                    width: 44,
                    height: 4,
                    backgroundColor: 'rgba(148,163,184,0.5)',
                  },
                ]}
              />
              <Text
                numberOfLines={1}
                style={[
                  tw`text-slate-200 font-bold text-sm ml-2`,
                  { maxWidth: WIN_W * 0.42 },
                ]}
              >
                {lesson?.title || 'Lesson notes'}
              </Text>
              <View style={tw`ml-auto`}>{ControlsRow}</View>
            </View>

            {/* Content */}
            <ScrollView
              style={tw`flex-1`}
              contentContainerStyle={tw`p-3 pb-6`}
              accessibilityLabel="Notes content"
            >
              {group.map((it) => (
                <View
                  key={it.key}
                  style={[
                    tw`rounded-2xl p-3 mb-2`,
                    {
                      backgroundColor: 'rgba(2,6,23,0.7)',
                      borderWidth: 1,
                      borderColor: 'rgba(148,163,184,0.18)',
                    },
                  ]}
                >
                  <Text
                    style={[
                      tw`text-white font-bold text-[10px]`,
                      {
                        position: 'absolute',
                        left: 12,
                        top: -10,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 8,
                        backgroundColor: '#8b5cf6',
                      },
                    ]}
                    accessibilityLabel={`Item type ${KIND_LABEL[it.kind]}`}
                  >
                    {KIND_LABEL[it.kind]}
                  </Text>
                  <Markdown
                    markdownStyle={{
                      body: {
                        fontSize: Math.max(
                          12,
                          (SMALL_PHONE ? 13 : 14) * zoom
                        ),
                        lineHeight: Math.max(
                          18,
                          (SMALL_PHONE ? 20 : 22) * zoom
                        ),
                        color: '#e5e7eb',
                      },
                      heading1: {
                        fontSize: Math.max(
                          16,
                          (SMALL_PHONE ? 18 : 20) * zoom
                        ),
                        marginBottom: 6,
                        color: '#fff',
                      },
                      heading2: {
                        fontSize: Math.max(
                          15,
                          (SMALL_PHONE ? 17 : 18) * zoom
                        ),
                        marginBottom: 6,
                        color: '#fff',
                      },
                      heading3: {
                        fontSize: Math.max(
                          14,
                          (SMALL_PHONE ? 16 : 16) * zoom
                        ),
                        marginBottom: 6,
                        color: '#fff',
                      },
                      code_block: {
                        fontSize: Math.max(11, 13 * zoom),
                        backgroundColor: 'rgba(2,6,23,0.6)',
                        padding: 10,
                        borderRadius: 12,
                      },
                      fence: {
                        fontSize: Math.max(11, 13 * zoom),
                        backgroundColor: 'rgba(2,6,23,0.6)',
                        padding: 10,
                        borderRadius: 12,
                      },
                      image: {
                        borderRadius: 12,
                        marginVertical: 6,
                        maxWidth: WIN_W - 24,
                      },
                    }}
                  >
                    {it.md}
                  </Markdown>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }

  /* 10) Floating draggable / sheet card (does NOT block outside taps) */
  return (
    <View
      pointerEvents="box-none"
      style={[
        { position: 'absolute', left: pos.x, top: pos.y, zIndex },
      ]}
      accessibilityElementsHidden={false}
      importantForAccessibility="yes"
    >
      <View
        style={[
          tw`overflow-hidden rounded-2xl`,
          {
            width: size.w,
            height: size.h,
            maxWidth: WIN_W - MARGIN * 2,
            maxHeight: WIN_H - MARGIN * 2,
            backgroundColor: 'rgba(15,23,42,0.9)',
            borderWidth: 1,
            borderColor: '#1f2a37',
            shadowColor: '#000',
            shadowOpacity: 0.35,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 8 },
            elevation: 12,
          },
        ]}
        accessible
        accessibilityLabel="Lesson notes"
      >
        {/* Drag header: adjustable for screen readers */}
        <View
          {...(panRef.current?.panHandlers ?? {})}
          accessibilityRole="adjustable"
          accessibilityLabel="Move notes"
          accessibilityHint={
            SHEET_MODE
              ? 'Swipe up or down to reposition'
              : 'Swipe to drag the notes'
          }
          accessibilityActions={[
            { name: 'increment', label: 'Move down' },
            { name: 'decrement', label: 'Move up' },
          ]}
          onAccessibilityAction={(e: AccessibilityActionEvent) => {
            const delta = 40;
            if (e.nativeEvent.actionName === 'increment') {
              setPos((p) => ({
                x: p.x,
                y: clamp(
                  p.y + delta,
                  SHEET_MODE ? sheetSnapTop : topOffset,
                  SHEET_MODE ? sheetSnapLow : WIN_H - size.h - MARGIN
                ),
              }));
            } else if (e.nativeEvent.actionName === 'decrement') {
              setPos((p) => ({
                x: p.x,
                y: clamp(
                  p.y - delta,
                  SHEET_MODE ? sheetSnapTop : topOffset,
                  SHEET_MODE ? sheetSnapLow : WIN_H - size.h - MARGIN
                ),
              }));
            }
          }}
          style={[
            tw`flex-row items-center px-2`,
            {
              minHeight: HEADER_H,
              backgroundColor: 'rgba(15,23,42,0.88)',
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(255,255,255,0.08)',
            },
          ]}
        >
          {/* Grab handle */}
          <View
            style={[
              tw`rounded-full`,
              {
                width: 42,
                height: 4,
                backgroundColor: 'rgba(148,163,184,0.45)',
                marginRight: 8,
              },
            ]}
          />
          <Text
            numberOfLines={1}
            style={[
              tw`text-slate-200 font-bold text-sm`,
              { maxWidth: Math.floor(size.w * 0.42) },
            ]}
          >
            {lesson?.title || 'Lesson notes'}
          </Text>
          <View style={tw`ml-auto max-w-[60%]`}>{ControlsRow}</View>
        </View>

        {/* Content */}
        <ScrollView
          style={tw`flex-1`}
          contentContainerStyle={tw`p-2.5 pb-4`}
          keyboardShouldPersistTaps="handled"
          accessibilityLabel="Notes content"
        >
          {group.map((it) => (
            <View
              key={it.key}
              style={[
                tw`rounded-2xl p-3 mb-2`,
                {
                  backgroundColor: 'rgba(2,6,23,0.7)',
                  borderWidth: 1,
                  borderColor: 'rgba(148,163,184,0.18)',
                },
              ]}
            >
              <Text
                style={[
                  tw`text-white font-bold text-[10px]`,
                  {
                    position: 'absolute',
                    left: 12,
                    top: -10,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 8,
                    backgroundColor: '#8b5cf6',
                  },
                ]}
                accessibilityLabel={`Item type ${KIND_LABEL[it.kind]}`}
              >
                {KIND_LABEL[it.kind]}
              </Text>
              <Markdown
                markdownStyle={{
                  body: {
                    fontSize: Math.max(
                      12,
                      (SMALL_PHONE ? 13 : 14) * zoom
                    ),
                    lineHeight: Math.max(
                      18,
                      (SMALL_PHONE ? 20 : 22) * zoom
                    ),
                    color: '#e5e7eb',
                  },
                  heading1: {
                    fontSize: Math.max(
                      16,
                      (SMALL_PHONE ? 18 : 20) * zoom
                    ),
                    marginBottom: 6,
                    color: '#fff',
                  },
                  heading2: {
                    fontSize: Math.max(
                      15,
                      (SMALL_PHONE ? 17 : 18) * zoom
                    ),
                    marginBottom: 6,
                    color: '#fff',
                  },
                  heading3: {
                    fontSize: Math.max(
                      14,
                      (SMALL_PHONE ? 16 : 16) * zoom
                    ),
                    marginBottom: 6,
                    color: '#fff',
                  },
                  code_block: {
                    fontSize: Math.max(11, 13 * zoom),
                    backgroundColor: 'rgba(2,6,23,0.6)',
                    padding: 10,
                    borderRadius: 12,
                  },
                  fence: {
                    fontSize: Math.max(11, 13 * zoom),
                    backgroundColor: 'rgba(2,6,23,0.6)',
                    padding: 10,
                    borderRadius: 12,
                  },
                  image: {
                    borderRadius: 12,
                    marginVertical: 6,
                    maxWidth: size.w - 24,
                  },
                }}
              >
                {it.md}
              </Markdown>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
};

export default LessonOverlayNative;
