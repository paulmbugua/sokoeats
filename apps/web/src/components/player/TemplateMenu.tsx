import React from 'react';

export type HighlightTemplate =
  | 'clean-stripe'
  | 'underline-glow'
  | 'karaoke-glow'
  | 'boxed-pill'
  | 'ribbon';

type Props = {
  value: HighlightTemplate;
  onChange: (v: HighlightTemplate) => void;
};

export default function TemplateMenu({ value, onChange }: Props) {
  const [open, setOpen] = React.useState(false);

  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const btnRef = React.useRef<HTMLButtonElement | null>(null);
  const itemsRef = React.useRef<HTMLButtonElement[]>([]);
  const menuId = React.useId();
  const buttonId = React.useId();

  // Define options once
  const OPTIONS = React.useMemo(
    () =>
      [
        {
          id: 'clean-stripe',
          label: 'Clean Stripe',
          preview: (
            <div
              className="w-full h-1 rounded"
              style={{ backgroundColor: 'rgba(255,255,255,0.5)' }}
            />
          ),
        },
        {
          id: 'underline-glow',
          label: 'Underline Glow',
          preview: (
            <div className="w-full h-0.5 rounded" style={{ background: 'rgb(var(--hl-rgb))' }} />
          ),
        },
        {
          id: 'karaoke-glow',
          label: 'Karaoke Glow',
          preview: (
            <div
              className="w-3 h-3 rounded-full"
              style={{
                background: 'rgb(var(--hl-rgb))',
                boxShadow: '0 0 10px rgba(var(--hl-rgb),0.9)',
              }}
            />
          ),
        },
        {
          id: 'boxed-pill',
          label: 'Boxed Pill',
          preview: (
            <div
              className="px-2 py-0.5 rounded text-[10px]"
              style={{ background: 'rgb(var(--hl-rgb))', color: 'var(--hl-text)' as any }}
            >
              Aa
            </div>
          ),
        },
        {
          id: 'ribbon',
          label: 'Ribbon',
          preview: (
            <div
              className="w-full h-2 rounded"
              style={{
                background:
                  'linear-gradient(90deg, rgba(var(--hl-rgb),0.1), rgba(var(--hl-rgb),0.6), rgba(var(--hl-rgb),0.1))',
              }}
            />
          ),
        },
      ] as const,
    []
  );

  // Close on outside click (but allow clicks inside the menu)
  React.useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (wrapperRef.current && target && wrapperRef.current.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  // Focus first selected (or first) item when opening
  React.useEffect(() => {
    if (!open) return;
    const idx = Math.max(
      0,
      OPTIONS.findIndex((o) => o.id === value)
    );
    // wait for render
    const t = setTimeout(() => {
      const el = itemsRef.current[idx] || itemsRef.current[0];
      el?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [open, value, OPTIONS]);

  // Keyboard navigation inside the menu
  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const flat = itemsRef.current.filter(Boolean);
    const currentIndex = flat.findIndex((el) => el === document.activeElement);

    const moveFocus = (nextIndex: number) => {
      const el = flat[(nextIndex + flat.length) % flat.length];
      el?.focus();
    };

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveFocus(currentIndex >= 0 ? currentIndex + 1 : 0);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveFocus(currentIndex >= 0 ? currentIndex - 1 : flat.length - 1);
        break;
      case 'Home':
        e.preventDefault();
        moveFocus(0);
        break;
      case 'End':
        e.preventDefault();
        moveFocus(flat.length - 1);
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        btnRef.current?.focus();
        break;
      case 'Enter':
      case ' ':
        if (currentIndex >= 0) {
          e.preventDefault();
          const opt = OPTIONS[currentIndex];
          onChange(opt.id);
          setOpen(false);
          btnRef.current?.focus();
        }
        break;
    }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        id={buttonId}
        ref={btnRef}
        onClick={() => setOpen((s) => !s)}
        title="Highlight templates"
        aria-label="Highlight templates"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="relative h-9 w-9 grid place-items-center rounded-xl transition-all duration-150
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 shadow-sm
                   bg-white/10 hover:bg-white/20 text-white"
      >
        {/* Sparkles icon */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M5 3l1.5 3.5L10 8l-3.5 1.5L5 13l-1.5-3.5L0 8l3.5-1.5L5 3zm11 1l2 4.5L23 11l-4.5 2.5L16 18l-2.5-4.5L9 11l4.5-2.5L16 4zm-6 7l1.2 2.8L15 15l-2.8 1.2L11 19l-1.2-2.8L7 15l2.8-1.2L11 11z" />
        </svg>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={buttonId}
          className="absolute right-0 mt-2 w-60 rounded-2xl bg-black/70 backdrop-blur-xl ring-1 ring-white/10 shadow-2xl p-2 z-[10000]"
          onKeyDown={onMenuKeyDown}
        >
          {OPTIONS.map((opt, i) => (
            <button
              key={opt.id}
              ref={(el) => {
                if (el) itemsRef.current[i] = el;
              }}
              role="menuitemradio"
              aria-checked={value === opt.id}
              onClick={() => {
                onChange(opt.id);
                setOpen(false);
                btnRef.current?.focus();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
                value === opt.id ? 'ring-1 ring-white/30 bg-white/10' : ''
              }`}
              tabIndex={-1}
            >
              <div className="shrink-0 w-8 h-6 rounded overflow-hidden ring-1 ring-white/15 bg-black/40 grid place-items-center">
                {opt.preview}
              </div>
              <div className="text-sm text-white/90">{opt.label}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
