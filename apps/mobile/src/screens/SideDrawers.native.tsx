/* eslint-disable no-console */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Animated,
  Easing,
  Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import tw from '../../tailwind';

/* ─────────────────────────────────────────────────────────
   Optional Markdown for React Native
   - If `react-native-markdown-display` is installed, we use it.
   - Otherwise we render plain text.
   ───────────────────────────────────────────────────────── */
let RNMarkdown: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  RNMarkdown = require('react-native-markdown-display').default;
} catch {
  /* optional */
}

/* ─────────────────────────────────────────────────────────
   Types (shared)
   ───────────────────────────────────────────────────────── */
type Word = { text: string; start: number; end: number };
type Line = { text: string; start: number; end: number; indices: number[] };

/* ─────────────────────────────────────────────────────────
   Utility: SlideIn panel (left/right)
   ───────────────────────────────────────────────────────── */
function useSlideIn(open: boolean, from: 'left' | 'right', widthPx: number) {
  const [rendered, setRendered] = useState(open);
  const x = useRef(new Animated.Value(open ? 0 : from === 'right' ? widthPx : -widthPx)).current;

  useEffect(() => {
    if (open) setRendered(true);
    Animated.timing(x, {
      toValue: open ? 0 : from === 'right' ? widthPx : -widthPx,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !open) setRendered(false);
    });
  }, [open, from, widthPx, x]);

  return { rendered, style: { transform: [{ translateX: x }] } as const };
}

/* ─────────────────────────────────────────────────────────
   MarkdownPro (native)
   ───────────────────────────────────────────────────────── */
export const MarkdownPro: React.FC<{
  children: string;
  zoom?: number;
  size?: 'base' | 'lg';
  className?: string; // kept for API parity; ignored in RN
}> = ({ children, zoom = 1, size = 'base' }) => {
  const fontBase = size === 'lg' ? 16 : 14; // base font, scaled by zoom
  const computedFont = Math.round(fontBase * zoom);

  if (!RNMarkdown) {
    return (
      <ScrollView style={tw`max-h-[70vh]`}>
        <Text
          style={[
            tw`text-slate-800 dark:text-slate-100`,
            { fontSize: computedFont, lineHeight: computedFont * 1.5 },
          ]}
        >
          {children}
        </Text>
      </ScrollView>
    );
  }

  const rules = {
    body: (node: any, childrenRN: any) => (
      <View key={node.key} style={tw`px-1`}>
        {childrenRN}
      </View>
    ),
    code_inline: (node: any, childrenRN: any) => (
      <Text key={node.key} style={tw`px-1 py-0.5 rounded bg-zinc-900/5 dark:bg-white/10`}>
        {node.content}
      </Text>
    ),
    fence: (node: any) => (
      <ScrollView key={node.key} horizontal style={tw`mb-2`}>
        <Text
          style={[
            tw`p-3 rounded-lg bg-zinc-900/5 dark:bg-white/10 text-[13px]`,
            { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
          ]}
        >
          {node.content}
        </Text>
      </ScrollView>
    ),
    table: (node: any, childrenRN: any) => (
      <ScrollView key={node.key} horizontal style={tw`my-2 rounded-xl`}>
        <View
          style={tw`bg-white dark:bg-slate-900 rounded-xl border border-black/10 dark:border-slate-700`}
        >
          {childrenRN}
        </View>
      </ScrollView>
    ),
    th: (node: any, childrenRN: any) => (
      <View
        key={node.key}
        style={tw`px-3 py-2 bg-slate-100 dark:bg-slate-800 border-b border-black/10 dark:border-slate-700`}
      >
        <Text style={tw`font-semibold text-slate-900 dark:text-slate-100`}>{childrenRN}</Text>
      </View>
    ),
    td: (node: any, childrenRN: any) => (
      <View key={node.key} style={tw`px-3 py-2 border-b border-black/5 dark:border-slate-800`}>
        <Text style={tw`text-slate-800 dark:text-slate-100`}>{childrenRN}</Text>
      </View>
    ),
  };

  return (
    <RNMarkdown
      style={{
        body: { fontSize: computedFont, lineHeight: computedFont * 1.5, color: '#0f172a' },
        text: { color: '#0f172a' },
        heading2: { fontSize: Math.round(computedFont * 1.35), fontWeight: '700' },
        heading3: { fontSize: Math.round(computedFont * 1.2), fontWeight: '700' },
        code_inline: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
      }}
      rules={rules}
    >
      {children || '_No notes for this lesson yet._'}
    </RNMarkdown>
  );
};

/* ─────────────────────────────────────────────────────────
   Transcript Drawer (native)
   ───────────────────────────────────────────────────────── */
export interface TranscriptDrawerProps {
  open: boolean;
  title: string;
  lines: Line[];
  words: Word[];
  activeLine: number;
  currentIndex: number;
  top: number; // px from top edge to avoid overlap
  bottom: number; // px from bottom edge to avoid overlap
  readerScale: number;
  loading?: boolean;
  error?: string;
  onSeekToWord: (wordIndex: number) => void;
  scrollRef?: React.RefObject<ScrollView | null>;
}

export const TranscriptDrawer: React.FC<TranscriptDrawerProps> = ({
  open,
  title,
  lines,
  words,
  activeLine,
  currentIndex,
  top,
  bottom,
  readerScale,
  loading,
  error,
  onSeekToWord,
  scrollRef,
}) => {
  const inset = useSafeAreaInsets();
  const screenW = Dimensions.get('window').width;
  // width similar to web breakpoints: default 56% on phones, ~40–45% on tablets
  const panelW = Math.round(screenW * (screenW >= 900 ? 0.4 : screenW >= 720 ? 0.45 : 0.56));
  const { rendered, style } = useSlideIn(open, 'right', panelW);

  if (!rendered) return null;

  return (
    <Animated.View
      style={[
        tw`absolute z-40 bg-white dark:bg-slate-900`,
        style,
        {
          right: 0,
          top,
          bottom,
          width: panelW,
          borderTopLeftRadius: 16,
          borderBottomLeftRadius: 16,
          borderWidth: 1,
          borderColor: 'rgba(0,0,0,0.1)',
        },
      ]}
      pointerEvents="box-none"
    >
      {/* Header */}
      <View style={tw`px-4 py-3 border-b border-black/10 dark:border-slate-700`}>
        <Text
          numberOfLines={1}
          // BEFORE: text-transparent + gradient classes (web-only)
          // style={tw`font-semibold text-base text-transparent bg-clip-text bg-gradient-to-r from-[#f5a] via-indigo-300 to-indigo-600`}
          style={tw`font-semibold text-base text-[#0d141c] dark:text-white`}
        >
          {title}
        </Text>

        <Text style={tw`mt-0.5 text-slate-600 dark:text-slate-300 text-[12px]`}>
          Transcript (tap a line to seek)
        </Text>
      </View>

      {/* Lines */}
      <ScrollView ref={scrollRef as any} style={tw`flex-1`} contentContainerStyle={tw`px-2 py-2`}>
        {lines.map((ln, i) => {
          const active = i === activeLine;
          return (
            <TouchableOpacity
              key={`${ln.start}-${i}`}
              onPress={() => {
                if (ln.indices.length > 0) {
                  onSeekToWord(ln.indices[0]!); // safe due to the length check
                }
              }}
              style={[
                tw`rounded-md px-3 py-2 mb-2`,
                active ? tw`bg-slate-100 dark:bg-slate-800` : tw`bg-transparent`,
              ]}
            >
              <Text
                style={[
                  tw`text-slate-800 dark:text-slate-200`,
                  { fontSize: 14 * readerScale, lineHeight: 22 * readerScale },
                ]}
              >
                {ln.indices.map((wi, j) => {
                  const w = words[wi];
                  if (!w) return null; // guard against out-of-bounds/undefined
                  const isActiveWord = wi === currentIndex;
                  return (
                    <Text
                      key={`${wi}-${j}`}
                      style={isActiveWord ? [tw`bg-white text-black rounded px-1`] : undefined}
                    >
                      {(j ? ' ' : '') + w.text}
                    </Text>
                  );
                })}
              </Text>
            </TouchableOpacity>
          );
        })}
        {!!loading && (
          <Text style={tw`px-3 text-[12px] text-slate-600 dark:text-slate-300`}>
            Generating TTS…
          </Text>
        )}
        {!!error && !loading && (
          <Text style={tw`px-3 text-[12px] text-red-600 dark:text-red-300`}>{error}</Text>
        )}
        <View style={{ height: inset.bottom + 8 }} />
      </ScrollView>
    </Animated.View>
  );
};

/* ─────────────────────────────────────────────────────────
   Notes Drawer (native)
   ───────────────────────────────────────────────────────── */
export interface NotesDrawerProps {
  open: boolean;
  title: string;
  markdown: string;
  top: number;
  bottom: number;
  readerScale: number;
  isMax?: boolean;
}

export const NotesDrawer: React.FC<NotesDrawerProps> = ({
  open,
  title,
  markdown,
  top,
  bottom,
  readerScale,
  isMax = false,
}) => {
  const inset = useSafeAreaInsets();
  const screenW = Dimensions.get('window').width;
  const panelW = Math.round(screenW * (screenW >= 900 ? 0.4 : screenW >= 720 ? 0.45 : 0.56));
  const { rendered, style } = useSlideIn(open, 'left', panelW);

  if (!rendered) return null;

  return (
    <Animated.View
      style={[
        tw`absolute z-40 bg-white dark:bg-slate-900`,
        style,
        {
          left: 0,
          top,
          bottom,
          width: panelW,
          borderTopRightRadius: 16,
          borderBottomRightRadius: 16,
          borderWidth: 1,
          borderColor: 'rgba(0,0,0,0.1)',
        },
      ]}
      pointerEvents="box-none"
    >
      {/* Header */}
      <View style={tw`px-4 py-3 border-b border-black/10 dark:border-slate-700`}>
        <Text
          numberOfLines={1}
          // BEFORE: text-transparent + gradient classes (web-only)
          // style={tw`font-semibold text-base text-transparent bg-clip-text bg-gradient-to-r from-[#f5a] via-indigo-300 to-indigo-600`}
          style={tw`font-semibold text-base text-[#0d141c] dark:text-white`}
        >
          {title}
        </Text>

        <Text style={tw`mt-0.5 text-slate-600 dark:text-slate-300 text-[12px]`}>
          Formulas & tables render here. Audio sticks with narration.
        </Text>
      </View>

      {/* Content */}
      <ScrollView style={tw`flex-1`} contentContainerStyle={tw`p-3`}>
        <MarkdownPro zoom={readerScale} size={isMax ? 'lg' : 'base'}>
          {markdown || '_No notes for this lesson yet._'}
        </MarkdownPro>
        <View style={{ height: inset.bottom + 8 }} />
      </ScrollView>
    </Animated.View>
  );
};
