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
  // images?: never  ✅ intentionally not supported
};

export type LessonOverlayHandle = {
  open: () => void;
  close: () => void;
  toggle: () => void;
};

export interface LessonOverlayProps {
  // kept for compatibility, but not used for gating anymore
  words?: Word[];
  currentIndex?: number;

  lesson?: LessonLike | null;
  rememberKey?: string;
  zIndex?: number;
}

/* ── Helpers ─────────────────────────────── */
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

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

  // ✅ Charts: NO image rendering. We show caption + SVG source or a link.
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

    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState({
      x: clamp(W - defaultW - M, M, Math.max(M, W - defaultW - M)),
      y: clamp(SAFE_TOP + 80, SAFE_TOP, Math.max(SAFE_TOP, H - defaultH - SAFE_BOTTOM)),
    });

    const size = useMemo(() => ({ w: defaultW, h: defaultH }), [defaultW, defaultH]);

    // Persistence (position only)
    useEffect(() => {
      if (!rememberKey) return;
      (async () => {
        try {
          const raw = await AsyncStorage.getItem(`overlay_pos:${rememberKey}`);
          if (!raw) return;
          const parsed = JSON.parse(raw) as Partial<{ x: number; y: number }>;
          if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
            setPos({
              x: clamp(parsed.x, M, Math.max(M, W - size.w - M)),
              y: clamp(parsed.y, SAFE_TOP, Math.max(SAFE_TOP, H - size.h - SAFE_BOTTOM)),
            });
          }
        } catch {}
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rememberKey, W, H, size.w, size.h]);

    useEffect(() => {
      if (!rememberKey) return;
      AsyncStorage.setItem(`overlay_pos:${rememberKey}`, JSON.stringify(pos)).catch(() => {});
    }, [rememberKey, pos]);

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

    // Drag
    const dragStartRef = useRef({ x: 0, y: 0 });
    const panResponder = useMemo(
      () =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onPanResponderGrant: () => {
            dragStartRef.current = { x: pos.x, y: pos.y };
          },
          onPanResponderMove: (_evt, g) => {
            const hiX = W - size.w - M;
            const hiY = H - size.h - SAFE_BOTTOM;
            setPos({
              x: clamp(dragStartRef.current.x + g.dx, M, Math.max(M, hiX)),
              y: clamp(dragStartRef.current.y + g.dy, SAFE_TOP, Math.max(SAFE_TOP, hiY)),
            });
          },
        }),
      [pos.x, pos.y, W, H, size.w, size.h, M, SAFE_TOP, SAFE_BOTTOM]
    );

    // Nothing to show unless it’s open AND has content
    if (!open || !hasContent) return null;

    return (
      <View
        pointerEvents="box-none"
        style={[
          {
            position: 'absolute',
            left: pos.x,
            top: pos.y,
            zIndex,
            elevation: zIndex,
          },
        ]}
      >
        <View
          style={[
            tw`rounded-2xl overflow-hidden`,
            {
              width: size.w,
              height: size.h,
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
            {...panResponder.panHandlers}
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
            <View style={[tw`rounded-full mr-2`, { width: 40, height: 4, backgroundColor: 'rgba(148,163,184,0.5)' }]} />
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
            contentContainerStyle={tw`p-3 pb-4`}
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
                    // ✅ no image styling (and we never emit markdown images)
                  }}
                >
                  {b.md}
                </Markdown>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    );
  })
);

LessonOverlayNative.displayName = 'LessonOverlayNative';
export default LessonOverlayNative;
