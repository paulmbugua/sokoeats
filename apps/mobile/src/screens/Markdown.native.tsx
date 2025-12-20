// apps/mobile/src/screens/Markdown.native.tsx
import React from 'react';
import { View, Text } from 'react-native';
import tw from '../../tailwind';

// Lazy import markdown renderer so the app won’t crash if the lib isn’t installed yet.
let RNMarkdown: any;
try {
  RNMarkdown = require('react-native-markdown-display').default;
} catch {
  RNMarkdown = null;
}

// Optional: true LaTeX if you install 'react-native-math-view'
let MathView: any = null;
try {
  MathView = require('react-native-math-view').default;
} catch {}

type MarkdownProps = {
  children: string;
  className?: string;
  inline?: boolean;
  markdownStyle?: Record<string, any>;
  renderMath?: boolean;
};

function splitMathBlocks(src: string) {
  const parts: Array<{ type: 'math' | 'text'; value: string }> = [];
  const regex = /\$\$([\s\S]*?)\$\$/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(src)) !== null) {
    const before = src.slice(lastIndex, m.index);
    if (before) parts.push({ type: 'text', value: before });

    const math = (m[1] ?? '').trim(); // guard the capture group
    if (math) parts.push({ type: 'math', value: math });

    lastIndex = regex.lastIndex;
  }

  const tail = src.slice(lastIndex);
  if (tail) parts.push({ type: 'text', value: tail });

  return parts;
}

const defaultMarkdownStyles = (zoom = 1) => ({
  body: { color: '#e5e7eb', fontSize: 14 * zoom, lineHeight: 22 * zoom },
  heading1: { color: '#ffffff', fontSize: 20 * zoom, marginBottom: 6 },
  heading2: { color: '#ffffff', fontSize: 18 * zoom, marginBottom: 6 },
  heading3: { color: '#ffffff', fontSize: 16 * zoom, marginBottom: 6 },
  code_block: {
    backgroundColor: 'rgba(2,6,23,0.6)',
    padding: 10,
    borderRadius: 10,
    fontSize: 13 * zoom,
  },
  fence: {
    backgroundColor: 'rgba(2,6,23,0.6)',
    padding: 10,
    borderRadius: 10,
    fontSize: 13 * zoom,
  },
  table: {
    borderWidth: 0.5,
    borderColor: 'rgba(148,163,184,0.3)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  thead: { backgroundColor: 'rgba(30,41,59,0.9)' },
  th: {
    color: '#e5e7eb',
    fontWeight: '700',
    padding: 8,
    borderRightWidth: 0.5,
    borderRightColor: 'rgba(148,163,184,0.3)',
  },
  td: {
    color: '#e5e7eb',
    padding: 8,
    borderRightWidth: 0.5,
    borderRightColor: 'rgba(148,163,184,0.2)',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(148,163,184,0.2)',
  },
  image: { borderRadius: 12, marginVertical: 6 },
  strong: { color: '#ffffff' },
  em: { color: '#a78bfa' },
  link: { color: '#93c5fd' },
  blockquote: { borderLeftColor: '#93c5fd', borderLeftWidth: 3, paddingLeft: 10, color: '#e5e7eb' },
  hr: { borderColor: 'rgba(148,163,184,0.2)', borderWidth: 0.5 },
});

export default function Markdown({
  children,
  className,
  inline = false,
  markdownStyle,
  renderMath = false,
}: MarkdownProps) {
  if (!RNMarkdown) {
    return (
      <View style={className ? tw`${className}` : undefined}>
        <Text style={tw`text-slate-200`}>{children}</Text>
      </View>
    );
  }

  const segments = splitMathBlocks(children);
  const styles = { ...defaultMarkdownStyles(1), ...(markdownStyle || {}) };

  // Inline rules: use node.key (or a safe fallback) instead of parent.key
  // inside Markdown.native.tsx

  const inlineRules = inline
    ? {
        paragraph: (node: any, _children: any) => (
          <Text
            key={node?.key ?? `p-${Math.random().toString(36).slice(2)}`}
            style={tw`text-slate-200`}
          >
            {_children}
          </Text>
        ),

        // ✅ IMPORTANT: never return a Fragment for inline markdown nodes
        view: (node: any, _children: any) => (
          <Text
            key={node?.key ?? `v-${Math.random().toString(36).slice(2)}`}
            style={tw`text-slate-200`}
          >
            {_children}
          </Text>
        ),
      }
    : undefined;

  return (
    <View style={className ? tw`${className}` : undefined}>
      {segments.map((seg, i) => {
        if (seg.type === 'math') {
          if (renderMath && MathView) {
            return (
              <View key={`math-${i}`} style={tw`my-2`}>
                <MathView math={seg.value} color="white" />
              </View>
            );
          }
          const fenced = '```math\n' + seg.value + '\n```';
          return (
            <RNMarkdown key={`math-fallback-${i}`} style={styles} rules={inlineRules}>
              {fenced}
            </RNMarkdown>
          );
        }

        return (
          <RNMarkdown
            key={`md-${i}`}
            style={styles}
            rules={{
              // FIX: safe key usage
              link: (node: any, children: any) => (
                <Text
                  key={node?.key ?? `a-${Math.random().toString(36).slice(2)}`}
                  style={tw`text-sky-300 underline`}
                >
                  {children}
                </Text>
              ),
              image: (node: any) => (
                <View
                  key={node?.key ?? `img-${Math.random().toString(36).slice(2)}`}
                  style={tw`my-1 overflow-hidden rounded-2xl`}
                />
              ),
              ...(inlineRules || {}),
            }}
          >
            {seg.value}
          </RNMarkdown>
        );
      })}
    </View>
  );
}
