import React from 'react';
import Spinner from './Spinner.web';

type Props = {
  visible: boolean;
  label?: string;
};

export default function TransitionOverlay({ visible, label = 'Opening…' }: Props) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/25 dark:bg-black/45 backdrop-blur-sm" />

      {/* panel */}
      <div className="relative rounded-2xl px-6 py-5 bg-white/90 dark:bg-slate-900/85 ring-1 ring-black/10 dark:ring-white/10 shadow-2xl">
        <Spinner inline label={label} />
      </div>
    </div>
  );
}
