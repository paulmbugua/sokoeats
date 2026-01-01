import React from 'react';

type Props = {
  label?: string;
  inline?: boolean;
  size?: number; // px
  className?: string;
};

export default function Spinner({
  label = 'Loading…',
  inline = false,
  size = 56,
  className = '',
}: Props) {
  const Ring = (
    <div
      className="relative"
      style={{ width: size, height: size }}
      aria-label={label}
      role="status"
    >
      {/* faint ring */}
      <div
        className="absolute inset-0 rounded-full border"
        style={{ borderWidth: Math.max(2, Math.round(size * 0.07)) }}
      />
      {/* spinning ring accent */}
      <div
        className="absolute inset-0 rounded-full border-t-softPink border-transparent animate-spin"
        style={{ borderWidth: Math.max(2, Math.round(size * 0.07)) }}
      />
      {/* core pulse */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="rounded-full bg-softPink animate-pulse"
          style={{
            width: Math.max(10, Math.round(size * 0.22)),
            height: Math.max(10, Math.round(size * 0.22)),
          }}
        />
      </div>
    </div>
  );

  const Content = (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div className="text-gray-300 dark:text-white/20">{Ring}</div>
      {!!label && (
        <div className="mt-3 text-sm text-darkText/80 dark:text-white/85 max-w-[240px] truncate">
          {label}
        </div>
      )}
    </div>
  );

  if (inline) return Content;

  return (
    <div className="min-h-[180px] w-full flex items-center justify-center">
      {Content}
    </div>
  );
}
