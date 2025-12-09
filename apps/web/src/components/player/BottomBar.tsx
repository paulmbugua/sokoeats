// apps/web/src/components/player/BottomBar.tsx
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatTime } from './utils';

export function IconButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className, ...rest } = props;
  const base = `relative h-9 w-9 grid place-items-center rounded-xl transition-all duration-150 
    focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 shadow-sm
    bg-white/10 hover:bg-white/20 text-white`;
  return <button {...rest} className={`${base} ${className || ''}`} />;
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className, ...rest } = props;
  const base = `h-10 px-4 rounded-2xl font-semibold transition-all duration-150 shadow-md 
    focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 bg-white text-black`;
  return <button {...rest} className={`${base} ${className || ''}`} />;
}

export default function BottomBar({
  currentSec,
  durationSec,
  progress,
  onBack5,
  onFwd5,
  onPlayPause,
  playing,
  loading,
  volume,
  setVolume,
  toggleMute,
  barRef,
  hoveringBar,
  setHoveringBar,
  scrubbing,
  setScrubbing,
  setFromPointer,
  commitFromPointer,
  hoverPct,
  hoverSec,
  childrenTopFloating,
  isMax = false,
}: {
  currentSec: number;
  durationSec: number;
  progress: number;
  onBack5: () => void;
  onFwd5: () => void;
  onPlayPause: () => void;
  playing: boolean;
  loading: boolean;
  volume: number;
  setVolume: (n: number) => void;
  toggleMute: () => void;
  barRef: React.RefObject<HTMLDivElement | null>;
  hoveringBar: boolean;
  setHoveringBar: (b: boolean) => void;
  scrubbing: boolean;
  setScrubbing: (b: boolean) => void;
  setFromPointer: (x: number) => void;
  commitFromPointer: (x: number) => void;
  hoverPct: number;
  hoverSec: number;
  childrenTopFloating?: React.ReactNode;
  isMax?: boolean;
}) {
  const volDown = () =>
    setVolume(Math.max(0, +(Math.max(0, volume - 0.1)).toFixed(3)));
  const volUp = () =>
    setVolume(Math.min(1, +(Math.min(1, volume + 0.1)).toFixed(3)));

  const outerBase =
    'bg-[linear-gradient(180deg,rgba(255,255,255,0.14)_0%,rgba(255,255,255,0.04)_100%)] bg-black/35 backdrop-blur-xl ring-1 ring-white/10 shadow-2xl';

  const outerFrame = isMax
    ? // Full-bleed at bottom when maximized
      'mx-0 mb-0 rounded-none border-t border-white/10'
    : // Floating pill when embedded
      'mx-2 mb-2 rounded-2xl';

  return (
    <div className="mx-2 mb-2 rounded-2xl bg-[linear-gradient(180deg,rgba(255,255,255,0.14)_0%,rgba(255,255,255,0.04)_100%)] bg-black/35 backdrop-blur-xl ring-1 ring-white/10 shadow-2xl">
      {childrenTopFloating}
      <div className="px-3 sm:px-4 py-3 flex flex-col gap-2">
        {/* Row 1 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <IconButton onClick={onBack5} title="Back 5 seconds" aria-label="Back 5 seconds">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M13 5l-7 7 7 7v-4h8v-6h-8V5z"/></svg>
            </IconButton>

            <PrimaryButton
              onClick={onPlayPause}
              title={playing ? 'Pause (Space)' : 'Play (Space)'}
              disabled={loading}
              aria-label={playing ? 'Pause' : 'Play'}
              aria-pressed={playing}
            >
              {playing ? 'Pause' : 'Play'}
            </PrimaryButton>

            <IconButton onClick={onFwd5} title="Forward 5 seconds" aria-label="Forward 5 seconds">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11 5v4H3v6h8v4l7-7-7-7z"/></svg>
            </IconButton>
          </div>

          <div className="ml-1 flex items-center gap-2 text-white/85 text-xs sm:text-sm tabular-nums">
            <span aria-label="Current time">{formatTime(currentSec)}</span>
            <span className="opacity-60">/</span>
            <span aria-label="Total time">{durationSec ? formatTime(durationSec) : '0:00'}</span>
          </div>

          {/* Volume */}
          <div className="ml-auto flex items-center gap-2 text-white">
            <IconButton onClick={toggleMute} title={volume > 0 ? 'Mute' : 'Unmute'} aria-label={volume > 0 ? 'Mute' : 'Unmute'}>
              {volume === 0 ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12l2.5 2.5L20.5 13l-2-2 2-2-1.5-1.5L16.5 10l-2.5-2.5L12.5 9l2 2-2 2 1.5 1.5L16.5 12zM5 9v6h4l5 5V4L9 9H5z"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M5 9v6h4l5 5V4L9 9H5zm11.5 3a3.5 3.5 0 000-7v2a1.5 1.5 0 010 3 1.5 1.5 0 010 3v-1z"/></svg>
              )}
            </IconButton>
            <button
              onClick={volDown}
              style={{ backgroundColor: 'rgba(var(--gen-rgb),0.12)' }}
              className="h-9 px-2 rounded-xl hover:brightness-110 text-white text-xs shadow-sm"
              title="Volume down"
              aria-label="Volume down"
            >
              −
            </button>
            <div className="relative w-36 h-6 grid place-items-center">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e)=>setVolume(+e.target.value)}
                className="w-full accent-white [--tw-shadow:0_0_0]"
                aria-label="Volume"
                title="Volume"
              />
              <div className="pointer-events-none absolute inset-0 rounded-full overflow-hidden">
                {/* Track */}
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-1 w-full rounded-full"
                  style={{ backgroundColor: 'rgba(var(--gen-rgb),0.15)' }}
                />
                {/* Fill */}
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-white/80"
                  style={{ width: `${Math.round(volume * 100)}%` }}
                />
              </div>
            </div>
            <button
              onClick={volUp}
              style={{ backgroundColor: 'rgba(var(--gen-rgb),0.12)' }}
              className="h-9 px-2 rounded-xl hover:brightness-110 text-white text-xs shadow-sm"
              title="Volume up"
              aria-label="Volume up"
            >
              +
            </button>
            <div className="text-white/80 text-[11px] tabular-nums w-10 text-right">
              {Math.round(volume * 100)}%
            </div>
          </div>
        </div>

        {/* Row 2: scrubber (robust pointer version) */}
        <div className="flex items-center gap-2">
          <div className="text-white/70 text-[11px] sm:text-xs tabular-nums w-[42px] text-right">
            {formatTime(currentSec)}
          </div>

          <div
            ref={barRef}
            className="relative h-4 w-full rounded-full bg-white/10 cursor-pointer select-none ring-1 ring-white/10 pointer-events-auto"
            onPointerDown={(e) => {
              (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
              setScrubbing(true);
              setHoveringBar(true);
              const x = e.clientX;
              setFromPointer(x);
              commitFromPointer(x);
            }}
            onPointerMove={(e) => {
              if (!scrubbing) return;
              const x = e.clientX;
              setHoveringBar(true);
              setFromPointer(x);
              commitFromPointer(x);
            }}
            onPointerUp={(e) => {
              (e.currentTarget as HTMLDivElement).releasePointerCapture?.(e.pointerId);
              setScrubbing(false);
              const x = e.clientX;
              commitFromPointer(x);
            }}
            onPointerCancel={() => {
              setScrubbing(false);
              setHoveringBar(false);
            }}
            onPointerLeave={() => {
              setHoveringBar(false);
              setScrubbing(false);
            }}
            // Simple click/tap safety net
            onClick={(e) => {
              commitFromPointer(e.clientX);
            }}
            role="slider"
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={durationSec || 0}
            aria-valuenow={currentSec || 0}
            aria-valuetext={`${formatTime(currentSec)} of ${durationSec ? formatTime(durationSec) : '0:00'}`}
            aria-label="Lesson progress"
          >
            {/* Hover time bubble */}
            <AnimatePresence>
              {(hoveringBar || scrubbing) && (
                <motion.div
                  key="hover-tip"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.15 }}
                  className="absolute -top-7 pointer-events-none"
                  style={{ left: `calc(${Math.round(hoverPct * 100)}% - 18px)` }}
                >
                  <div className="px-2 py-0.5 rounded-md text-[11px] bg-black/70 backdrop-blur-md text-white/90 ring-1 ring-white/10 shadow">
                    {formatTime(hoverSec)}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Track background — non-interactive */}
            <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
              <div className="absolute inset-0 bg-gradient-to-r from-white/15 via-white/10 to-white/15" />
            </div>

            {/* Progress fill — non-interactive (theme aware) */}
            <motion.div
              className="absolute left-0 top-0 bottom-0 rounded-full pointer-events-none"
              style={{
                background: 'linear-gradient(90deg, rgba(var(--hl-rgb),1), rgba(var(--hl-rgb),0.9))',
                boxShadow: '0 0 12px rgba(var(--hl-rgb),0.35)',
              }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.round(progress * 100)}%` }}
              transition={{ type: 'tween', ease: 'easeOut', duration: 0.15 }}
            />

            {/* Knob — display only (theme aware) */}
            <motion.div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-4 rounded-full pointer-events-none"
              style={{
                backgroundColor: 'rgba(var(--hl-rgb),1)',
                boxShadow: '0 2px 10px rgba(0,0,0,0.4), 0 0 0 6px rgba(var(--hl-rgb),0.25)',
              }}
              initial={false}
              animate={{ left: `${Math.round(progress * 100)}%`, scale: (hoveringBar || scrubbing) ? 1.08 : 1 }}
              transition={{ type: 'tween', ease: 'easeOut', duration: 0.12 }}
            />
          </div>

          <div className="text-white/70 text-[11px] sm:text-xs tabular-nums w-[42px]">
            {durationSec ? formatTime(durationSec) : '0:00'}
          </div>
        </div>
      </div>
    </div>
  );
}
