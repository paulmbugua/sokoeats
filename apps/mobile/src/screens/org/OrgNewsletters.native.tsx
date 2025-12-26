/* eslint-disable no-console */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { useThemePref } from '../../theme/ThemeContext';

import tw from '../../../tailwind';
import { useShopContext } from '@mytutorapp/shared/context';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';
import { useOrgNewsletters } from '@mytutorapp/shared/hooks/useOrgNewsletters';
import { useOrgClassLabels } from '@mytutorapp/shared/hooks/useOrgClassLabels';

import {
  apiCreateOrgNewsletter,
  apiGenerateOrgNewsletterContent,
  apiUpdateOrgNewsletter,
  apiPreviewNewsletterRecipients,
  apiSendOrgNewsletter,
  apiListNewsletterRecipients,
  type OrgNewsletter,
} from '@mytutorapp/shared/api/orgProApi';

// ⬇️ If you want pull-to-refresh parity, keep these imports like ProfileScreen.
// If your project already has them, great. If not, replace with a plain ScrollView.
import { RefreshableScrollView } from '../../refresh/Refreshable';
import { useRegisterScreenRefresh } from '../../refresh/GlobalRefreshProvider';

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

type NewsletterTheme = {
  fontFamily: 'Inter' | 'Georgia' | 'Times New Roman' | 'Arial' | 'Poppins';
  baseFontSize: number; // 12..18
  primaryColor: string;
  headingColor: string;
  textColor: string;
  headerStyle: 'band' | 'minimal' | 'split' | 'gradient' | 'card' | 'underline';
  paperBg: string;
  headerBg: string;
  headerBg2: string;
};

const DEFAULT_THEME: NewsletterTheme = {
  fontFamily: 'Inter',
  baseFontSize: 14,
  primaryColor: '#2563eb',
  headingColor: '#0f172a',
  textColor: '#0f172a',
  headerStyle: 'band',
  paperBg: '#ffffff',
  headerBg: '#f8fafc',
  headerBg2: '#ffffff',
};

const HEADER_STYLE_OPTIONS: Array<{ k: NewsletterTheme['headerStyle']; label: string }> = [
  { k: 'band', label: 'Band' },
  { k: 'minimal', label: 'Minimal' },
  { k: 'split', label: 'Split' },
  { k: 'gradient', label: 'Gradient' },
  { k: 'card', label: 'Card' },
  { k: 'underline', label: 'Underline' },
];

const ACCENT_PRESETS = [
  ['Neutral', '#0f172a'],
  ['Ocean', '#2563eb'],
  ['Emerald', '#059669'],
] as const satisfies ReadonlyArray<readonly [string, string]>;


const TEMPLATE_TYPES = [
  { key: 'wrapup', label: 'End-of-term wrap-up', hint: 'Warm summary + appreciation + what’s next' },
  { key: 'awards', label: 'Celebrations & awards', hint: 'Achievements, character wins, clubs & sports' },
  { key: 'academics', label: 'Academics focus', hint: 'Progress, tips for revision, holiday practice' },
  { key: 'community', label: 'Community & events', hint: 'Upcoming dates, reminders, fees notices, contact channels' },
] as const;

type Tone = 'Warm' | 'Formal' | 'Energetic';

function buildAiNotes(opts: {
  templateKey: string;
  tone: Tone;
  includeFees: boolean;
  includeDates: boolean;
  includeClubs: boolean;
  includeAwards: boolean;
  extra: string;
}) {
  const bits: string[] = [];
  bits.push(`Template type: ${opts.templateKey}`);
  bits.push(`Tone: ${opts.tone}`);
  bits.push(`Structure rules (MUST follow):`);
  bits.push(`- Output clean Markdown with these sections ONLY (use ## headings):`);
  bits.push(`  1) ## Message from the School`);
  bits.push(`  2) ## Highlights`);
  bits.push(`  3) ## Learning & Progress`);
  bits.push(`  4) ## Activities & Character`);
  bits.push(`  5) ## Important Notices`);
  bits.push(`  6) ## Upcoming Dates`);
  bits.push(`  7) ## Appreciation & Next Term`);
  bits.push(`- Use short paragraphs and bullet lists (no long walls of text).`);
  bits.push(`- Do NOT include letterhead/contact/signature in the markdown (we render those).`);
  bits.push(`- Keep it professional and school-appropriate.`);
  bits.push(`Content toggles:`);
  bits.push(`- Include fees reminder: ${opts.includeFees ? 'YES' : 'NO'}`);
  bits.push(`- Include upcoming dates section with placeholders: ${opts.includeDates ? 'YES' : 'NO'}`);
  bits.push(`- Mention clubs/sports: ${opts.includeClubs ? 'YES' : 'NO'}`);
  bits.push(`- Mention awards/celebrations: ${opts.includeAwards ? 'YES' : 'NO'}`);
  if (opts.extra?.trim()) bits.push(`Extra instructions: ${opts.extra.trim()}`);
  return bits.join('\n');
}

function stripThemeFromContent(md: string) {
  return String(md || '').replace(/^\s*<!--THEME[\s\S]*?-->\s*/i, '');
}

function parseThemeFromContent(md: string): NewsletterTheme | null {
  const m = String(md || '').match(/<!--THEME\s+(\{[\s\S]*?\})\s*-->/i);
  if (!m?.[1]) return null;
  try {
    const obj = JSON.parse(m[1]);
    return {
      ...DEFAULT_THEME,
      ...(obj || {}),
      baseFontSize: clamp(Number(obj?.baseFontSize ?? DEFAULT_THEME.baseFontSize), 12, 18),
    };
  } catch {
    return null;
  }
}

function upsertThemeIntoContent(md: string, theme: NewsletterTheme) {
  const clean = stripThemeFromContent(md || '');
  return `<!--THEME ${JSON.stringify(theme)} -->\n\n${clean}`.trim();
}

function statusPillTw(status: OrgNewsletter['status']) {
  const base = 'px-2 py-1 rounded-full border';
  if (status === 'sent')
    return `${base} border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-900/20`;
  if (status === 'sending')
    return `${base} border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-900/20`;
  if (status === 'archived')
    return `${base} border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-[#0f1821]`;
  return `${base} border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-900/20`;
}

function statusTextTw(status: OrgNewsletter['status']) {
  if (status === 'sent') return 'text-emerald-800 dark:text-emerald-200';
  if (status === 'sending') return 'text-amber-800 dark:text-amber-200';
  if (status === 'archived') return 'text-slate-700 dark:text-white';
  return 'text-blue-800 dark:text-blue-200';
}

function fmtDate(s?: string | null) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString();
  } catch {
    return String(s);
  }
}

/**
 * Minimal markdown renderer for your AI template format:
 * - ## headings
 * - bullets (- / *)
 * - paragraphs
 */
function MarkdownPreview({
  md,
  theme,
}: {
  md: string;
  theme: NewsletterTheme;
}) {
  const clean = stripThemeFromContent(md || '');
  const lines = clean.split('\n');

  const nodes: Array<React.ReactNode> = [];
  let i = 0;

  const pushParagraph = (buf: string[]) => {
    const txt = buf.join(' ').trim();
    if (!txt) return;
    nodes.push(
      <Text
        key={`p-${nodes.length}`}
        style={[
          tw`text-[14px] leading-6`,
          { color: theme.textColor, fontSize: theme.baseFontSize },
        ]}
      >
        {txt}
      </Text>
    );
    nodes.push(<View key={`sp-${nodes.length}`} style={tw`h-2`} />);
  };

  const pushBullets = (items: string[]) => {
    nodes.push(
      <View key={`ul-${nodes.length}`} style={tw`mt-1 mb-2`}>
        {items.map((t, idx) => (
          <View key={`li-${nodes.length}-${idx}`} style={tw`flex-row items-start mb-1`}>
            <Text style={[tw`mr-2`, { color: theme.textColor, fontSize: theme.baseFontSize }]}>•</Text>
            <Text
              style={[
                tw`flex-1`,
                { color: theme.textColor, fontSize: theme.baseFontSize, lineHeight: theme.baseFontSize * 1.55 },
              ]}
            >
              {t}
            </Text>
          </View>
        ))}
      </View>
    );
    nodes.push(<View key={`sp-${nodes.length}`} style={tw`h-1`} />);
  };

  while (i < lines.length) {
    const raw = lines[i] ?? '';
    const line = raw.trim();

    if (!line) {
      i++;
      continue;
    }

    if (line.startsWith('## ')) {
      nodes.push(
        <Text
          key={`h2-${nodes.length}`}
          style={[
            tw`mt-3 mb-2 font-bold`,
            { color: theme.headingColor, fontSize: theme.baseFontSize + 3 },
          ]}
        >
          {line.replace(/^##\s+/, '')}
        </Text>
      );
      i++;
      continue;
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      const bullets: string[] = [];
      while (i < lines.length) {
        const l2 = (lines[i] ?? '').trim();
        if (!(l2.startsWith('- ') || l2.startsWith('* '))) break;
        bullets.push(l2.replace(/^[-*]\s+/, '').trim());
        i++;
      }
      pushBullets(bullets);
      continue;
    }

    // paragraph block
    const buf: string[] = [];
    while (i < lines.length) {
      const l2 = (lines[i] ?? '').trim();
      if (!l2) {
        i++;
        break;
      }
      if (l2.startsWith('## ') || l2.startsWith('- ') || l2.startsWith('* ')) break;
      buf.push(l2);
      i++;
    }
    pushParagraph(buf);
  }

  return <View>{nodes}</View>;
}

function NewsletterHeaderNative({
  org,
  title,
  termLabel,
  theme,
}: {
  org: any;
  title: string;
  termLabel: string;
  theme: NewsletterTheme;
}) {
  const orgName = org?.name || 'School';
  const dateStr = new Date().toLocaleDateString();

  const cardBase = tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821]`;
  const inner = tw`p-4`;

  const accentBg = theme.headerBg || '#f8fafc';

  if (theme.headerStyle === 'card') {
    return (
      <View style={[cardBase, { backgroundColor: accentBg }]}>
        <View style={[tw`m-3 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821]`, tw`p-4`]}>
          <View style={tw`flex-row items-start justify-between`}>
            <View style={tw`flex-1 pr-3`}>
              <Text style={[tw`text-[16px] font-extrabold dark:text-white`, { color: theme.headingColor }]} numberOfLines={1}>
                {orgName}
              </Text>
              <Text style={tw`text-xs text-[#49739c] dark:text-white/70`} numberOfLines={1}>
                {termLabel || ''}
              </Text>
            </View>
            <View style={tw`items-end`}>
              <View style={[tw`px-3 py-1 rounded-full border`, { borderColor: theme.primaryColor + '33', backgroundColor: theme.primaryColor + '12' }]}>
                <Text style={[tw`text-[11px] font-bold`, { color: theme.primaryColor }]}>Newsletter</Text>
              </View>
              <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70 mt-1`}>{dateStr}</Text>
            </View>
          </View>

          <Text style={[tw`mt-3 text-[20px] font-bold dark:text-white`, { color: theme.headingColor }]}>
            {title || 'End-of-term Newsletter'}
          </Text>

          <View style={[tw`mt-3 h-1 rounded-full`, { backgroundColor: theme.primaryColor }]} />
        </View>
      </View>
    );
  }

  if (theme.headerStyle === 'underline') {
    return (
      <View style={[cardBase, { backgroundColor: accentBg }]}>
        <View style={inner}>
          <Text style={[tw`text-[16px] font-extrabold dark:text-white`, { color: theme.headingColor }]} numberOfLines={1}>
            {orgName}
          </Text>
          <Text style={tw`text-xs text-[#49739c] dark:text-white/70`} numberOfLines={1}>
            {termLabel || ''} • {dateStr}
          </Text>

          <Text style={[tw`mt-3 text-[22px] font-bold dark:text-white`, { color: theme.headingColor }]}>
            {title || 'End-of-term Newsletter'}
          </Text>

          <View style={[tw`mt-2 h-1 rounded-full`, { backgroundColor: theme.primaryColor }]} />
        </View>
      </View>
    );
  }

  if (theme.headerStyle === 'split') {
    return (
      <View style={[cardBase, { backgroundColor: accentBg }]}>
        <View style={tw`p-4`}>
          <View style={tw`flex-row items-stretch`}>
            <View style={tw`flex-1 pr-3`}>
              <Text style={[tw`text-[16px] font-extrabold dark:text-white`, { color: theme.headingColor }]} numberOfLines={1}>
                {orgName}
              </Text>
              <Text style={tw`text-xs text-[#49739c] dark:text-white/70`} numberOfLines={1}>
                {termLabel || ''}
              </Text>
              <Text style={tw`text-xs text-[#49739c] dark:text-white/70`} numberOfLines={1}>
                {dateStr}
              </Text>
            </View>

            <View
              style={[
                tw`rounded-2xl px-3 py-3 border`,
                {
                  borderColor: theme.primaryColor + '33',
                  backgroundColor: theme.primaryColor + '12',
                  minWidth: 140,
                },
              ]}
            >
              <Text style={[tw`text-[11px] font-extrabold uppercase`, { color: theme.primaryColor }]}>
                Newsletter
              </Text>
              <Text style={[tw`mt-2 text-[16px] font-bold`, { color: theme.headingColor }]} numberOfLines={3}>
                {title || 'End-of-term Newsletter'}
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (theme.headerStyle === 'gradient') {
    // Native “fake gradient”: background headerBg + subtle accent overlay strip
    return (
      <View style={[cardBase, { backgroundColor: accentBg }]}>
        <View style={[tw`h-2 rounded-t-2xl`, { backgroundColor: theme.primaryColor }]} />
        <View style={inner}>
          <View style={tw`flex-row items-start justify-between`}>
            <View style={tw`flex-1 pr-3`}>
              <Text style={[tw`text-[16px] font-extrabold dark:text-white`, { color: theme.headingColor }]} numberOfLines={1}>
                {orgName}
              </Text>
              <Text style={tw`text-xs text-[#49739c] dark:text-white/70`} numberOfLines={1}>
                {termLabel || ''} • {dateStr}
              </Text>
            </View>
            <View style={[tw`px-3 py-1 rounded-full border`, { borderColor: theme.primaryColor + '33', backgroundColor: theme.primaryColor + '12' }]}>
              <Text style={[tw`text-[11px] font-bold`, { color: theme.primaryColor }]}>Newsletter</Text>
            </View>
          </View>

          <Text style={[tw`mt-3 text-[22px] font-bold dark:text-white`, { color: theme.headingColor }]}>
            {title || 'End-of-term Newsletter'}
          </Text>
        </View>
      </View>
    );
  }

  if (theme.headerStyle === 'minimal') {
    return (
      <View style={[cardBase, { backgroundColor: accentBg }]}>
        <View style={inner}>
          <Text style={[tw`text-[16px] font-extrabold dark:text-white`, { color: theme.headingColor }]} numberOfLines={1}>
            {orgName}
          </Text>
          <Text style={tw`text-xs text-[#49739c] dark:text-white/70`} numberOfLines={1}>
            {termLabel || ''} • {dateStr}
          </Text>

          <Text style={[tw`mt-3 text-[22px] font-bold dark:text-white`, { color: theme.headingColor }]}>
            {title || 'End-of-term Newsletter'}
          </Text>
        </View>
      </View>
    );
  }

  // band (default)
  return (
    <View style={[cardBase, { backgroundColor: accentBg }]}>
      <View style={[tw`h-2 rounded-t-2xl`, { backgroundColor: theme.primaryColor }]} />
      <View style={inner}>
        <Text style={[tw`text-[16px] font-extrabold dark:text-white`, { color: theme.headingColor }]} numberOfLines={1}>
          {orgName}
        </Text>
        <Text style={tw`text-xs text-[#49739c] dark:text-white/70`} numberOfLines={1}>
          {termLabel || ''} • {dateStr}
        </Text>

        <Text style={[tw`mt-3 text-[22px] font-bold dark:text-white`, { color: theme.headingColor }]}>
          {title || 'End-of-term Newsletter'}
        </Text>
      </View>
    </View>
  );
}

function hexOk(s: string) {
  const v = String(s || '').trim();
  return /^#?[0-9a-fA-F]{6}$/.test(v) || /^#?[0-9a-fA-F]{3}$/.test(v);
}
function normalizeHex(s: string) {
  const v = String(s || '').trim();
  if (!v) return '';
  return v.startsWith('#') ? v : `#${v}`;
}

function hexToRgb(hex: string) {
  const h = String(hex || '').trim().replace('#', '');

  if (h.length === 3) {
    const a = h[0];
    const b = h[1];
    const c = h[2];
    if (!a || !b || !c) return null;

    const r = parseInt(a + a, 16);
    const g = parseInt(b + b, 16);
    const b2 = parseInt(c + c, 16);
    return { r, g, b: b2 };
  }

  if (h.length !== 6) return null;

  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);

  if ([r, g, b].some((x) => Number.isNaN(x))) return null;
  return { r, g, b };
}


function relLuminance(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  const toLin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };

  const R = toLin(rgb.r);
  const G = toLin(rgb.g);
  const B = toLin(rgb.b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(fg: string, bg: string) {
  const L1 = relLuminance(fg);
  const L2 = relLuminance(bg);
  if (L1 == null || L2 == null) return null;
  const light = Math.max(L1, L2);
  const dark = Math.min(L1, L2);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * If fg is low-contrast on bg, return fallback.
 * Works only for hex colors; otherwise returns fg unchanged.
 */
function ensureContrastHex(fg: string, bg: string, fallback: string, min = 4.5) {
  const f = String(fg || '').trim();
  const b = String(bg || '').trim();
  if (!hexOk(f) || !hexOk(b) || !hexOk(fallback)) return fg;
  const fgN = normalizeHex(f);
  const bgN = normalizeHex(b);
  const ratio = contrastRatio(fgN, bgN);
  if (!ratio) return fgN;
  return ratio >= min ? fgN : normalizeHex(fallback);
}


function markdownToHtmlSimple(md: string) {
  const clean = stripThemeFromContent(md || '');
  const lines = clean.split('\n');
  let html = '';
  let inUl = false;

  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (inUl) {
        html += '</ul>';
        inUl = false;
      }
      continue;
    }

    if (line.startsWith('## ')) {
      if (inUl) {
        html += '</ul>';
        inUl = false;
      }
      html += `<h2>${esc(line.replace(/^##\s+/, ''))}</h2>`;
      continue;
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inUl) {
        html += '<ul>';
        inUl = true;
      }
      html += `<li>${esc(line.replace(/^[-*]\s+/, ''))}</li>`;
      continue;
    }

    if (inUl) {
      html += '</ul>';
      inUl = false;
    }

    html += `<p>${esc(line)}</p>`;
  }

  if (inUl) html += '</ul>';
  return html;
}

function buildNewsletterHtml(opts: {
  org: any;
  title: string;
  termLabel: string;
  signatureLabel: string;
  theme: NewsletterTheme;
  contentMd: string;
}) {
  const { org, title, termLabel, signatureLabel, theme, contentMd } = opts;

  const orgName = org?.name || 'School';
  const logoUrl = org?.logo_url || '';
  const signatureUrl = org?.signature_url || '';
  const dateStr = new Date().toLocaleDateString();

  const contactLine = [org?.address_line1, org?.address_line2].filter(Boolean).join(' • ');
  const contactLine2 = [
    org?.phone_number && `Tel: ${org.phone_number}`,
    org?.contact_email && `Email: ${org.contact_email}`,
    org?.website_url && `Website: ${org.website_url}`,
  ]
    .filter(Boolean)
    .join(' • ');

  const bodyHtml = markdownToHtmlSimple(contentMd || '');

  // Keep it simple & reliable for printing
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root{
    --nl-primary: ${theme.primaryColor};
    --nl-heading: ${theme.headingColor};
    --nl-text: ${theme.textColor};
    --nl-paper: ${theme.paperBg || '#ffffff'};
    --nl-header-bg: ${theme.headerBg || '#f8fafc'};
  }
  body{
    margin:0;
    font-family: Arial, sans-serif;
    background: var(--nl-paper);
    color: var(--nl-text);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page{
    padding: 18mm 14mm;
  }
  .card{
    border: 1px solid #d9e2ee;
    border-radius: 14px;
    overflow: hidden;
    background: var(--nl-paper);
  }
  .topbar{
    height: 10px;
    background: var(--nl-primary);
  }
  .header{
    padding: 14px 16px;
    background: var(--nl-header-bg);
    border-bottom: 1px solid rgba(2,6,23,0.08);
  }
  .row{
    display:flex;
    align-items:flex-start;
    gap:12px;
  }
  .logo{
    width:52px;height:52px;border-radius:10px;object-fit:contain;background:#fff;border:1px solid rgba(2,6,23,0.06);
  }
  .meta{
    flex:1;
  }
  .orgname{ font-weight:800; color: var(--nl-heading); font-size: 16px; margin:0; }
  .contact{ color:#526379; font-size: 11px; margin-top:4px; }
  .chip{
    padding: 6px 10px;
    border-radius: 999px;
    border:1px solid rgba(37,99,235,0.2);
    background: rgba(37,99,235,0.08);
    font-weight:800;
    font-size: 11px;
    color: var(--nl-primary);
    white-space:nowrap;
  }
  .title{
    margin-top: 12px;
    font-size: 22px;
    font-weight: 800;
    color: var(--nl-heading);
  }
  .body{
    padding: 16px;
    font-size: ${clamp(theme.baseFontSize, 12, 18)}px;
  }
  h2{
    margin: 14px 0 8px;
    font-size: 1.08em;
    color: var(--nl-heading);
  }
  p{
    margin: 8px 0;
    line-height: 1.55;
  }
  ul{ margin: 6px 0 10px 18px; }
  li{ margin: 4px 0; }
  .hr{ border:0;border-top:1px solid rgba(2,6,23,0.12); margin: 12px 0; }
  .sig{
    display:flex;
    justify-content:space-between;
    align-items:flex-end;
    gap:16px;
  }
  .sigL .label{ font-weight:800; color: var(--nl-heading); }
  .sigL .sub{ font-size: 11px; color:#526379; margin-top:2px; }
  .sigR{ text-align:right; }
  .sigImg{ height: 42px; max-width: 220px; object-fit: contain; }
  .sigLine{ width:220px; height:42px; border-bottom: 1px solid #aab8c7; }
  .sigHint{ font-size: 11px; color:#526379; margin-top:4px; }
</style>
</head>
<body>
  <div class="page">
    <div class="card">
      <div class="topbar"></div>
      <div class="header">
        <div class="row">
          ${logoUrl ? `<img class="logo" src="${logoUrl}" />` : `<div class="logo"></div>`}
          <div class="meta">
            <p class="orgname">${orgName}</p>
            ${contactLine ? `<div class="contact">${contactLine}</div>` : ``}
            ${contactLine2 ? `<div class="contact">${contactLine2}</div>` : ``}
          </div>
          <div>
            <div class="chip">Newsletter • ${termLabel || 'This term'}</div>
            <div class="contact" style="text-align:right;margin-top:6px;">${dateStr}</div>
          </div>
        </div>
        <div class="title">${(title || 'End-of-term Newsletter').replace(/</g, '&lt;')}</div>
      </div>

      <div class="body">
        ${bodyHtml}
        <hr class="hr" />

        <div class="sig">
          <div class="sigL">
            <div class="label">${(signatureLabel || 'Head teacher / Principal').replace(/</g, '&lt;')}</div>
            <div class="sub">${orgName}</div>
          </div>
          <div class="sigR">
            ${
              signatureUrl
                ? `<img class="sigImg" src="${signatureUrl}" />`
                : `<div class="sigLine"></div>`
            }
            <div class="sigHint">Signature</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function buildPdfBase64Native(args: {
  html: string;
  fileName: string;
}): Promise<{ uri: string; base64: string }> {
  const res = await Print.printToFileAsync({
    html: args.html,
    base64: true,
  });

  // Some expo-file-system typings may not expose EncodingType/cacheDirectory in your monorepo.
  const FS = FileSystem as any;
  const base64Encoding = FS?.EncodingType?.Base64 ?? 'base64';

  // expo-print returns base64 on SDKs that support it; fallback to read file
  let b64 = (res as any)?.base64 || '';
  if (!b64 && res?.uri) {
    b64 = await FileSystem.readAsStringAsync(res.uri, { encoding: base64Encoding });
  }

  // Ensure file has a .pdf extension for sharing
  let uri = res.uri;
  if (uri && !uri.toLowerCase().endsWith('.pdf')) {
    const cacheDir = FS?.cacheDirectory ?? FS?.documentDirectory ?? '';
    const next = `${cacheDir}${args.fileName}`;
    try {
      await FileSystem.copyAsync({ from: uri, to: next });
      uri = next;
    } catch {
      // ignore
    }
  }

  return { uri, base64: b64 };
}


const OrgNewslettersNativeScreen: React.FC = () => {
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();

  const NAV_SPACER_PX = 12;
  const FOOTER_OVERLAY_PX = 84;
  const bottomPad = Math.max(FOOTER_OVERLAY_PX, FOOTER_OVERLAY_PX + insets.bottom);

  const shop = (useShopContext?.() ?? {}) as any;
  const backendUrl: string = shop?.backendUrl || shop?.apiUrl || '';
  const orgToken: string | undefined = shop?.orgToken;
  

  const { isPro, upgradeCta, org } = useOrgProTools();
  const orgId = org?.id as string | undefined;

  const { data: listData, isLoading: loadingList, refetch } = useOrgNewsletters(orgId);

  const items = useMemo<OrgNewsletter[]>(
    () => ((listData?.items || []) as OrgNewsletter[]),
    [listData]
  );

  const [selectedId, setSelectedId] = useState<string>('');
  const selected = useMemo(
    () => items.find((x) => String(x.id) === String(selectedId)) || null,
    [items, selectedId]
  );

  // editor state
  const [title, setTitle] = useState('');
  const [termLabel, setTermLabel] = useState('');
  const [content, setContent] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

  // theme state
  const [theme, setTheme] = useState<NewsletterTheme>(DEFAULT_THEME);
  const [principalLabel, setPrincipalLabel] = useState('Head teacher / Principal');

  // AI controls
  const [templateKey, setTemplateKey] =
    useState<(typeof TEMPLATE_TYPES)[number]['key']>('wrapup');
  const [tone, setTone] = useState<Tone>('Warm');
  const [includeFees, setIncludeFees] = useState(true);
  const [includeDates, setIncludeDates] = useState(true);
  const [includeClubs, setIncludeClubs] = useState(true);
  const [includeAwards, setIncludeAwards] = useState(true);
  const [aiExtra, setAiExtra] = useState('');

  // send panel
  const [sendOpen, setSendOpen] = useState(false);
  const [sendMode, setSendMode] = useState<'all' | 'class' | 'custom'>('all');
  const [sendClass, setSendClass] = useState('');
  const [customEmails, setCustomEmails] = useState('');

  const classLabelsQ = useOrgClassLabels(orgId, Boolean(sendOpen && sendMode === 'class'));
  const { resolvedScheme } = useThemePref();
const isDark = resolvedScheme === 'dark';

// These are your preview card backgrounds (match your Tailwind dark bg values)
const previewCardBg = isDark ? '#0f1821' : '#ffffff';

const previewTheme = useMemo<NewsletterTheme>(() => {
  // Only adjust *preview* text colors so they are readable on the preview card.
  // Do NOT mutate the actual saved theme / PDF theme.
  const safeHeading = ensureContrastHex(
    theme.headingColor,
    previewCardBg,
    isDark ? '#e5f0ff' : '#0f172a',
    4.5
  );

  const safeText = ensureContrastHex(
    theme.textColor,
    previewCardBg,
    isDark ? '#e5f0ff' : '#0f172a',
    4.5
  );

  return {
    ...theme,
    headingColor: safeHeading,
    textColor: safeText,
  };
}, [theme, isDark, previewCardBg]);

const previewMuted = isDark ? 'rgba(255,255,255,0.7)' : '#49739c';


  const [recipientPreview, setRecipientPreview] = useState<null | {
    count: number;
    sample: string[];
    learners?: number;
    learner_sample?: string[];
    emails?: number;
    email_sample?: string[];
  }>(null);

  const [deliveryLog, setDeliveryLog] = useState<null | {
    summary: { total: number; delivered: number; failed: number };
    items: Array<{ recipient_email: string; delivered: boolean; error?: string | null }>;
  }>(null);

  const setThemeAndSync = useCallback((next: NewsletterTheme) => {
    setTheme(next);
    setContent((prev) => upsertThemeIntoContent(prev, next));
  }, []);

  // load selected into editor
  useEffect(() => {
    if (!selected) return;

    const md = selected.content_md || '';
    setTitle(selected.title || '');
    setTermLabel(selected.term_label || '');
    setContent(md);

    const parsed = parseThemeFromContent(md);
    if (parsed) setTheme(parsed);

    setRecipientPreview(null);
    setDeliveryLog(null);
  }, [selected?.id]);

  const createMut = useMutation({
    mutationFn: async (payload: { title: string; term_label?: string }) => {
      if (!backendUrl || !orgId) throw new Error('Missing backendUrl/orgId');
      return apiCreateOrgNewsletter(backendUrl, String(orgId), payload, orgToken);
    },
    onSuccess: async (n) => {
      await qc.invalidateQueries({ queryKey: ['org-newsletters', orgId] });
      setSelectedId(String(n.id));
      setFlash('Draft created ✨');
      setTimeout(() => setFlash(null), 1500);
    },
    onError: (e: any) => Alert.alert('Create failed', e?.message || 'Could not create newsletter.'),
  });

  const genMut = useMutation({
    mutationFn: async () => {
      if (!backendUrl || !orgId) throw new Error('Missing backendUrl/orgId');
      const notes = buildAiNotes({
        templateKey,
        tone,
        includeFees,
        includeDates,
        includeClubs,
        includeAwards,
        extra: aiExtra,
      });
      return apiGenerateOrgNewsletterContent(
        backendUrl,
        String(orgId),
        { title, term_label: termLabel, notes },
        orgToken
      );
    },
    onSuccess: (d) => {
      if (d?.titleSuggestion && (!title || title.trim().length < 3)) setTitle(d.titleSuggestion);
      const nextMd = upsertThemeIntoContent(d.content_md || '', theme);
      setContent(nextMd);
      setFlash('Generated ✨');
      setTimeout(() => setFlash(null), 1200);
    },
    onError: (e: any) => Alert.alert('Generate failed', e?.message || 'Could not generate content.'),
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!backendUrl || !orgId || !selectedId) throw new Error('Missing inputs');
      return apiUpdateOrgNewsletter(
        backendUrl,
        String(orgId),
        String(selectedId),
        {
          title,
          term_label: termLabel,
          content_md: upsertThemeIntoContent(content, theme),
        },
        orgToken
      );
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-newsletters', orgId] });
      setFlash('Saved ✅');
      setTimeout(() => setFlash(null), 1200);
    },
    onError: (e: any) => Alert.alert('Save failed', e?.message || 'Could not save newsletter.'),
  });

  const previewRecipients = useCallback(async () => {
    if (!backendUrl || !orgId || !selectedId) return;

    const recipients =
      sendMode === 'custom'
        ? customEmails.split(/[,\n]/g).map((x) => x.trim()).filter(Boolean)
        : [];

    try {
      const p = await apiPreviewNewsletterRecipients(
        backendUrl,
        String(orgId),
        String(selectedId),
        {
          channel: 'in_app',
          mode: sendMode,
          class_label: sendMode === 'class' ? sendClass.trim() : undefined,
          recipients,
        },
        orgToken
      );
      setRecipientPreview(p);
    } catch (e: any) {
      Alert.alert('Preview failed', e?.message || 'Could not preview recipients.');
    }
  }, [backendUrl, orgId, selectedId, sendMode, sendClass, customEmails, orgToken]);

  const sendMut = useMutation({
    mutationFn: async () => {
      if (!backendUrl || !orgId || !selectedId) throw new Error('Missing inputs');

      const recipients =
        sendMode === 'custom'
          ? customEmails.split(/[,\n]/g).map((x) => x.trim()).filter(Boolean)
          : [];

      // Build PDF base64 from native HTML
      const html = buildNewsletterHtml({
        org,
        title,
        termLabel,
        signatureLabel: principalLabel,
        theme,
        contentMd: content,
      });

      const safeName = `${(title || 'newsletter').trim().replace(/[^\w\d-_]+/g, '_').slice(0, 60)}.pdf`;
      const pdf = await buildPdfBase64Native({ html, fileName: safeName });

      return apiSendOrgNewsletter(
        backendUrl,
        String(orgId),
        String(selectedId),
        {
          channel: 'both',
          mode: sendMode,
          class_label: sendMode === 'class' ? sendClass.trim() : undefined,
          recipients,
          pdf_base64: pdf.base64 || null,
        },
        orgToken
      );
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-newsletters', orgId] });

      try {
        if (backendUrl && orgId && selectedId) {
          const log = await apiListNewsletterRecipients(
            backendUrl,
            String(orgId),
            String(selectedId),
            orgToken
          );

          setDeliveryLog({
            summary: log.summary,
            items: (log.items || []).slice(0, 50).map((x: any) => ({
              recipient_email: x.recipient_email,
              delivered: x.delivered,
              error: x.error,
            })),
          });
        }
      } catch {
        // ignore
      }

      setFlash('Sent (or recorded) 🚀');
      setTimeout(() => setFlash(null), 1600);
    },
    onError: (e: any) => Alert.alert('Send failed', e?.message || 'Could not send newsletter.'),
  });

  const exportPdf = useCallback(async () => {
    try {
      const html = buildNewsletterHtml({
        org,
        title,
        termLabel,
        signatureLabel: principalLabel,
        theme,
        contentMd: content,
      });

      const safeName = `${(title || 'newsletter').trim().replace(/[^\w\d-_]+/g, '_').slice(0, 60)}.pdf`;
      const pdf = await buildPdfBase64Native({ html, fileName: safeName });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Unavailable', 'Sharing is not available on this device.');
        return;
      }

      await Sharing.shareAsync(pdf.uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Export Newsletter PDF',
        UTI: 'com.adobe.pdf',
      });
    } catch (e: any) {
      Alert.alert('PDF export failed', e?.message || 'Could not export PDF.');
    }
  }, [org, title, termLabel, principalLabel, theme, content]);

  const refreshAll = useCallback(async () => {
    try {
      await refetch();
    } catch {
      // ignore
    }
  }, [refetch]);

  useRegisterScreenRefresh(refreshAll);

  const guardMissing = !orgId || !backendUrl;

  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
      <RefreshableScrollView
        style={tw`flex-1`}
        contentContainerStyle={[
          tw`px-4`,
          { paddingTop: insets.top + NAV_SPACER_PX, paddingBottom: bottomPad },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={tw`flex-row items-start justify-between`}>
          <View style={tw`flex-1 pr-3`}>
            <Text style={tw`text-[26px] font-extrabold text-[#0d141c] dark:text-white`}>
              Newsletters
            </Text>
            <Text style={tw`mt-1 text-sm text-[#49739c] dark:text-white/70`}>
              AI templates → edit → branded PDF → send or share.
            </Text>
          </View>

          <View style={tw`items-end`}>
            {flash ? (
              <View style={tw`mb-2 px-3 py-1 rounded-full border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-900/20`}>
                <Text style={tw`text-xs font-bold text-blue-800 dark:text-blue-200`}>{flash}</Text>
              </View>
            ) : null}

            <View style={tw`px-3 py-1 rounded-full bg-blue-100 dark:bg-[#0f1821] border border-blue-200 dark:border-white/10`}>
              <Text style={tw`text-xs font-bold text-blue-700 dark:text-white`}>
                Pro / Enterprise
              </Text>
            </View>
          </View>
        </View>

        {/* Upgrade gate */}
        {!isPro && upgradeCta ? (
          <View style={tw`mt-4 rounded-2xl border border-amber-300 bg-amber-50 dark:border-amber-600/40 dark:bg-[#241a06] p-4`}>
            <Text style={tw`font-extrabold text-amber-900 dark:text-amber-200`}>
              {upgradeCta.headline}
            </Text>
            <Text style={tw`mt-1 text-sm text-amber-900/90 dark:text-amber-200/90`}>
              {upgradeCta.body}
            </Text>
          </View>
        ) : null}

        {/* Library */}
        <View style={tw`mt-4 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-4`}>
          <View style={tw`flex-row items-center justify-between`}>
            <View>
              <Text style={tw`text-base font-extrabold text-[#0d141c] dark:text-white`}>
                Library
              </Text>
              <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>
                Drafts + sent history
              </Text>
            </View>

            <Pressable
              disabled={guardMissing || createMut.isPending}
              onPress={() => {
                const defaultTitle = 'End of Term Newsletter';
                createMut.mutate({ title: defaultTitle, term_label: 'This term' });
              }}
              style={tw`rounded-xl h-10 px-4 items-center justify-center ${
                guardMissing || createMut.isPending ? 'bg-gray-300 dark:bg-gray-700' : 'bg-[#3d99f5]'
              }`}
            >
              <Text style={tw`text-white font-extrabold`}>
                {createMut.isPending ? 'Creating…' : 'New'}
              </Text>
            </Pressable>
          </View>

          <View style={tw`mt-3`}>
            {loadingList ? (
              <Text style={tw`text-sm text-[#49739c] dark:text-white/70`}>Loading…</Text>
            ) : items.length === 0 ? (
              <View style={tw`rounded-2xl border border-dashed border-[#cedbe8] dark:border-white/10 p-4`}>
                <Text style={tw`text-sm text-[#49739c] dark:text-white/70`}>
                  No newsletters yet. Create your first draft.
                </Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={tw`flex-row gap-3`}>
                  {items.map((n) => {
                    const active = String(n.id) === String(selectedId);
                    return (
                      <Pressable
                        key={String(n.id)}
                        onPress={() => setSelectedId(String(n.id))}
                        style={tw`w-[280px] rounded-2xl border p-3 ${
                          active
                            ? 'border-blue-300 bg-blue-50 dark:border-blue-900 dark:bg-blue-900/20'
                            : 'border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0b1620]'
                        }`}
                      >
                        <View style={tw`flex-row items-start justify-between`}>
                          <View style={tw`flex-1 pr-2`}>
                            <Text
                              numberOfLines={1}
                              style={tw`text-sm font-extrabold text-[#0d141c] dark:text-white`}
                            >
                              {n.title}
                            </Text>
                            <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>
                              Updated: {fmtDate(n.updated_at)}
                            </Text>
                          </View>

                          <View style={tw`${statusPillTw(n.status)} px-2 py-1 rounded-full`}>
                            <Text style={tw`text-[11px] font-extrabold ${statusTextTw(n.status)}`}>
                              {n.status}
                            </Text>
                          </View>
                        </View>

                        <Text numberOfLines={3} style={tw`mt-2 text-xs text-[#49739c] dark:text-white/70`}>
                          {stripThemeFromContent(n.content_md || '').slice(0, 140)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </View>

          <Pressable onPress={refreshAll} style={tw`mt-3`}>
            <Text style={tw`text-xs font-extrabold text-[#49739c] dark:text-white/70 underline`}>
              Refresh
            </Text>
          </Pressable>
        </View>

        {/* Editor */}
        <View style={tw`mt-4 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-4`}>
          {!selectedId ? (
            <View style={tw`rounded-2xl border border-dashed border-[#cedbe8] dark:border-white/10 p-4`}>
              <Text style={tw`text-sm text-[#49739c] dark:text-white/70`}>
                Select a newsletter from the Library, or create a new draft.
              </Text>
            </View>
          ) : (
            <>
              {/* Top row actions */}
              <View style={tw`flex-row items-center justify-between`}>
                <View style={tw`flex-row items-center gap-2`}>
                  <View style={tw`${statusPillTw(selected?.status || 'draft')} px-2 py-1 rounded-full`}>
                    <Text style={tw`text-[11px] font-extrabold ${statusTextTw(selected?.status || 'draft')}`}>
                      {selected?.status || 'draft'}
                    </Text>
                  </View>
                  {selected?.sent_at ? (
                    <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>
                      Sent: {fmtDate(selected.sent_at)}
                    </Text>
                  ) : null}
                </View>

                <View style={tw`flex-row gap-2`}>
                  <Pressable
                    onPress={exportPdf}
                    style={tw`rounded-xl h-10 px-3 items-center justify-center bg-[#e7edf4] dark:bg-[#172534]`}
                  >
                    <Text style={tw`text-xs font-extrabold text-[#0d141c] dark:text-white`}>PDF</Text>
                  </Pressable>

                  <Pressable
                    disabled={saveMut.isPending || guardMissing}
                    onPress={() => saveMut.mutate()}
                    style={tw`rounded-xl h-10 px-3 items-center justify-center ${
                      saveMut.isPending || guardMissing ? 'bg-gray-300 dark:bg-gray-700' : 'bg-[#3d99f5]'
                    }`}
                  >
                    <Text style={tw`text-xs font-extrabold text-white`}>
                      {saveMut.isPending ? 'Saving…' : 'Save'}
                    </Text>
                  </Pressable>

                  <Pressable
                    disabled={sendMut.isPending || guardMissing}
                    onPress={() => setSendOpen(true)}
                    style={tw`rounded-xl h-10 px-3 items-center justify-center ${
                      sendMut.isPending || guardMissing ? 'bg-gray-300 dark:bg-gray-700' : 'bg-emerald-600'
                    }`}
                  >
                    <Text style={tw`text-xs font-extrabold text-white`}>
                      {sendMut.isPending ? 'Sending…' : 'Send'}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Fields */}
              <View style={tw`mt-4 gap-3`}>
                <View>
                  <Text style={tw`text-xs font-extrabold text-[#49739c] dark:text-white/70`}>
                    Title
                  </Text>
                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Newsletter title"
                    placeholderTextColor={tw.color('slate-400') || '#94a3b8'}
                    style={tw`mt-1 h-12 rounded-xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0b1620] px-3 text-[#0d141c] dark:text-white`}
                  />
                </View>

                <View>
                  <Text style={tw`text-xs font-extrabold text-[#49739c] dark:text-white/70`}>
                    Term label
                  </Text>
                  <TextInput
                    value={termLabel}
                    onChangeText={setTermLabel}
                    placeholder="e.g. Term 1 (2025)"
                    placeholderTextColor={tw.color('slate-400') || '#94a3b8'}
                    style={tw`mt-1 h-12 rounded-xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0b1620] px-3 text-[#0d141c] dark:text-white`}
                  />
                </View>
              </View>

              {/* AI Generator */}
              <View style={tw`mt-4 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0b1620] p-4`}>
                <View style={tw`flex-row items-start justify-between`}>
                  <View style={tw`flex-1 pr-3`}>
                    <Text style={tw`text-base font-extrabold text-[#0d141c] dark:text-white`}>
                      AI Template Generator
                    </Text>
                    <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>
                      Always structured. Edit afterwards.
                    </Text>
                  </View>

                  <Pressable
                    disabled={genMut.isPending || guardMissing}
                    onPress={() => genMut.mutate()}
                    style={tw`rounded-xl h-10 px-4 items-center justify-center ${
                      genMut.isPending || guardMissing ? 'bg-gray-300 dark:bg-gray-700' : 'bg-slate-900 dark:bg-white'
                    }`}
                  >
                    <Text style={tw`text-xs font-extrabold ${genMut.isPending || guardMissing ? 'text-white' : 'text-white dark:text-slate-900'}`}>
                      {genMut.isPending ? 'Generating…' : 'Generate'}
                    </Text>
                  </Pressable>
                </View>

                {/* Template selection */}
                <View style={tw`mt-3`}>
                  <Text style={tw`text-xs font-extrabold text-[#49739c] dark:text-white/70`}>Template</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={tw`flex-row gap-2 mt-2`}>
                      {TEMPLATE_TYPES.map((t) => {
                        const active = t.key === templateKey;
                        return (
                          <Pressable
                            key={t.key}
                            onPress={() => setTemplateKey(t.key)}
                            style={tw`px-3 py-2 rounded-full border ${
                              active
                                ? 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-900/20'
                                : 'border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821]'
                            }`}
                          >
                            <Text style={tw`text-xs font-extrabold ${
                              active ? 'text-blue-800 dark:text-blue-200' : 'text-[#0d141c] dark:text-white'
                            }`}>
                              {t.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                  <Text style={tw`mt-2 text-[11px] text-[#49739c] dark:text-white/70`}>
                    {TEMPLATE_TYPES.find((t) => t.key === templateKey)?.hint}
                  </Text>
                </View>

                {/* Tone */}
                <View style={tw`mt-3`}>
                  <Text style={tw`text-xs font-extrabold text-[#49739c] dark:text-white/70`}>Tone</Text>
                  <View style={tw`flex-row gap-2 mt-2`}>
                    {(['Warm', 'Formal', 'Energetic'] as Tone[]).map((x) => {
                      const active = x === tone;
                      return (
                        <Pressable
                          key={x}
                          onPress={() => setTone(x)}
                          style={tw`flex-1 rounded-xl h-10 items-center justify-center border ${
                            active
                              ? 'border-slate-900 bg-slate-900 dark:border-white dark:bg-white'
                              : 'border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821]'
                          }`}
                        >
                          <Text style={tw`text-xs font-extrabold ${
                            active ? 'text-white dark:text-slate-900' : 'text-[#0d141c] dark:text-white'
                          }`}>
                            {x}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Toggles */}
                <View style={tw`mt-3 flex-row flex-wrap gap-2`}>
                  {[
                    ['Fees reminder', includeFees, setIncludeFees],
                    ['Upcoming dates', includeDates, setIncludeDates],
                    ['Clubs & sports', includeClubs, setIncludeClubs],
                    ['Awards', includeAwards, setIncludeAwards],
                  ].map(([label, val, setVal]: any) => (
                    <Pressable
                      key={label}
                      onPress={() => setVal(!val)}
                      style={tw`px-3 py-2 rounded-full border ${
                        val
                          ? 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-900/20'
                          : 'border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821]'
                      }`}
                    >
                      <Text style={tw`text-xs font-extrabold ${
                        val ? 'text-blue-800 dark:text-blue-200' : 'text-[#0d141c] dark:text-white'
                      }`}>
                        {val ? '✓ ' : ''}{label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Extra */}
                <View style={tw`mt-3`}>
                  <Text style={tw`text-xs font-extrabold text-[#49739c] dark:text-white/70`}>
                    Extra AI instructions (optional)
                  </Text>
                  <TextInput
                    value={aiExtra}
                    onChangeText={setAiExtra}
                    placeholder="e.g. Mention PTA meeting, include fee deadline, keep it under 1 page..."
                    placeholderTextColor={tw.color('slate-400') || '#94a3b8'}
                    multiline
                    style={tw`mt-2 h-24 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0f1821] px-3 py-3 text-[#0d141c] dark:text-white`}
                  />
                </View>
              </View>

              {/* Theme */}
              <View style={tw`mt-4 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0b1620] p-4`}>
                <Text style={tw`text-base font-extrabold text-[#0d141c] dark:text-white`}>
                  Theme
                </Text>
                <Text style={tw`text-xs text-[#49739c] dark:text-white/70 mt-1`}>
                  Minimal controls (mobile-friendly).
                </Text>

                {/* Header style */}
                <Text style={tw`mt-3 text-xs font-extrabold text-[#49739c] dark:text-white/70`}>
                  Header style
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={tw`flex-row gap-2 mt-2`}>
                    {HEADER_STYLE_OPTIONS.map((x) => {
                      const active = x.k === theme.headerStyle;
                      return (
                        <Pressable
                          key={x.k}
                          onPress={() => setThemeAndSync({ ...theme, headerStyle: x.k })}
                          style={tw`px-3 py-2 rounded-full border ${
                            active
                              ? 'border-slate-900 bg-slate-900 dark:border-white dark:bg-white'
                              : 'border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821]'
                          }`}
                        >
                          <Text style={tw`text-xs font-extrabold ${
                            active ? 'text-white dark:text-slate-900' : 'text-[#0d141c] dark:text-white'
                          }`}>
                            {x.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>

                {/* Size stepper */}
                <View style={tw`mt-3 flex-row items-center justify-between`}>
                  <Text style={tw`text-xs font-extrabold text-[#49739c] dark:text-white/70`}>
                    Base size: {theme.baseFontSize}px
                  </Text>
                  <View style={tw`flex-row gap-2`}>
                    <Pressable
                      onPress={() =>
                        setThemeAndSync({
                          ...theme,
                          baseFontSize: clamp(theme.baseFontSize - 1, 12, 18),
                        })
                      }
                      style={tw`h-9 w-9 rounded-xl items-center justify-center bg-[#e7edf4] dark:bg-[#172534]`}
                    >
                      <Text style={tw`text-lg font-extrabold text-[#0d141c] dark:text-white`}>−</Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        setThemeAndSync({
                          ...theme,
                          baseFontSize: clamp(theme.baseFontSize + 1, 12, 18),
                        })
                      }
                      style={tw`h-9 w-9 rounded-xl items-center justify-center bg-[#e7edf4] dark:bg-[#172534]`}
                    >
                      <Text style={tw`text-lg font-extrabold text-[#0d141c] dark:text-white`}>+</Text>
                    </Pressable>
                  </View>
                </View>

                {/* Accent presets */}
                <Text style={tw`mt-3 text-xs font-extrabold text-[#49739c] dark:text-white/70`}>
                  Accent preset
                </Text>
                <View style={tw`flex-row gap-2 mt-2`}>
                  {ACCENT_PRESETS.map(([label, hex]) => (

                    <Pressable
                      key={label}
                      onPress={() => setThemeAndSync({ ...theme, primaryColor: String(hex) })}
                      style={tw`flex-1 rounded-xl h-10 items-center justify-center border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821]`}
                    >
                      <Text style={tw`text-xs font-extrabold text-[#0d141c] dark:text-white`}>
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Manual hex inputs (simple + reliable on mobile) */}
                <View style={tw`mt-3`}>
                  <Text style={tw`text-xs font-extrabold text-[#49739c] dark:text-white/70`}>
                    Accent hex (optional)
                  </Text>
                  <TextInput
                    value={theme.primaryColor}
                    onChangeText={(v) => {
                      const next = normalizeHex(v);
                      if (!next || hexOk(next)) setThemeAndSync({ ...theme, primaryColor: next || theme.primaryColor });
                    }}
                    placeholder="#2563eb"
                    placeholderTextColor={tw.color('slate-400') || '#94a3b8'}
                    style={tw`mt-2 h-12 rounded-xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0f1821] px-3 text-[#0d141c] dark:text-white`}
                  />
                </View>

                <View style={tw`mt-3`}>
                  <Text style={tw`text-xs font-extrabold text-[#49739c] dark:text-white/70`}>
                    Signature label
                  </Text>
                  <TextInput
                    value={principalLabel}
                    onChangeText={setPrincipalLabel}
                    placeholder="Head teacher / Principal"
                    placeholderTextColor={tw.color('slate-400') || '#94a3b8'}
                    style={tw`mt-2 h-12 rounded-xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0f1821] px-3 text-[#0d141c] dark:text-white`}
                  />
                </View>

                <Pressable
                  onPress={() => {
                    setThemeAndSync(DEFAULT_THEME);
                    setPrincipalLabel('Head teacher / Principal');
                  }}
                  style={tw`mt-3 rounded-xl h-10 items-center justify-center bg-[#e7edf4] dark:bg-[#172534]`}
                >
                  <Text style={tw`text-xs font-extrabold text-[#0d141c] dark:text-white`}>Reset theme</Text>
                </Pressable>
              </View>

              {/* Editor */}
              <View style={tw`mt-4`}>
                <Text style={tw`text-xs font-extrabold text-[#49739c] dark:text-white/70 mb-2`}>
                  Editor (Markdown)
                </Text>
                <TextInput
                  value={stripThemeFromContent(content)}
                  onChangeText={(t) => setContent(upsertThemeIntoContent(t, theme))}
                  multiline
                  placeholder="Write your newsletter…"
                  placeholderTextColor={tw.color('slate-400') || '#94a3b8'}
                  style={tw`min-h-[320px] rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0b1620] px-3 py-3 text-[#0d141c] dark:text-white`}
                />
                <Text style={tw`mt-2 text-[11px] text-[#49739c] dark:text-white/70`}>
                  Tip: use ## headings + bullet lists — it prints beautifully.
                </Text>
              </View>

              {/* Live preview */}
              <View style={tw`mt-4`}>
                <Text style={tw`text-base font-extrabold text-[#0d141c] dark:text-white`}>
                  Live preview
                </Text>
                <Text style={tw`text-xs text-[#49739c] dark:text-white/70 mt-1`}>
                  This matches the PDF layout (native HTML print).
                </Text>

                <View style={tw`mt-3 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0b1620] p-3`}>
                  <NewsletterHeaderNative org={org} title={title} termLabel={termLabel} theme={previewTheme} />
                  <View style={tw`mt-3 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-4`}>
                    <MarkdownPreview md={content} theme={previewTheme} />
                    <View style={tw`h-[1px] bg-[#cedbe8] dark:bg-white/10 my-3`} />
                    <View style={tw`flex-row items-end justify-between`}>
                      <View>
                       <Text style={[tw`font-extrabold`, { color: previewTheme.headingColor }]}>{principalLabel}</Text>
                        <Text style={[tw`text-xs`, { color: previewMuted }]}>{org?.name || ''}</Text>
                      </View>
                      <View style={tw`items-end`}>
                        <View style={tw`h-10 w-40 border-b border-[#cedbe8] dark:border-white/20`} />
                       <Text style={[tw`text-[11px] mt-1`, { color: previewMuted }]}>Signature</Text>
                      </View>
                    </View>
                  </View>
                </View>

                <Pressable
                  onPress={exportPdf}
                  style={tw`mt-3 rounded-xl h-11 items-center justify-center bg-[#3d99f5]`}
                >
                  <Text style={tw`text-white font-extrabold`}>Export PDF</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>

        {/* Send modal */}
        <Modal visible={sendOpen} animationType="slide" transparent>
          <View style={tw`flex-1 bg-black/40`}>
            <View style={tw`mt-auto rounded-t-3xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 p-4`}>
              <View style={tw`flex-row items-start justify-between`}>
                <View style={tw`flex-1 pr-3`}>
                  <Text style={tw`text-[18px] font-extrabold text-[#0d141c] dark:text-white`}>
                    Send newsletter
                  </Text>
                  <Text style={tw`text-xs text-[#49739c] dark:text-white/70 mt-1`}>
                    If SMTP isn’t configured, we still record recipients + status for manual sharing.
                  </Text>
                </View>
                <Pressable onPress={() => setSendOpen(false)} style={tw`px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534]`}>
                  <Text style={tw`text-xs font-extrabold text-[#0d141c] dark:text-white`}>Close</Text>
                </Pressable>
              </View>

              {/* Audience */}
              <Text style={tw`mt-3 text-xs font-extrabold text-[#49739c] dark:text-white/70`}>
                Audience
              </Text>
              <View style={tw`mt-2 flex-row gap-2`}>
                {(['all', 'class', 'custom'] as const).map((m) => {
                  const active = m === sendMode;
                  const label =
                    m === 'all' ? 'All guardians' : m === 'class' ? 'By class' : 'Custom emails';
                  return (
                    <Pressable
                      key={m}
                      onPress={() => {
                        setSendMode(m);
                        setRecipientPreview(null);
                      }}
                      style={tw`flex-1 rounded-xl h-10 items-center justify-center border ${
                        active
                          ? 'border-emerald-700 bg-emerald-700'
                          : 'border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0b1620]'
                      }`}
                    >
                      <Text style={tw`text-xs font-extrabold ${active ? 'text-white' : 'text-[#0d141c] dark:text-white'}`}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {sendMode === 'class' ? (
                <View style={tw`mt-3`}>
                  <Text style={tw`text-xs font-extrabold text-[#49739c] dark:text-white/70`}>
                    Class label
                  </Text>
                  <TextInput
                    value={sendClass}
                    onChangeText={(v) => {
                      setSendClass(v);
                      setRecipientPreview(null);
                    }}
                    placeholder="e.g. Grade 6 A"
                    placeholderTextColor={tw.color('slate-400') || '#94a3b8'}
                    style={tw`mt-2 h-12 rounded-xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0b1620] px-3 text-[#0d141c] dark:text-white`}
                  />
                  {classLabelsQ.data?.items?.length ? (
                    <Text style={tw`mt-2 text-[11px] text-[#49739c] dark:text-white/70`}>
                      Suggestions:{' '}
                      {(classLabelsQ.data?.items ?? [])
                        .slice(0, 6)
                        .map((x: any) => x?.class_label)
                        .filter(Boolean)
                        .join(', ')}
                    </Text>
                  ) : null}

                </View>
              ) : sendMode === 'custom' ? (
                <View style={tw`mt-3`}>
                  <Text style={tw`text-xs font-extrabold text-[#49739c] dark:text-white/70`}>
                    Emails (comma/new line separated)
                  </Text>
                  <TextInput
                    value={customEmails}
                    onChangeText={(v) => {
                      setCustomEmails(v);
                      setRecipientPreview(null);
                    }}
                    multiline
                    placeholder="parent1@example.com, parent2@example.com"
                    placeholderTextColor={tw.color('slate-400') || '#94a3b8'}
                    style={tw`mt-2 h-24 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0b1620] px-3 py-3 text-[#0d141c] dark:text-white`}
                  />
                </View>
              ) : (
                <Text style={tw`mt-3 text-xs text-[#49739c] dark:text-white/70`}>
                  We will use guardian_email values from your learner roster.
                </Text>
              )}

              {/* Actions */}
              <View style={tw`mt-4 flex-row gap-2`}>
                <Pressable
                  onPress={previewRecipients}
                  style={tw`flex-1 rounded-xl h-11 items-center justify-center border border-emerald-200 bg-white dark:bg-[#0b1620] dark:border-emerald-900`}
                >
                  <Text style={tw`text-xs font-extrabold text-emerald-800 dark:text-emerald-200`}>
                    Preview
                  </Text>
                </Pressable>

                <Pressable
                  disabled={sendMut.isPending || guardMissing}
                  onPress={() => sendMut.mutate()}
                  style={tw`flex-1 rounded-xl h-11 items-center justify-center ${
                    sendMut.isPending || guardMissing ? 'bg-gray-300 dark:bg-gray-700' : 'bg-emerald-700'
                  }`}
                >
                  <Text style={tw`text-xs font-extrabold text-white`}>
                    {sendMut.isPending ? 'Sending…' : 'Send now'}
                  </Text>
                </Pressable>
              </View>

              {/* Preview + delivery log */}
              {recipientPreview ? (
                <View style={tw`mt-3 rounded-2xl border border-emerald-200 bg-white dark:bg-[#0b1620] dark:border-emerald-900 p-3`}>
                  <Text style={tw`font-extrabold text-[#0d141c] dark:text-white`}>
                    Recipients preview: {recipientPreview.count}
                  </Text>
                  {recipientPreview.sample?.length ? (
                    <Text style={tw`mt-2 text-xs text-[#49739c] dark:text-white/70`}>
                      Sample: {recipientPreview.sample.join(', ')}
                    </Text>
                  ) : (
                    <Text style={tw`mt-2 text-xs text-[#49739c] dark:text-white/70`}>
                      No sample returned (check class label / admissions / emails).
                    </Text>
                  )}

                  {recipientPreview.learners != null || recipientPreview.emails != null ? (
                    <Text style={tw`mt-2 text-[11px] text-[#49739c] dark:text-white/70`}>
                      In-app learners: {recipientPreview.learners ?? '—'} • Email recipients: {recipientPreview.emails ?? '—'}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {deliveryLog ? (
                <View style={tw`mt-3 rounded-2xl border border-emerald-200 bg-white dark:bg-[#0b1620] dark:border-emerald-900 p-3`}>
                  <View style={tw`flex-row items-center justify-between`}>
                    <Text style={tw`font-extrabold text-[#0d141c] dark:text-white`}>
                      Delivery log
                    </Text>
                    <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>
                      Total: {deliveryLog.summary.total} • Delivered: {deliveryLog.summary.delivered} • Failed: {deliveryLog.summary.failed}
                    </Text>
                  </View>

                  <View style={tw`mt-2 max-h-40`}>
                    <ScrollView>
                      {deliveryLog.items.map((r) => (
                        <View
                          key={r.recipient_email}
                          style={tw`flex-row items-center justify-between rounded-xl border border-[#cedbe8] dark:border-white/10 px-3 py-2 mb-2`}
                        >
                          <Text numberOfLines={1} style={tw`flex-1 pr-2 text-xs text-[#0d141c] dark:text-white`}>
                            {r.recipient_email}
                          </Text>
                          <Text
                            style={tw`text-xs font-extrabold ${
                              r.delivered ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'
                            }`}
                          >
                            {r.delivered ? 'delivered' : r.error || 'failed'}
                          </Text>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                </View>
              ) : null}

              <View style={tw`h-3`} />
            </View>
          </View>
        </Modal>

        <View style={tw`h-10`} />
      </RefreshableScrollView>
    </SafeAreaView>
  );
};

export default OrgNewslettersNativeScreen;
