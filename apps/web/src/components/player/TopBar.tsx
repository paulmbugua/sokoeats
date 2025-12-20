// apps/web/src/components/player/TopBar.tsx
import React from 'react';
import ColorMenu from './ColorMenu';
import VoiceSelect from './VoiceSelect';
import TemplateMenu, { type HighlightTemplate } from './TemplateMenu';

export function IconButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }
) {
  const { className, active, ...rest } = props;
  const base = `relative h-9 w-9 grid place-items-center rounded-xl transition-all duration-150 
    focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 shadow-sm
    ${active ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20 text-white'}`;
  return <button {...rest} className={`${base} ${className || ''}`} />;
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className, ...rest } = props;
  const base = `h-10 px-4 rounded-2xl font-semibold transition-all duration-150 shadow-md 
    focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 bg-white text-black`;
  return <button {...rest} className={`${base} ${className || ''}`} />;
}

export default function TopBar({
  title,
  voice,
  setVoice,
  voices,
  voicesLoading,
  voicesError,
  onPlayPause,
  playing,
  loading,
  onToggleTranscript,
  transcriptOpen,
  onToggleThemePanel,
  onToggleMax,
  isMax,
  templateId,
  setTemplateId,
  disablePlay = false,
  gateNotice,
}: {
  title: string;
  voice: string;
  setVoice: (v: string) => void;
  voices: string[];
  voicesLoading?: boolean;
  voicesError?: string | null;
  onPlayPause: () => void;
  playing: boolean;
  loading: boolean;
  onToggleTranscript: () => void;
  transcriptOpen: boolean;
  onToggleThemePanel?: () => void;
  templateId: HighlightTemplate;
  setTemplateId: (t: HighlightTemplate) => void;
  onToggleMax: () => void;
  isMax: boolean;
  disablePlay?: boolean;
  gateNotice?: { reason?: string; resetsAt?: string | null } | null;
}) {
  const outerBase =
    'overflow-visible bg-[linear-gradient(180deg,rgba(255,255,255,0.14)_0%,rgba(255,255,255,0.04)_100%)] bg-black/30 backdrop-blur-xl ring-1 ring-white/10 shadow-lg';

  const outerFrame = isMax
    ? // Full-bleed when maximized
      'mx-0 my-0 rounded-none border-b border-white/10'
    : // Floating pill when embedded
      'mx-2 my-2 rounded-2xl';

  return (
    <div className={`${outerFrame} ${outerBase}`}>
      <div className="min-h-12 px-3 flex items-center gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="hidden sm:block h-2.5 w-2.5 rounded-full bg-white/80 shadow-[0_0_12px_rgba(255,255,255,0.75)]" />
          <VoiceSelect
            value={voice}
            onChange={setVoice}
            options={voices.length ? voices : [voice]}
            loading={voicesLoading}
            error={voicesError}
          />
          <div className="mx-1 text-[12px] sm:text-sm text-white/90 truncate">{title}</div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ColorMenu />
          <TemplateMenu value={templateId} onChange={setTemplateId} />

          <PrimaryButton
            onClick={onPlayPause}
            title={playing ? 'Pause' : 'Play'}
            aria-label={playing ? 'Pause' : 'Play'}
            disabled={loading || disablePlay}
          >
            {playing ? 'Pause' : 'Play'}
          </PrimaryButton>

          {disablePlay && (
            <span
              className="text-[12px] text-amber-100/90"
              title={gateNotice?.reason || 'Narration locked'}
            >
              Narration locked
              {gateNotice?.resetsAt
                ? ` · Resets ${new Date(gateNotice.resetsAt).toLocaleString()}`
                : ''}
            </span>
          )}

          <IconButton
            onClick={onToggleTranscript}
            title="Toggle transcript (T)"
            active={transcriptOpen}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 5h16v3H4zM4 10h16v3H4zM4 15h10v3H4z" />
            </svg>
          </IconButton>

          {!!onToggleThemePanel && (
            <IconButton onClick={onToggleThemePanel} title="Backdrop theme">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 2v14a7 7 0 110-14z" />
              </svg>
            </IconButton>
          )}

          <IconButton
            onClick={onToggleMax}
            title={isMax ? 'Exit full view (F)' : 'Maximize (F)'}
            aria-label="Toggle fullscreen"
          >
            {isMax ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 9H5V5h4V3H3v6h2V5h4V3zm12 12v-6h-2v4h-4v2h6zm-6-12h4v4h2V3h-6v2zM3 21h6v-2H5v-4H3v6z" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 14H5v5h5v-2H7v-3zm12 0h-2v3h-3v2h5v-5zM7 5h3V3H5v5h2V5zm12 3V3h-5v2h3v3h2z" />
              </svg>
            )}
          </IconButton>
        </div>
      </div>
    </div>
  );
}
