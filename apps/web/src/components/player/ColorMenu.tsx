import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useThemeTokens } from './ThemeContext';

function IconButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className, ...rest } = props;
  return (
    <button
      {...rest}
      className={`relative h-9 w-9 grid place-items-center rounded-xl transition-all duration-150
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 shadow-sm
                  bg-white/10 hover:bg-white/20 text-white ${className || ''}`}
    />
  );
}

export default function ColorMenu() {
  const { hlHex, genHex, setHlHex, setGenHex } = useThemeTokens();
  const [open, setOpen] = React.useState(false);
  const PRESETS = [
    '#22d3ee',
    '#60a5fa',
    '#34d399',
    '#fbbf24',
    '#f97316',
    '#ef4444',
    '#f472b6',
    '#a78bfa',
    '#ffffff',
    '#e5e7eb',
  ];

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest?.('[data-color-menu]')) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className="relative" data-color-menu>
      <IconButton
        title="Text & highlight colors"
        aria-label="Text & highlight colors"
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3a9 9 0 00-9 9 6 6 0 006 6h6a3 3 0 000-6h-1a2 2 0 01-2-2 3 3 0 013-3h1a3 3 0 000-6H12z" />
        </svg>
      </IconButton>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 z-[200] w-64 rounded-xl bg-[#0b1220]/95 backdrop-blur-xl ring-1 ring-white/10 shadow-2xl p-3"
          >
            <div className="text-white/80 text-xs mb-2">Highlight (active word)</div>
            <div className="grid grid-cols-10 gap-1 mb-3">
              {PRESETS.map((c) => (
                <button
                  key={`hl-${c}`}
                  onClick={() => setHlHex(c)}
                  title={c}
                  className="h-6 w-6 rounded-md ring-1 ring-white/10"
                  style={{ background: c, outline: c === hlHex ? '2px solid white' : undefined }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 mb-3">
              <input
                type="color"
                value={hlHex}
                onChange={(e) => setHlHex(e.target.value)}
                className="h-7 w-10 rounded-md bg-transparent"
              />
              <div className="text-[11px] text-white/70">{hlHex}</div>
            </div>

            <div className="text-white/80 text-xs mb-2">Generated words (revealed text)</div>
            <div className="grid grid-cols-10 gap-1 mb-3">
              {PRESETS.map((c) => (
                <button
                  key={`gen-${c}`}
                  onClick={() => setGenHex(c)}
                  title={c}
                  className="h-6 w-6 rounded-md ring-1 ring-white/10"
                  style={{ background: c, outline: c === genHex ? '2px solid white' : undefined }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={genHex}
                onChange={(e) => setGenHex(e.target.value)}
                className="h-7 w-10 rounded-md bg-transparent"
              />
              <div className="text-[11px] text-white/70">{genHex}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
