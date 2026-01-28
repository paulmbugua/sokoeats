// apps/web/src/pages/org/OrgNewsletters.web.tsx
import React, { useEffect, useMemo, useState,useRef } from 'react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { useOrgClassLabels } from '@mytutorapp/shared/hooks/useOrgClassLabels';

import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';
import { useShopContext } from '@mytutorapp/shared/context';
import { useOrgNewsletters } from '@mytutorapp/shared/hooks/useOrgNewsletters';
import SeoHead from '../../components/seo/SeoHead';

import {
  apiCreateOrgNewsletter,
  apiGenerateOrgNewsletterContent,
  apiGetOrgNewsletter,
  apiUpdateOrgNewsletter,
  apiPreviewNewsletterRecipients,
  apiSendOrgNewsletter,
  apiListNewsletterRecipients,
  type OrgNewsletter,
} from '@mytutorapp/shared/api/orgProApi';

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

function fmtDate(s?: string | null) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

function hexToRgbTuple(hex: string): [number, number, number] | null {
  const h = String(hex || '').trim().replace('#', '');
  if (![3, 6].includes(h.length)) return null;

  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n)) return null;

  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return [r, g, b];
}


function statusPill(status: OrgNewsletter['status']) {
  const base =
    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border';
  if (status === 'sent')
    return `${base} border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200`;
  if (status === 'sending')
    return `${base} border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-200`;
  if (status === 'archived')
    return `${base} border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200`;
  return `${base} border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-900/20 dark:text-blue-200`;
}

/* ----------------------------- Theme handling ----------------------------- */

type NewsletterTheme = {
  fontFamily: 'Inter' | 'Georgia' | 'Times New Roman' | 'Arial' | 'Poppins';
  baseFontSize: number; // 12..18
  primaryColor: string; // accent
  headingColor: string;
  textColor: string;

  // 6 styles now (2 existing + 4 new)
  headerStyle: 'band' | 'minimal' | 'split' | 'gradient' | 'card' | 'underline';

  paperBg: string;

  // NEW: header background controls
  headerBg: string;   // used by most header styles
  headerBg2: string;  // used by gradient as the 2nd stop
};

const DEFAULT_THEME: NewsletterTheme = {
  fontFamily: 'Inter',
  baseFontSize: 14,
  primaryColor: '#2563eb',
  headingColor: '#0f172a',
  textColor: '#0f172a',
  headerStyle: 'band',
  paperBg: '#ffffff',

  // NEW defaults
  headerBg: '#f8fafc',  // slate-50 vibe
  headerBg2: '#ffffff', // gradient end
};


/* ----------------------------- Minimal Theme UI ---------------------------- */

const HEADER_STYLE_OPTIONS: Array<{ k: NewsletterTheme['headerStyle']; label: string }> = [
  { k: 'band', label: 'Band' },
  { k: 'minimal', label: 'Minimal' },
  { k: 'split', label: 'Split' },
  { k: 'gradient', label: 'Gradient' },
  { k: 'card', label: 'Card' },
  { k: 'underline', label: 'Underline' },
];

function Swatch({
  label,
  value,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3', disabled && 'opacity-50')}>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-200">
          {label}
        </div>
        {hint ? <div className="text-[11px] text-slate-500">{hint}</div> : null}
      </div>

      <label className="relative inline-flex items-center">
        <span
          className={cn(
            'h-8 w-10 rounded-lg border border-slate-200 shadow-sm dark:border-slate-700',
            disabled && 'cursor-not-allowed',
          )}
          style={{ backgroundColor: value }}
        />
        <input
          type="color"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'absolute inset-0 h-full w-full opacity-0',
            disabled ? 'cursor-not-allowed' : 'cursor-pointer',
          )}
          aria-label={label}
        />
      </label>
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-950">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition',
              active
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'text-slate-600 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ThemePanel({
  theme,
  setTheme,
  principalLabel,
  setPrincipalLabel,
  onReset,
}: {
  theme: NewsletterTheme;
  setTheme: React.Dispatch<React.SetStateAction<NewsletterTheme>>;
  principalLabel: string;
  setPrincipalLabel: (s: string) => void;
  onReset: () => void;
}) {
  const [advancedOpen, setAdvancedOpen] = React.useState(false);

  const preset = (kind: 'neutral' | 'ocean' | 'emerald') => {
    if (kind === 'neutral') {
      setTheme((t) => ({
        ...t,
        primaryColor: '#0f172a',
        headingColor: '#0f172a',
        textColor: '#0f172a',
        paperBg: '#ffffff',
        headerBg: '#f8fafc',
        headerBg2: '#ffffff',
      }));
    }
    if (kind === 'ocean') {
      setTheme((t) => ({
        ...t,
        primaryColor: '#2563eb',
        headingColor: '#0f172a',
        textColor: '#0f172a',
        paperBg: '#ffffff',
        headerBg: '#f8fafc',
        headerBg2: '#ffffff',
      }));
    }
    if (kind === 'emerald') {
      setTheme((t) => ({
        ...t,
        primaryColor: '#059669',
        headingColor: '#0f172a',
        textColor: '#0f172a',
        paperBg: '#ffffff',
        headerBg: '#f0fdf4',
        headerBg2: '#ffffff',
      }));
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/60">
      {/* header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Theme</div>
          <div className="text-[11px] text-slate-500">Minimal controls. Advanced is optional.</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
          >
            {advancedOpen ? 'Hide' : 'Advanced'}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
          >
            Reset
          </button>
        </div>
      </div>

      {/* compact section */}
      <div className="mt-4 space-y-4">
        {/* header style segmented */}
        <div>
          <div className="mb-2 text-[11px] font-semibold text-slate-600 dark:text-slate-200">
            Header style
          </div>
          <Segmented
            value={theme.headerStyle}
            onChange={(v) => setTheme((t) => ({ ...t, headerStyle: v as any }))}
            options={HEADER_STYLE_OPTIONS.map((x) => ({ value: x.k, label: x.label }))}
          />
        </div>

        {/* font + size */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-7">
            <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-200">
              Font
            </div>
            <select
              value={theme.fontFamily}
              onChange={(e) => setTheme((t) => ({ ...t, fontFamily: e.target.value as any }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
            >
              <option>Inter</option>
              <option>Poppins</option>
              <option>Arial</option>
              <option>Georgia</option>
              <option>Times New Roman</option>
            </select>
          </div>

          <div className="col-span-5">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-200">
                Size
              </div>
              <div className="text-[11px] text-slate-500">{theme.baseFontSize}px</div>
            </div>
            <input
              type="range"
              min={12}
              max={18}
              value={theme.baseFontSize}
              onChange={(e) => setTheme((t) => ({ ...t, baseFontSize: Number(e.target.value) }))}
              className="mt-2 w-full"
            />
          </div>
        </div>

        {/* simple brand row */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12">
            <Swatch
              label="Accent"
              value={theme.primaryColor}
              onChange={(hex) => setTheme((t) => ({ ...t, primaryColor: hex }))}
              hint="Used for highlights and chips."
            />
          </div>

          <div className="col-span-12">
           <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-200">
                Presets
              </span>
              {[
                ['neutral', 'Neutral'],
                ['ocean', 'Ocean'],
                ['emerald', 'Emerald'],
              ].map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => preset(k as any)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* advanced drawer */}
        {advancedOpen ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
            <div className="grid gap-3">
              <Swatch
                label="Heading"
                value={theme.headingColor}
                onChange={(hex) => setTheme((t) => ({ ...t, headingColor: hex }))}
              />
              <Swatch
                label="Text"
                value={theme.textColor}
                onChange={(hex) => setTheme((t) => ({ ...t, textColor: hex }))}
              />
              <Swatch
                label="Paper"
                value={theme.paperBg}
                onChange={(hex) => setTheme((t) => ({ ...t, paperBg: hex }))}
                hint="Affects preview + print."
              />
              <Swatch
                label="Header background"
                value={theme.headerBg}
                onChange={(hex) => setTheme((t) => ({ ...t, headerBg: hex }))}
                hint="Used by most header styles."
              />
              <Swatch
                label="Gradient end"
                value={theme.headerBg2}
                onChange={(hex) => setTheme((t) => ({ ...t, headerBg2: hex }))}
                disabled={theme.headerStyle !== 'gradient'}
                hint={theme.headerStyle === 'gradient' ? 'Only used for Gradient style.' : 'Switch to Gradient to edit.'}
              />

              <div>
                <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-200">
                  Signature label
                </div>
                <input
                  value={principalLabel}
                  onChange={(e) => setPrincipalLabel(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
                  placeholder="Head teacher / Principal"
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function parseThemeFromContent(md: string): NewsletterTheme | null {
  const m = md.match(/<!--THEME\s+(\{[\s\S]*?\})\s*-->/i);
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

function stripThemeFromContent(md: string) {
  return md.replace(/^\s*<!--THEME[\s\S]*?-->\s*/i, '');
}

function upsertThemeIntoContent(md: string, theme: NewsletterTheme) {
  const clean = stripThemeFromContent(md || '');
  return `<!--THEME ${JSON.stringify(theme)} -->\n\n${clean}`.trim();
}

/* ----------------------------- AI template UX ----------------------------- */

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
  bits.push(`- Do NOT include letterhead/contact/signature in the markdown (we render those in the PDF header/footer).`);
  bits.push(`- Keep it professional and school-appropriate.`);
  bits.push(`Content toggles:`);
  bits.push(`- Include fees reminder: ${opts.includeFees ? 'YES' : 'NO'}`);
  bits.push(`- Include upcoming dates section with placeholders: ${opts.includeDates ? 'YES' : 'NO'}`);
  bits.push(`- Mention clubs/sports: ${opts.includeClubs ? 'YES' : 'NO'}`);
  bits.push(`- Mention awards/celebrations: ${opts.includeAwards ? 'YES' : 'NO'}`);
  if (opts.extra?.trim()) bits.push(`Extra instructions: ${opts.extra.trim()}`);
  return bits.join('\n');
}

/* ----------------------------- Print-ready doc ---------------------------- */

function NewsletterDoc({
  org,
  title,
  termLabel,
  theme,
  contentMd,
  signatureLabel,
}: {
  org: any;
  title: string;
  termLabel: string;
  theme: NewsletterTheme;
  contentMd: string;
  signatureLabel: string;
}) {
  const logoUrl = org?.logo_url || null;
  const signatureUrl = org?.signature_url || null; // principal/headteacher signature

  const contactLine = [
    org?.address_line1,
    org?.address_line2,
  ]
    .filter(Boolean)
    .join(' • ');

  const contactLine2 = [
    org?.phone_number && `Tel: ${org.phone_number}`,
    org?.contact_email && `Email: ${org.contact_email}`,
    org?.website_url && `Website: ${org.website_url}`,
  ]
    .filter(Boolean)
    .join(' • ');

  // CSS vars so user choices affect both preview and print
  const primaryRgb = hexToRgbTuple(theme.primaryColor) || [37, 99, 235]; // fallback

const vars = {
  ['--nl-primary' as any]: theme.primaryColor,
  ['--nl-primary-rgb' as any]: `${primaryRgb[0]},${primaryRgb[1]},${primaryRgb[2]}`,
  ['--nl-heading' as any]: theme.headingColor,
  ['--nl-text' as any]: theme.textColor,
  ['--nl-font' as any]: theme.fontFamily,
  ['--nl-size' as any]: `${theme.baseFontSize}px`,
  ['--nl-paper' as any]: theme.paperBg || '#ffffff',

  // NEW
  ['--nl-header-bg' as any]: theme.headerBg || '#f8fafc',
  ['--nl-header-bg2' as any]: theme.headerBg2 || '#ffffff',
};

function HeaderInner({ hideRightMeta }: { hideRightMeta?: boolean }) {
  return (
    <div className="flex items-center gap-4">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt="logo"
          className="h-12 w-12 rounded-lg object-contain bg-white"
        />
      ) : (
        <div className="h-12 w-12 rounded-lg bg-slate-100" />
      )}

      <div className="flex-1">
        <div className="nl-heading text-lg font-bold leading-tight">
          {org?.name || 'School'}
        </div>
        <div className="text-xs text-slate-600">{contactLine || ''}</div>
        <div className="text-xs text-slate-600">{contactLine2 || ''}</div>
      </div>

      {!hideRightMeta ? (
        <div className="text-right">
          <div className="nl-accent text-xs font-semibold uppercase tracking-wide">Newsletter</div>
          <div className="text-xs text-slate-600">{termLabel || ''}</div>
          <div className="text-xs text-slate-600">{new Date().toLocaleDateString()}</div>
        </div>
      ) : null}
    </div>
  );
}



  return (
    <div style={vars as any} className="w-full">
      <style>{`
  .nl-page {
    font-family: var(--nl-font);
    font-size: var(--nl-size);
    color: var(--nl-text);
    background: var(--nl-paper);
  }
  .print-shell { background: var(--nl-paper); }

  .nl-heading { color: var(--nl-heading); }
  .nl-accent { color: var(--nl-primary); }

  .nl-band {
  background:
    linear-gradient(0deg, rgba(var(--nl-primary-rgb), 0.12), rgba(var(--nl-primary-rgb), 0.12)),
    var(--nl-header-bg);
  border-bottom: 1px solid rgba(var(--nl-primary-rgb), 0.25);
}


  .nl-header-bg {
    background: var(--nl-header-bg);
    border-bottom: 1px solid rgba(100,116,139,0.18);
  }

 .nl-header-gradient {
  background:
    radial-gradient(900px circle at 0% 0%, rgba(var(--nl-primary-rgb), 0.18), transparent 45%),
    linear-gradient(135deg, var(--nl-header-bg), var(--nl-header-bg2));
  border-bottom: 1px solid rgba(var(--nl-primary-rgb), 0.18);
}


  .nl-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 9999px;
    font-size: 11px;
    font-weight: 700;
    border: 1px solid rgba(var(--nl-primary-rgb), 0.18);
    background: rgba(var(--nl-primary-rgb), 0.10);
    color: var(--nl-heading);
  }

  .nl-accent-rule {
    height: 3px;
    border-radius: 9999px;
    background: linear-gradient(
      90deg,
      var(--nl-primary),
      rgba(var(--nl-primary-rgb), 0.35)
    );
  }

  .nl-card-wrap {
    background: var(--nl-header-bg);
    border-bottom: 1px solid rgba(100,116,139,0.18);
  }
  .nl-card {
    background: rgba(255,255,255,0.9);
    border: 1px solid rgba(100,116,139,0.18);
    border-radius: 18px;
    box-shadow: 0 10px 30px rgba(15,23,42,0.08);
    backdrop-filter: blur(10px);
  }

  .nl-prose h1, .nl-prose h2, .nl-prose h3 { color: var(--nl-heading); }
  .nl-prose h2 { margin-top: 1.1rem; font-weight: 700; font-size: 1.05em; }
  .nl-prose p { margin: 0.55rem 0; line-height: 1.55; }
  .nl-prose ul { margin: 0.4rem 0 0.7rem 1.1rem; list-style: disc; }
  .nl-prose li { margin: 0.15rem 0; }
  .nl-hr { border: 0; border-top: 1px solid rgba(100,116,139,0.25); margin: 0.9rem 0; }

  @media print {
    html, body { background: #ffffff !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
    .print-shell { border: none !important; box-shadow: none !important; border-radius: 0 !important; background: var(--nl-paper) !important; }
    @page { margin: 14mm; }
  }
`}</style>


     <div className="nl-page print-shell rounded-xl border border-slate-200 shadow-sm">


        {/* Letterhead */}
{theme.headerStyle === 'band' ? (
  <div className={cn('px-6 py-5', 'nl-band')}>
    <HeaderInner />
    <div className="mt-4">
      <div className="nl-heading text-2xl font-semibold">{title || 'End-of-term Newsletter'}</div>
    </div>
  </div>
) : theme.headerStyle === 'minimal' ? (
  <div className="px-6 py-5 nl-header-bg">

    <HeaderInner />
    <div className="mt-4">
      <div className="nl-heading text-2xl font-semibold">{title || 'End-of-term Newsletter'}</div>
    </div>
  </div>
) : theme.headerStyle === 'split' ? (
  <div className={cn('px-6 py-5 nl-header-bg')}>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch sm:justify-between">
      <div className="min-w-0">
        <HeaderInner hideRightMeta />
      </div>

      <div
        className="rounded-2xl p-4 sm:min-w-[260px]"
        style={{
          background: `rgba(var(--nl-primary-rgb), 0.12)`,
          border: `1px solid rgba(var(--nl-primary-rgb), 0.18)`,
        }}
      >
        <div className="text-[11px] font-extrabold uppercase tracking-widest nl-accent">
          Newsletter
        </div>
        <div className="mt-1 text-xs text-slate-600">{termLabel || ''}</div>
        <div className="text-xs text-slate-600">{new Date().toLocaleDateString()}</div>
        <div className="mt-3 nl-heading text-xl font-semibold leading-snug">
          {title || 'End-of-term Newsletter'}
        </div>
      </div>
    </div>
  </div>
) : theme.headerStyle === 'gradient' ? (
  <div className={cn('px-6 py-5 nl-header-gradient')}>
    <div className="flex items-start justify-between gap-4">
      <HeaderInner hideRightMeta />
      <span className="nl-chip">
        <span className="uppercase tracking-widest">Newsletter</span>
        <span className="opacity-70">•</span>
        <span className="opacity-80">{termLabel || 'This term'}</span>
      </span>
    </div>

    <div className="mt-4">
      <div className="nl-heading text-2xl font-semibold">{title || 'End-of-term Newsletter'}</div>
      <div className="mt-2 max-w-2xl text-xs text-slate-600">
        {new Date().toLocaleDateString()}
      </div>
    </div>
  </div>
) : theme.headerStyle === 'card' ? (
  <div className={cn('px-6 py-6 nl-card-wrap')}>
    <div className="nl-card px-5 py-5">
      <div className="flex items-center justify-between gap-4">
        <HeaderInner hideRightMeta />
        <span className="nl-chip">
          <span className="uppercase tracking-widest">Newsletter</span>
          <span className="opacity-70">•</span>
          <span className="opacity-80">{new Date().toLocaleDateString()}</span>
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div className="nl-heading text-2xl font-semibold">{title || 'End-of-term Newsletter'}</div>
        <div className="text-xs text-slate-600">{termLabel || ''}</div>
      </div>

      <div className="mt-3 nl-accent-rule" />
    </div>
  </div>
) : (
  /* underline */
  <div className={cn('px-6 py-5 nl-header-bg')}>
    <div className="flex items-start justify-between gap-4">
      <HeaderInner />
    </div>
    <div className="mt-4">
      <div className="nl-heading text-2xl font-semibold">{title || 'End-of-term Newsletter'}</div>
      <div className="mt-2 nl-accent-rule" />
    </div>
  </div>
)}

        {/* Body */}
        <div className="px-6 py-6">
          <div className="nl-prose">
            <ReactMarkdown>{stripThemeFromContent(contentMd || '')}</ReactMarkdown>
          </div>

          <hr className="nl-hr" />

          {/* Signature footer */}
          <div className="mt-4 flex items-end justify-between gap-6">
            <div className="text-sm text-slate-700">
              <div className="font-semibold nl-heading">{signatureLabel}</div>
              <div className="text-xs text-slate-500">
                {org?.name ? `${org.name}` : ''}
              </div>
            </div>

            <div className="text-right">
              {signatureUrl ? (
                <img
                  src={signatureUrl}
                  alt="signature"
                  className="h-12 max-w-[220px] object-contain"
                />
              ) : (
                <div className="h-12 w-[220px] border-b border-slate-300" />
              )}
              <div className="mt-1 text-xs text-slate-500">Signature</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const OrgNewslettersPage: React.FC = () => {
  const location = useLocation();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();


  const shop = (useShopContext?.() ?? {}) as any;
  const backendUrl: string = shop?.backendUrl || shop?.apiUrl || '';
  const orgToken: string | undefined = shop?.orgToken;

  const { isPro, upgradeCta, org } = useOrgProTools();
  const orgId = org?.id as string | undefined;

  const selectedId = sp.get('id') || '';
  const isPrint = sp.get('print') === '1';

  const { data: listData, isLoading: loadingList, refetch } = useOrgNewsletters(orgId);

  const items = useMemo<OrgNewsletter[]>(
    () => (listData?.items || []) as OrgNewsletter[],
    [listData],
  );

  const selected = useMemo<OrgNewsletter | null>(
    () => items.find((x: OrgNewsletter) => x.id === selectedId) || null,
    [items, selectedId],
  );

  // editor state
  const [title, setTitle] = useState('');
  const [termLabel, setTermLabel] = useState('');
  const [content, setContent] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

  // theme state
  const [theme, setTheme] = useState<NewsletterTheme>(DEFAULT_THEME);
  const [principalLabel, setPrincipalLabel] = useState('Head teacher / Principal');

  // AI template controls
  const [templateKey, setTemplateKey] = useState<(typeof TEMPLATE_TYPES)[number]['key']>('wrapup');
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
  const [recipientPreview, setRecipientPreview] = useState<null | {
  count: number;
  sample: string[];
  learners?: number;
  learner_sample?: string[];
  emails?: number;
  email_sample?: string[];
}>(null);


   const classLabelsQ = useOrgClassLabels(orgId, Boolean(sendOpen && sendMode === 'class'));

  const [deliveryLog, setDeliveryLog] = useState<null | {
    summary: { total: number; delivered: number; failed: number };
    items: Array<{ recipient_email: string; delivered: boolean; error?: string | null }>;
  }>(null);

  const printRef = useRef<HTMLDivElement | null>(null);
  const didAutoPrintRef = useRef(false);
const origTitleRef = useRef<string>(document.title);


const downloadPdf = async () => {
  if (!printRef.current) return;

  // Option B: add exporting class on BODY so `.nl-exporting .print-shell` matches
  document.body.classList.add('nl-exporting');

  const safeName = (title || 'newsletter')
    .trim()
    .replace(/[^\w\d-_]+/g, '_')
    .slice(0, 60);

  try {
    const { default: html2pdf } = await import('html2pdf.js');

    await html2pdf()
      .set({
        margin: 10,
        filename: `${safeName}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: theme.paperBg || '#ffffff',
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(printRef.current)
      .save();
  } finally {
    document.body.classList.remove('nl-exporting');
  }
};
// inside OrgNewslettersPage component (near downloadPdf)

async function buildPdfBase64FromRef(el: HTMLElement, fileName: string) {
  const { default: html2pdf } = await import('html2pdf.js');

  document.body.classList.add('nl-exporting');
  try {
    const worker = (html2pdf() as any)
      .set({
        margin: 10,
        filename: fileName,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: theme.paperBg || '#ffffff',
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(el);

    // returns "data:application/pdf;base64,...."
    const dataUri = await (worker as any).outputPdf('datauristring');
    return String(dataUri).split(',')[1] || '';
  } finally {
    document.body.classList.remove('nl-exporting');
  }
}


  // load selected into editor
  useEffect(() => {
    if (!selected) return;

    const md = selected.content_md || '';
    setTitle(selected.title || '');
    setTermLabel(selected.term_label || '');
    setContent(md);

    const parsedTheme = parseThemeFromContent(md);
    if (parsedTheme) setTheme(parsedTheme);

    setRecipientPreview(null);
    setDeliveryLog(null);
  }, [selectedId, selected]);

  useEffect(() => {
  if (!isPrint) return;

  const orgName = org?.name || 'School';
  document.title = `${orgName} — Newsletter`;

  return () => {
    document.title = origTitleRef.current;
  };
}, [isPrint, org?.name]);


  // Print mode: fetch by id (even if list not loaded) and auto-print
  useEffect(() => {
    if (!isPrint || !orgId || !selectedId) return;
    if (!backendUrl) return;

    let cancelled = false;

    (async () => {
      try {
        const n = await apiGetOrgNewsletter(backendUrl, orgId, selectedId, orgToken);
        if (cancelled) return;

        setTitle(n.title || '');
        setTermLabel(n.term_label || '');
        setContent(n.content_md || '');

        const parsedTheme = parseThemeFromContent(n.content_md || '');
        if (parsedTheme) setTheme(parsedTheme);

       
      } catch {
        // ignore
      }
    })();

    return () => { cancelled = true; };
  }, [isPrint, orgId, selectedId, backendUrl, orgToken]);

  useEffect(() => {
  if (!isPrint) return;
  if (didAutoPrintRef.current) return;

  // wait until org name and content exist so the browser header uses org name
  const orgName = org?.name;
  if (!orgName) return;
  if (!title && !content) return;

  didAutoPrintRef.current = true;
  document.title = `${orgName} — Newsletter`;
  setTimeout(() => window.print(), 250);
}, [isPrint, org?.name, title, content]);


  const createMut = useMutation({
    mutationFn: async (payload: { title: string; term_label?: string }) => {
      if (!backendUrl || !orgId) throw new Error('Missing backendUrl/orgId');
      return apiCreateOrgNewsletter(backendUrl, String(orgId), payload, orgToken);
    },
    onSuccess: async (n) => {
      await qc.invalidateQueries({ queryKey: ['org-newsletters', orgId] });
      setSp((prev) => {
        prev.set('id', n.id);
        prev.delete('print');
        return prev;
      });
      setFlash('Draft created ✨');
      setTimeout(() => setFlash(null), 1500);
    },
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
        orgToken,
      );
    },
   onSuccess: (d) => {
      if (d?.titleSuggestion && (!title || title.trim().length < 3)) {
        setTitle(d.titleSuggestion);
      }
      const nextMd = upsertThemeIntoContent(d.content_md || '', theme);
      setContent(nextMd);
    }

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
        orgToken,
      );
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-newsletters', orgId] });
      setFlash('Saved ✅');
      setTimeout(() => setFlash(null), 1200);
    },
  });

  const previewRecipients = async () => {
  if (!backendUrl || !orgId || !selectedId) return;

  const recipients =
    sendMode === 'custom'
      ? customEmails.split(/[,\n]/g).map((x) => x.trim()).filter(Boolean)
      : [];

  const p = await apiPreviewNewsletterRecipients(
    backendUrl,
    String(orgId),
    String(selectedId),
    {
      channel: 'in_app', // or 'both' / 'email'
      mode: sendMode,
      class_label: sendMode === 'class' ? sendClass.trim() : undefined,
      recipients,
    },
    orgToken,
  );

  setRecipientPreview(p);
};


  const sendMut = useMutation({
  mutationFn: async () => {
    if (!backendUrl || !orgId || !selectedId) throw new Error('Missing inputs');

    const recipients =
      sendMode === 'custom'
        ? customEmails.split(/[,\n]/g).map((x) => x.trim()).filter(Boolean)
        : [];

    // Build PDF base64 from the same preview DOM (NewsletterDoc)
    const pdf_base64 =
      printRef.current
        ? await buildPdfBase64FromRef(
            printRef.current,
            `${(title || 'newsletter').trim().replace(/[^\w\d-_]+/g, '_').slice(0, 60)}.pdf`,
          )
        : null;

    return apiSendOrgNewsletter(
      backendUrl,
      String(orgId),
      String(selectedId),
      {
        channel: 'both',
        mode: sendMode,
        class_label: sendMode === 'class' ? sendClass.trim() : undefined,
        recipients,
        pdf_base64, // ✅ send to backend
      },
      orgToken,
    );
  

    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-newsletters', orgId] });

      if (!backendUrl || !orgId || !selectedId) return;
      const log = await apiListNewsletterRecipients(backendUrl, String(orgId), String(selectedId), orgToken);

      setDeliveryLog({
        summary: log.summary,
        items: log.items.slice(0, 50).map((x: any) => ({
          recipient_email: x.recipient_email,
          delivered: x.delivered,
          error: x.error,
        })),
      });

      setFlash('Sent (or recorded) 🚀');
      setTimeout(() => setFlash(null), 1600);
    },
  });

  const openPrint = () => {
    if (!selectedId) return;
    const u = `${window.location.pathname}?id=${encodeURIComponent(selectedId)}&print=1`;
    window.open(u, '_blank', 'noopener,noreferrer');
  };

  // PRINT VIEW
  if (isPrint) {
  return (
    <div className="print-root">
      <SeoHead
        title="Newsletters Print | DayBreak"
        description="Print view for institution newsletters."
        canonicalPath={location.pathname}
        noindex
      />
      <style>{`
        @media print {
          html, body { background: #fff !important; }
          body * { visibility: hidden !important; }

          .nl-print-area, .nl-print-area * { visibility: visible !important; }
          .nl-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
          }

          .print-shell { box-shadow: none !important; border: none !important; border-radius: 0 !important; }
          @page { margin: 14mm; }
        }
      `}</style>

      <div className="nl-print-area">
        <NewsletterDoc
          org={org}
          title={title}
          termLabel={termLabel}
          theme={theme}
          contentMd={content}
          signatureLabel={principalLabel}
        />
      </div>
    </div>
  );
}


  return (
   <div className="mx-auto max-w-7xl space-y-4 px-3 sm:px-4 py-5 sm:py-8">
        <SeoHead
          title="Newsletters | DayBreak"
          description="Create and send newsletters for your institution."
          canonicalPath={location.pathname}
          noindex
        />

        <style>{`
      /* used by html2pdf export */
      .nl-exporting .print-shell {
        box-shadow: none !important;
        border: none !important;
        border-radius: 0 !important;
      }

      @media print {
        html, body { background: #fff !important; }
        body * { visibility: hidden !important; }

        .nl-print-area, .nl-print-area * { visibility: visible !important; }
        .nl-print-area {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
        }

        .print-shell {
          box-shadow: none !important;
          border: none !important;
          border-radius: 0 !important;
        }

        @page { margin: 14mm; }
      }
    `}</style>

      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">

        <div>
          <p className="text-sm uppercase tracking-wide text-blue-500">Org tools</p>
          <h1 className="text-2xl font-semibold">End-of-term newsletters</h1>
          <p className="text-sm text-slate-500 dark:text-slate-300">
            AI templates → edit → branded PDF (letterhead + signature) → send or print.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 justify-start lg:justify-end">

          {flash ? (
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800 dark:border-blue-900 dark:bg-blue-900/20 dark:text-blue-200">
              {flash}
            </span>
          ) : null}
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-slate-800 dark:text-slate-200">
            Pro / Enterprise
          </span>
        </div>
      </div>

      {!isPro && upgradeCta ? (
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-900/20">
          <div className="font-semibold">{upgradeCta.headline}</div>
          <p className="text-sm">{upgradeCta.body}</p>
          <Link className="text-blue-600 underline" to="/org/profile">
            Upgrade billing
          </Link>
        </div>
      ) : (
       <div className="grid gap-3 lg:gap-4 lg:grid-cols-12">

          {/* LEFT: Library */}
          <div className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-3">

            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">Library</div>
                <div className="text-xs text-slate-500">Drafts + sent history</div>
              </div>
              <button
                className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                onClick={() => {
                  const defaultTitle = `End of Term Newsletter`;
                  createMut.mutate({ title: defaultTitle, term_label: 'This term' });
                }}
                disabled={!orgId || !backendUrl || createMut.isPending}
              >
                {createMut.isPending ? 'Creating…' : 'New'}
              </button>
            </div>

            <div className="max-h-[38vh] sm:max-h-[45vh] lg:max-h-[calc(100vh-14rem)] space-y-2 overflow-auto pr-1">

              {loadingList ? (
                <div className="text-sm text-slate-500">Loading…</div>
              ) : items.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-3 text-sm text-slate-500 dark:border-slate-700">
                  No newsletters yet. Create your first draft.
                </div>
              ) : (
                items.map((n: OrgNewsletter) => (
                  <button
                    key={n.id}
                    onClick={() =>
                      setSp((prev) => (prev.set('id', n.id), prev.delete('print'), prev))
                    }
                    className={cn(
                      'w-full rounded-lg border p-3 text-left transition',
                      selectedId === n.id
                        ? 'border-blue-300 bg-blue-50 dark:border-blue-900 dark:bg-blue-900/20'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="line-clamp-1 text-sm font-semibold">{n.title}</div>
                        <div className="text-xs text-slate-500">
                          Updated: {fmtDate(n.updated_at)}
                        </div>
                      </div>
                      <span className={statusPill(n.status)}>{n.status}</span>
                    </div>
                    <div className="mt-2 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
                      {(n.content_md || '').replace(/<!--THEME[\s\S]*?-->/i, '').slice(0, 120)}
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                className="text-xs font-semibold text-slate-600 underline dark:text-slate-300"
                onClick={() => refetch()}
              >
                Refresh
              </button>
              <div className="text-[11px] text-slate-500">{org?.name ? `Org: ${org.name}` : ''}</div>
            </div>
          </div>

          {/* MIDDLE: Editor + AI */}
          <div className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-5">

            {!selectedId ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-6 text-sm text-slate-500 dark:border-slate-700">
                Select a newsletter on the left, or create a new draft.
              </div>
            ) : (
              <>
                {/* Top actions */}
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">

                  <div className="flex items-center gap-2">
                    <span className={statusPill(selected?.status || 'draft')}>
                      {selected?.status || 'draft'}
                    </span>
                    {selected?.sent_at ? (
                      <span className="text-xs text-slate-500">
                        Sent: {fmtDate(selected.sent_at)}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="rounded border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      onClick={openPrint}
                    >
                      Print / PDF
                    </button>
                    <button
                    className="w-full sm:w-auto rounded border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    onClick={downloadPdf}
                  >
                    Download PDF
                  </button>


                    <button
                      className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      onClick={() => saveMut.mutate()}
                      disabled={!backendUrl || saveMut.isPending}
                    >
                      {saveMut.isPending ? 'Saving…' : 'Save'}
                    </button>

                    <button
                      className="rounded bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      onClick={() => setSendOpen(true)}
                      disabled={!backendUrl || sendMut.isPending}
                    >
                      {sendMut.isPending ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                </div>

                {/* Fields */}
                <div className="grid gap-3 sm:grid-cols-12">
                  <div className="sm:col-span-7">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-200">
                      Title
                    </label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                      placeholder="Newsletter title"
                    />
                  </div>
                  <div className="sm:col-span-5">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-200">
                      Term label
                    </label>
                    <input
                      value={termLabel}
                      onChange={(e) => setTermLabel(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                      placeholder="e.g. Term 1 (2025)"
                    />
                  </div>
                </div>

                {/* AI generator */}
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">AI Template Generator</div>
                      <div className="text-xs text-slate-500">
                        Always structured. You can edit after generation.
                      </div>
                    </div>
                    <button
                      className="rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-slate-900"
                      onClick={() => genMut.mutate()}
                      disabled={!backendUrl || genMut.isPending}
                    >
                      {genMut.isPending ? 'Generating…' : 'Generate'}
                    </button>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-12">
                    <div className="sm:col-span-6">
                      <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">
                        Template
                      </div>
                      <select
                        value={templateKey}
                        onChange={(e) => setTemplateKey(e.target.value as any)}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                      >
                        {TEMPLATE_TYPES.map((t) => (
                          <option key={t.key} value={t.key}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {TEMPLATE_TYPES.find((t) => t.key === templateKey)?.hint}
                      </div>
                    </div>

                    <div className="sm:col-span-6">
                      <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">
                        Tone
                      </div>
                      <select
                        value={tone}
                        onChange={(e) => setTone(e.target.value as any)}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                      >
                        <option>Warm</option>
                        <option>Formal</option>
                        <option>Energetic</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      ['Fees reminder', includeFees, setIncludeFees],
                      ['Upcoming dates', includeDates, setIncludeDates],
                      ['Clubs & sports', includeClubs, setIncludeClubs],
                      ['Awards', includeAwards, setIncludeAwards],
                    ].map(([label, val, setVal]: any) => (
                      <button
                        key={label}
                        onClick={() => setVal(!val)}
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs font-semibold',
                          val
                            ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-900/20 dark:text-blue-200'
                            : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200',
                        )}
                        type="button"
                      >
                        {val ? '✓ ' : ''}{label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-3">
                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">
                      Extra AI instructions (optional)
                    </div>
                    <textarea
                      value={aiExtra}
                      onChange={(e) => setAiExtra(e.target.value)}
                     className="mt-1 h-[90px] sm:h-[80px] w-full resize-none rounded-lg border border-slate-200 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-950"

                      placeholder='e.g. Mention PTA meeting, include fee deadline, keep it under 1 page...'
                    />
                  </div>
                </div>

                {/* Editor */}
                <div>
                  <div className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-200">
                    Editor (Markdown)
                  </div>
                  <textarea
                    value={stripThemeFromContent(content)}
                    onChange={(e) => setContent(upsertThemeIntoContent(e.target.value, theme))}
                    className="h-[38vh] min-h-[260px] sm:h-[420px] w-full resize-none rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-950"

                  />
                  <div className="mt-2 text-[11px] text-slate-500">
                    Tip: headings (##) + bullets print beautifully.
                  </div>
                </div>

                {/* Send drawer */}
                {sendOpen ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-900/20">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                          Send newsletter
                        </div>
                        <div className="text-xs text-emerald-900/70 dark:text-emerald-200/70">
                          If SMTP isn’t configured, we still record recipients + status for manual sharing.
                        </div>
                      </div>
                      <button
                        onClick={() => setSendOpen(false)}
                        className="text-xs font-semibold text-emerald-900 underline dark:text-emerald-200"
                      >
                        Close
                      </button>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-12">
                      <div className="sm:col-span-4">
                        <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                          Audience
                        </div>
                        <select
                          value={sendMode}
                          onChange={(e) => {
                            setSendMode(e.target.value as any);
                            setRecipientPreview(null);
                          }}
                          className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm dark:border-emerald-900 dark:bg-slate-950"
                        >
                          <option value="all">All guardians</option>
                          <option value="class">By class</option>
                          <option value="custom">Custom emails</option>
                        </select>
                      </div>

                      <div className="sm:col-span-8">
                        {sendMode === 'class' ? (
                          <>
                            <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                              Class label
                            </div>
                           <input
                            list="org-class-labels"
                            value={sendClass}
                            onChange={(e) => {
                              setSendClass(e.target.value);
                              setRecipientPreview(null);
                            }}
                            className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm dark:border-emerald-900 dark:bg-slate-950"
                            placeholder="e.g. Grade 6 A"
                          />

                          <datalist id="org-class-labels">
                            {(classLabelsQ.data?.items || []).map((x) => (
                              <option key={x.class_label} value={x.class_label} />
                            ))}
                          </datalist>

                          {classLabelsQ.data?.items?.length ? (
                            <div className="mt-1 text-[11px] text-emerald-900/70 dark:text-emerald-200/70">
                              Suggestions loaded ({classLabelsQ.data.items.length})
                            </div>
                          ) : null}

                          </>
                        ) : sendMode === 'custom' ? (
                          <>
                            <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                              Emails (comma or new line separated)
                            </div>
                            <textarea
                              value={customEmails}
                              onChange={(e) => {
                                setCustomEmails(e.target.value);
                                setRecipientPreview(null);
                              }}
                              className="mt-1 h-[90px] w-full resize-none rounded-lg border border-emerald-200 bg-white p-2 text-sm dark:border-emerald-900 dark:bg-slate-950"
                              placeholder="parent1@example.com, parent2@example.com"
                            />
                          </>
                        ) : (
                          <div className="mt-6 text-xs text-emerald-900/70 dark:text-emerald-200/70">
                            We will use guardian_email values from your learner roster.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap sm:items-center">

                      <button
                        className="rounded border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-slate-950 dark:text-emerald-200 dark:hover:bg-emerald-900/20"
                        onClick={previewRecipients}
                        disabled={!backendUrl}
                      >
                        Preview recipients
                      </button>

                      <button
                        className="rounded bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                        onClick={() => sendMut.mutate()}
                        disabled={!backendUrl || sendMut.isPending}
                      >
                        {sendMut.isPending ? 'Sending…' : 'Send now'}
                      </button>

                      <button
                        className="rounded border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-slate-950 dark:text-emerald-200 dark:hover:bg-emerald-900/20"
                        onClick={openPrint}
                      >
                        Print instead
                      </button>
                      <button
                      className="rounded border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      onClick={downloadPdf}
                    >
                      Download PDF
                    </button>

                    </div>

                   {recipientPreview ? (
                        <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3 text-sm dark:border-emerald-900 dark:bg-slate-950">
                          <div className="font-semibold">
                            Recipients preview: {recipientPreview.count}
                          </div>

                          {recipientPreview.sample?.length ? (
                            <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                              Sample (admissions/emails): {recipientPreview.sample.join(', ')}
                            </div>
                          ) : (
                            <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                              No sample returned (check class label spelling / learner admissions).
                            </div>
                          )}

                          {(recipientPreview.learners != null || recipientPreview.emails != null) ? (
                            <div className="mt-2 text-[11px] text-slate-500">
                              In-app learners: {recipientPreview.learners ?? '—'} • Email recipients: {recipientPreview.emails ?? '—'}
                            </div>
                          ) : null}
                        </div>
                      ) : null}


                    {deliveryLog ? (
                      <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3 text-sm dark:border-emerald-900 dark:bg-slate-950">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-semibold">Delivery log</div>
                          <div className="text-xs text-slate-600 dark:text-slate-300">
                            Total: {deliveryLog.summary.total} • Delivered: {deliveryLog.summary.delivered} • Failed: {deliveryLog.summary.failed}
                          </div>
                        </div>
                        <div className="mt-2 max-h-[160px] overflow-auto space-y-1 text-xs">
                          {deliveryLog.items.map((r) => (
                            <div
                              key={r.recipient_email}
                              className="flex items-center justify-between gap-2 rounded border border-slate-200 px-2 py-1 dark:border-slate-800"
                            >
                              <span className="truncate">{r.recipient_email}</span>
                              <span className={r.delivered ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}>
                                {r.delivered ? 'delivered' : r.error || 'failed'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </div>

          {/* RIGHT: Theme + Live Preview */}
        {/* RIGHT: Theme + Preview (minimal, non-cluttered) */}
        <div className="min-w-0 space-y-3 lg:col-span-4">

          <ThemePanel
            theme={theme}
            setTheme={setTheme}
            principalLabel={principalLabel}
            setPrincipalLabel={setPrincipalLabel}
            onReset={() => setTheme(DEFAULT_THEME)}
          />

          <div className="rounded-2xl border border-slate-200 bg-white/70 p-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold">Live preview</div>
                <div className="text-[11px] text-slate-500">This is exactly what PDF/print uses.</div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                  onClick={openPrint}
                  type="button"
                >
                  Print
                </button>
                <button
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                  onClick={downloadPdf}
                  type="button"
                >
                  PDF
                </button>
              </div>
            </div>

            <div className="mt-3">
              {/* subtle “device frame” */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950">
                <div ref={printRef} className="nl-print-area">
                  <NewsletterDoc
                    org={org}
                    title={title}
                    termLabel={termLabel}
                    theme={theme}
                    contentMd={content}
                    signatureLabel={principalLabel}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        </div>
      )}
    </div>
  );
};

export default OrgNewslettersPage;
