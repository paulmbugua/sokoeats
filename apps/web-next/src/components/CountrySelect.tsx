import React, { useEffect, useMemo, useRef, useState } from 'react';

export type CountryItem = { code: string; name: string };

type Props = {
  value: string; // ISO code, e.g. "KE"
  onChange: (code: string) => void; // called with ISO code
  options: CountryItem[]; // your COUNTRIES array
  className?: string; // tailwind "input" styles
  placeholder?: string; // e.g. "Select your country"
  disabled?: boolean;
};

const CountrySelect: React.FC<Props> = ({
  value,
  onChange,
  options,
  className,
  placeholder = 'Select a country',
  disabled,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Show the dropdown and the text the user is filtering by
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  // Derive the selected country name from the value (ISO code)
  const selected = useMemo(() => options.find((o) => o.code === value) || null, [options, value]);

  // Filter logic: match beginning-of-word or includes (name/code)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const name = o.name.toLowerCase();
      const code = o.code.toLowerCase();
      // startsWith or includes for a forgiving UX
      return name.startsWith(q) || name.includes(` ${q}`) || code.startsWith(q);
    });
  }, [options, query]);

  // Ensure the highlighted item stays in view when navigating with keys
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const el = listRef.current?.children?.[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  // Close on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    setActiveIndex(-1);
  };

  const closeList = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const handlePick = (item: CountryItem) => {
    onChange(item.code);
    setQuery(''); // clear query after selection
    closeList();
    // keep focus on the input for quick changes
    inputRef.current?.focus();
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true);
        setActiveIndex(0);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[activeIndex] ?? filtered[0];
      if (item) handlePick(item);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeList();
    }
  };

  const displayText = open || !selected ? query : selected.name;

  return (
    <div ref={containerRef} className="relative">
      {/* Input that looks like your .input field */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={displayText}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            // When focusing, show the list and start with empty query if we have a value
            setOpen(true);
            // If there is a selected value and no query, show its name in the field visually
            // but keep query empty so typing starts fresh
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={className || 'input'}
          disabled={disabled}
          aria-expanded={open}
          aria-controls="country-listbox"
          role="combobox"
          autoComplete="off"
        />

        {/* caret icon */}
        <button
          type="button"
          tabIndex={-1}
          onClick={() => (open ? closeList() : openList())}
          className="absolute inset-y-0 right-0 pr-3 flex items-center"
          aria-label="Toggle country list"
        >
          <svg
            viewBox="0 0 20 20"
            className={`h-5 w-5 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          >
            <path
              d="M7 7l3 3 3-3"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              fillRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {/* Dropdown (always opens downward) */}
      {open && (
        <ul
          id="country-listbox"
          ref={listRef}
          role="listbox"
          className="
            absolute left-0 right-0 mt-1 z-50
            max-h-64 overflow-auto
            rounded-lg border border-black/10 bg-white shadow-lg
            dark:bg-[#121a23] dark:border-white/10
          "
        >
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-300">No matches</li>
          )}

          {filtered.map((item, idx) => {
            const active = idx === activeIndex;
            const selectedRow = item.code === value;

            return (
              <li
                key={item.code}
                role="option"
                aria-selected={selectedRow}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={(e) => e.preventDefault()} // prevent blur before click
                onClick={() => handlePick(item)}
                className={[
                  'px-3 py-2 cursor-pointer text-sm flex items-center justify-between',
                  active ? 'bg-gray-100 dark:bg-white/10' : '',
                ].join(' ')}
              >
                <span className="truncate">{item.name}</span>
                <span className="ml-3 text-xs text-gray-500">{item.code}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default CountrySelect;
