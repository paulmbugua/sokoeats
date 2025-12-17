/* eslint-disable prettier/prettier */
// apps/mobile/src/screens/LessonOverlay.native.tsx

import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  PanResponder,
  ScrollView,
  Platform,
  useWindowDimensions,
  GestureResponderEvent, 
  PanResponderGestureState, 
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../tailwind';
import Markdown from '../screens/Markdown.native';

/* ── Types ───────────────────────────────── */
type Word = { text: string; start: number; end: number };

type Formula = {
  id: string;
  latex: string;
  title?: string;
  variables?: { symbol: string; meaning: string }[];
};

type Table = {
  id?: string;
  title: string;
  columns: string[];
  rows: (string | number | boolean)[][];
  caption?: string;
};

type ChartItem = {
  id: string;
  title?: string;
  kind?:
    | 'bar'
    | 'line'
    | 'pie'
    | 'histogram'
    | 'scatter'
    | 'box'
    | 'heatmap'
    | 'other';
  alt?: string;
  url?: string;
  svg?: string;
  caption?: string;
};

type SnippetItem = {
  id: string;
  title?: string;
  language?: string;
  code: string;
  explanation?: string;
};

type LessonLike = {
  id: string;
  title?: string;
  markdown?: string; // ignored for overlay now
  formulas?: Formula[];
  tables?: Table[];
  snippets?: SnippetItem[];
  charts?: ChartItem[];
};

export type LessonOverlayHandle = {
  open: () => void;
  close: () => void;
  toggle: () => void;
};

export interface LessonOverlayProps {
  words?: Word[];
  currentIndex?: number;

  lesson?: LessonLike | null;
  rememberKey?: string;
  zIndex?: number;
}

/* ── Helpers ─────────────────────────────── */
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function dist2(t1: any, t2: any) {
  const dx = (t2.pageX ?? 0) - (t1.pageX ?? 0);
  const dy = (t2.pageY ?? 0) - (t1.pageY ?? 0);
  return Math.sqrt(dx * dx + dy * dy);
}

function renderGfmTable(t: Table) {
  const cols = t.columns || [];
  const rows = t.rows || [];
  if (!cols.length || !rows.length) return '';

  const head = `| ${cols.join(' | ')} |\n| ${cols.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.map((x) => String(x)).join(' | ')} |`).join('\n');

  return `**${t.title || 'Table'}**${t.caption ? ` — _${t.caption}_` : ''}\n\n${head}\n${body}`;
}

function buildOverlayMarkdown(lesson?: LessonLike | null) {
  const formulas = lesson?.formulas || [];
  const tables = lesson?.tables || [];
  const snippets = lesson?.snippets || [];
  const charts = lesson?.charts || [];

  const blocks: { kind: string; key: string; md: string }[] = [];

  formulas.forEach((f, i) => {
    const vars =
      Array.isArray(f.variables) && f.variables.length
        ? `\n\n**Variables**\n${f.variables.map((v) => `- **${v.symbol}** — ${v.meaning}`).join('\n')}`
        : '';
    const md = `### ${f.title || f.id || 'Formula'}\n\n\`\`\`math\n${f.latex || ''}\n\`\`\`${vars}`;
    blocks.push({ kind: 'Formula', key: `F:${f.id || i}`, md });
  });

  tables.forEach((t, i) => {
    const md = renderGfmTable(t);
    if (md.trim()) blocks.push({ kind: 'Table', key: `T:${t.id || t.title || i}`, md: `### Table\n\n${md}` });
  });

  snippets.forEach((s, i) => {
    if (!String(s.code || '').trim()) return;
    const lang = String(s.language || '').toLowerCase();
    const title = s.title || 'Code snippet';
    const expl = s.explanation ? ` — _${s.explanation}_` : '';
    const md = `### ${title}${expl}\n\n\`\`\`${lang}\n${s.code}\n\`\`\``;
    blocks.push({ kind: 'Snippet', key: `S:${s.id || i}`, md });
  });

  charts.forEach((c, i) => {
    const label =
      c.title ||
      (c.kind ? c.kind.charAt(0).toUpperCase() + c.kind.slice(1) : 'Chart');
    const caption = c.caption ? `\n\n_${c.caption}_` : '';
    const alt = c.alt ? `\n\n**Alt:** ${c.alt}` : '';
    const link = c.url ? `\n\n**Link:** ${c.url}` : '';
    const svg = c.svg ? `\n\n\`\`\`svg\n${c.svg}\n\`\`\`` : '';
    const md = `### ${label}${caption}${alt}${link}${svg}`;
    blocks.push({ kind: 'Chart', key: `C:${c.id || i}`, md });
  });

  return blocks;
}

/* ── Component ───────────────────────────── */
const LessonOverlayNative = React.memo(
  React.forwardRef<LessonOverlayHandle, LessonOverlayProps>(function LessonOverlayNative(
    { lesson, rememberKey, zIndex = 999999 },
    ref
  ) {
    const { width: W, height: H } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    const M = 10;
    const SAFE_TOP = (insets?.top ?? 0) + M;
    const SAFE_BOTTOM = (insets?.bottom ?? 0) + M;

    const overlayItems = useMemo(() => buildOverlayMarkdown(lesson), [lesson]);
    const hasContent = overlayItems.length > 0;

    const defaultW = Math.min(420, Math.floor(W * 0.92));
    const defaultH = Math.min(Math.floor(H * 0.48), 420);

    const MIN_W = 240;
    const MIN_H = 180;

    const maxW = Math.max(MIN_W, Math.floor(W - M * 2));
    const maxH = Math.max(MIN_H, Math.floor(H - SAFE_TOP - SAFE_BOTTOM));

    const initialW = clamp(defaultW, MIN_W, maxW);
    const initialH = clamp(defaultH, MIN_H, maxH);

    const initialX = clamp(W - initialW - M, M, Math.max(M, W - initialW - M));
    const initialY = clamp(SAFE_TOP + 80, SAFE_TOP, Math.max(SAFE_TOP, H - initialH - SAFE_BOTTOM));

    const [open, setOpen] = useState(false);

    // Animated state
    const translate = useRef(new Animated.ValueXY({ x: initialX, y: initialY })).current;
    const wAnim = useRef(new Animated.Value(initialW)).current;
    const hAnim = useRef(new Animated.Value(initialH)).current;

    // Track current values (for clamping + persistence)
    const curRef = useRef({
      x: initialX,
      y: initialY,
      w: initialW,
      h: initialH,
    });

    // keep updated without touching private Animated internals
    useEffect(() => {
      const sx = translate.x.addListener(({ value }) => {
        curRef.current.x = value;
      });
      const sy = translate.y.addListener(({ value }) => {
        curRef.current.y = value;
      });
      const sw = wAnim.addListener(({ value }) => {
        curRef.current.w = value;
      });
      const sh = hAnim.addListener(({ value }) => {
        curRef.current.h = value;
      });

      return () => {
        translate.x.removeListener(sx);
        translate.y.removeListener(sy);
        wAnim.removeListener(sw);
        hAnim.removeListener(sh);
      };
    }, [translate.x, translate.y, wAnim, hAnim]);

    // If lesson no longer has overlay content, force-close
    useEffect(() => {
      if (open && !hasContent) setOpen(false);
    }, [open, hasContent]);

    const apiOpen = useCallback(() => {
      if (!hasContent) return;
      setOpen(true);
    }, [hasContent]);

    const apiClose = useCallback(() => setOpen(false), []);
    const apiToggle = useCallback(() => {
      if (!hasContent) return;
      setOpen((v) => !v);
    }, [hasContent]);

    useImperativeHandle(ref, () => ({ open: apiOpen, close: apiClose, toggle: apiToggle }), [
      apiOpen,
      apiClose,
      apiToggle,
    ]);

    const clampAndSpringIntoBounds = useCallback(() => {
      const wNow = clamp(curRef.current.w, MIN_W, Math.max(MIN_W, Math.floor(W - M * 2)));
      const hNow = clamp(curRef.current.h, MIN_H, Math.max(MIN_H, Math.floor(H - SAFE_TOP - SAFE_BOTTOM)));

      const hiX = W - wNow - M;
      const hiY = H - hNow - SAFE_BOTTOM;

      const xNow = curRef.current.x;
      const yNow = curRef.current.y;

      const xTarget = clamp(xNow, M, Math.max(M, hiX));
      const yTarget = clamp(yNow, SAFE_TOP, Math.max(SAFE_TOP, hiY));

      const wTarget = wNow;
      const hTarget = hNow;

      // spring position (native)
      Animated.spring(translate, {
        toValue: { x: xTarget, y: yTarget },
        useNativeDriver: true,
        speed: 18,
        bounciness: 6,
      }).start();

      // spring size (layout)
      Animated.spring(wAnim, {
        toValue: wTarget,
        useNativeDriver: false,
        speed: 18,
        bounciness: 4,
      }).start();

      Animated.spring(hAnim, {
        toValue: hTarget,
        useNativeDriver: false,
        speed: 18,
        bounciness: 4,
      }).start();
    }, [W, H, M, SAFE_TOP, SAFE_BOTTOM, MIN_W, MIN_H, translate, wAnim, hAnim]);

    // Clamp on rotation / window resize
    useEffect(() => {
      if (!open) return;
      clampAndSpringIntoBounds();
    }, [W, H, SAFE_TOP, SAFE_BOTTOM, open, clampAndSpringIntoBounds]);

    // Persistence (x/y/w/h) — debounced
    const saveTimer = useRef<any>(null);
    useEffect(() => {
      if (!rememberKey) return;
      if (!open) return;

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        AsyncStorage.setItem(
          `overlay_box:${rememberKey}`,
          JSON.stringify({
            x: curRef.current.x,
            y: curRef.current.y,
            w: curRef.current.w,
            h: curRef.current.h,
          })
        ).catch(() => {});
      }, 250);

      return () => saveTimer.current && clearTimeout(saveTimer.current);
    }, [rememberKey, open, W, H]); // window changes already trigger clamp; actual values saved after gestures below

    // Restore persistence when key changes
    useEffect(() => {
      if (!rememberKey) return;
      (async () => {
        try {
          const raw = await AsyncStorage.getItem(`overlay_box:${rememberKey}`);
          if (!raw) return;
          const parsed = JSON.parse(raw) as Partial<{ x: number; y: number; w: number; h: number }>;

          const w0 = typeof parsed.w === 'number' ? parsed.w : initialW;
          const h0 = typeof parsed.h === 'number' ? parsed.h : initialH;

          const w1 = clamp(w0, MIN_W, Math.max(MIN_W, Math.floor(W - M * 2)));
          const h1 = clamp(h0, MIN_H, Math.max(MIN_H, Math.floor(H - SAFE_TOP - SAFE_BOTTOM)));

          const x0 = typeof parsed.x === 'number' ? parsed.x : initialX;
          const y0 = typeof parsed.y === 'number' ? parsed.y : initialY;

          const x1 = clamp(x0, M, Math.max(M, W - w1 - M));
          const y1 = clamp(y0, SAFE_TOP, Math.max(SAFE_TOP, H - h1 - SAFE_BOTTOM));

          // set immediately (no animation on restore)
          translate.setValue({ x: x1, y: y1 });
          wAnim.setValue(w1);
          hAnim.setValue(h1);

          curRef.current = { x: x1, y: y1, w: w1, h: h1 };
        } catch {}
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rememberKey]);
/* ── Drag (header only) ───────────────── */
const dragResponder = useMemo(
  () =>
    PanResponder.create({
      // don’t capture taps (so close button still works)
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,

      // capture once the user actually drags (prevents ScrollView below)
      onMoveShouldSetPanResponder: (evt, g) =>
        (evt.nativeEvent.touches?.length ?? 0) === 1 &&
        (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2),

      onMoveShouldSetPanResponderCapture: (evt, g) =>
        (evt.nativeEvent.touches?.length ?? 0) === 1 &&
        (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2),

      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,

      onPanResponderGrant: () => {
        translate.stopAnimation((v: any) => {
          translate.setOffset({ x: v.x, y: v.y });
          translate.setValue({ x: 0, y: 0 });
        });
      },

      // ✅ REAL FUNCTION (no Animated.event) → fixes “config.onPanResponderMove…”
      onPanResponderMove: (_evt, g) => {
        translate.setValue({ x: g.dx, y: g.dy });
      },

      onPanResponderRelease: () => {
        translate.flattenOffset();
        translate.stopAnimation((v: any) => {
          curRef.current.x = v.x;
          curRef.current.y = v.y;

          clampAndSpringIntoBounds();

          if (rememberKey) {
            AsyncStorage.setItem(
              `overlay_box:${rememberKey}`,
              JSON.stringify({
                x: curRef.current.x,
                y: curRef.current.y,
                w: curRef.current.w,
                h: curRef.current.h,
              })
            ).catch(() => {});
          }
        });
      },

      onPanResponderTerminate: () => {
        translate.flattenOffset();
        translate.stopAnimation((v: any) => {
          curRef.current.x = v.x;
          curRef.current.y = v.y;
          clampAndSpringIntoBounds();
        });
      },
    }),
  [translate, clampAndSpringIntoBounds, rememberKey]
);


    /* ── Resize (corner grip) ─────────────── */
    const resizeStartRef = useRef({ w: initialW, h: initialH });

    const resizeResponder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          resizeStartRef.current = { w: curRef.current.w, h: curRef.current.h };
        },
        onPanResponderMove: (_evt, g) => {
          wAnim.setValue(resizeStartRef.current.w + g.dx);
          hAnim.setValue(resizeStartRef.current.h + g.dy);
        },
        onPanResponderRelease: () => {
          clampAndSpringIntoBounds();
          if (rememberKey) {
            AsyncStorage.setItem(
              `overlay_box:${rememberKey}`,
              JSON.stringify({
                x: curRef.current.x,
                y: curRef.current.y,
                w: curRef.current.w,
                h: curRef.current.h,
              })
            ).catch(() => {});
          }
        },
        onPanResponderTerminate: () => {
          clampAndSpringIntoBounds();
        },
      })
    ).current;

    /* ── Pinch-to-resize (2 fingers anywhere) ─ */
    const pinchRef = useRef({ active: false, startDist: 1, startW: initialW, startH: initialH });

    const pinchResponder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponderCapture: (evt) => (evt.nativeEvent.touches?.length ?? 0) >= 2,
        onMoveShouldSetPanResponderCapture: (evt) => (evt.nativeEvent.touches?.length ?? 0) >= 2,
        onPanResponderGrant: (evt) => {
          const touches = evt.nativeEvent.touches || [];
          if (touches.length < 2) return;

          pinchRef.current = {
            active: true,
            startDist: Math.max(1, dist2(touches[0], touches[1])),
            startW: curRef.current.w,
            startH: curRef.current.h,
          };
        },
        onPanResponderMove: (evt) => {
          const touches = evt.nativeEvent.touches || [];
          if (!pinchRef.current.active || touches.length < 2) return;

          const d = Math.max(1, dist2(touches[0], touches[1]));
          const scale = d / pinchRef.current.startDist;

          wAnim.setValue(pinchRef.current.startW * scale);
          hAnim.setValue(pinchRef.current.startH * scale);
        },
        onPanResponderRelease: () => {
          pinchRef.current.active = false;
          clampAndSpringIntoBounds();
          if (rememberKey) {
            AsyncStorage.setItem(
              `overlay_box:${rememberKey}`,
              JSON.stringify({
                x: curRef.current.x,
                y: curRef.current.y,
                w: curRef.current.w,
                h: curRef.current.h,
              })
            ).catch(() => {});
          }
        },
        onPanResponderTerminate: () => {
          pinchRef.current.active = false;
          clampAndSpringIntoBounds();
        },
      })
    ).current;

    // Nothing to show unless it’s open AND has content
    if (!open || !hasContent) return null;

  return (
  <View
    pointerEvents="box-none"
    style={[
      {
        position: 'absolute',
        left: 0,
        top: 0,
        zIndex,
        elevation: zIndex,
      },
    ]}
  >
    {/* OUTER: translate */}
    <Animated.View style={{ transform: translate.getTranslateTransform() }}>
      {/* INNER: size */}
      <Animated.View
        {...pinchResponder.panHandlers}
        style={[
          tw`rounded-2xl overflow-hidden`,
          {
            width: wAnim,
            height: hAnim,
            backgroundColor: 'rgba(15,23,42,0.92)',
            borderWidth: 1,
            borderColor: 'rgba(148,163,184,0.18)',
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 6 },
            ...(Platform.OS === 'android' ? { elevation: 14 } : null),
          },
        ]}
        accessible
        accessibilityLabel="Lesson overlay"
      >
        {/* Header (drag bar) */}
        <View
          {...dragResponder.panHandlers}
          style={[
            tw`flex-row items-center px-3`,
            {
              height: 44,
              backgroundColor: 'rgba(2,6,23,0.55)',
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(255,255,255,0.08)',
            },
          ]}
        >
          <View
            style={[
              tw`rounded-full mr-2`,
              { width: 40, height: 4, backgroundColor: 'rgba(148,163,184,0.5)' },
            ]}
          />
          <Text numberOfLines={1} style={tw`text-white font-bold text-sm flex-1`}>
            {lesson?.title ? `Overlay — ${lesson.title}` : 'Overlay'}
          </Text>

          <TouchableOpacity
            onPress={apiClose}
            accessibilityRole="button"
            accessibilityLabel="Close overlay"
            style={tw`h-8 w-8 rounded-xl items-center justify-center`}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={18} color="#f9fafb" />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView
          style={tw`flex-1`}
          contentContainerStyle={tw`p-3 pb-10`}
          keyboardShouldPersistTaps="handled"
        >
          {overlayItems.map((b) => (
            <View
              key={b.key}
              style={[
                tw`rounded-2xl p-3 mb-3`,
                {
                  backgroundColor: 'rgba(2,6,23,0.55)',
                  borderWidth: 1,
                  borderColor: 'rgba(148,163,184,0.14)',
                },
              ]}
            >
              <Markdown
                markdownStyle={{
                  body: { fontSize: 14, lineHeight: 20, color: '#e5e7eb' },
                  heading1: { color: '#fff' },
                  heading2: { color: '#fff' },
                  heading3: { color: '#fff' },
                  code_block: {
                    fontSize: 12,
                    backgroundColor: 'rgba(2,6,23,0.6)',
                    padding: 10,
                    borderRadius: 12,
                  },
                  fence: {
                    fontSize: 12,
                    backgroundColor: 'rgba(2,6,23,0.6)',
                    padding: 10,
                    borderRadius: 12,
                  },
                }}
              >
                {b.md}
              </Markdown>
            </View>
          ))}
        </ScrollView>

        {/* Resize grip */}
        <View
          {...resizeResponder.panHandlers}
          style={{
            position: 'absolute',
            right: 6,
            bottom: 6,
            width: 34,
            height: 34,
            borderRadius: 12,
            backgroundColor: 'rgba(2,6,23,0.40)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          pointerEvents="box-only"
          accessibilityLabel="Resize overlay"
          accessible
        >
          <View style={{ position: 'absolute', right: 9, bottom: 10, width: 14, height: 2, backgroundColor: 'rgba(148,163,184,0.75)', transform: [{ rotate: '-35deg' }] }} />
          <View style={{ position: 'absolute', right: 8, bottom: 16, width: 10, height: 2, backgroundColor: 'rgba(148,163,184,0.55)', transform: [{ rotate: '-35deg' }] }} />
          <View style={{ position: 'absolute', right: 7, bottom: 22, width: 6, height: 2, backgroundColor: 'rgba(148,163,184,0.40)', transform: [{ rotate: '-35deg' }] }} />
        </View>
      </Animated.View>
    </Animated.View>
  </View>
);


    
  })
);

LessonOverlayNative.displayName = 'LessonOverlayNative';
export default LessonOverlayNative;
