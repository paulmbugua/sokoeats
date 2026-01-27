import React, { useCallback, useEffect, useMemo, useState } from 'react';

// Hint IDs in use:
// lesson_overlay_v1
// org_roster_add_v1
// org_announcements_publish_v1
// org_exam_flow_v1
// org_fees_quick_actions_v1
// account_transactions_v1
// account_sessions_v1

export type CoachmarkPlacement = 'top' | 'bottom' | 'left' | 'right';

const hintStorageKey = (id: string) => `hint_seen:${id}`;

export const useCoachmark = (id: string, eligible: boolean) => {
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    try {
      const value = window.localStorage.getItem(hintStorageKey(id));
      if (active) setSeen(Boolean(value));
    } catch {
      if (active) setSeen(false);
    }
    return () => {
      active = false;
    };
  }, [id]);

  const visible = Boolean(eligible && seen === false);

  const dismiss = useCallback(() => {
    setSeen(true);
    try {
      window.localStorage.setItem(hintStorageKey(id), '1');
    } catch {
      // ignore
    }
  }, [id]);

  return { visible, dismiss };
};

type CoachmarkProps = {
  id: string;
  title: string;
  text: string;
  visible: boolean;
  onDismiss: () => void;
  placement?: CoachmarkPlacement;
};

export const Coachmark: React.FC<CoachmarkProps> = ({
  id,
  title,
  text,
  visible,
  onDismiss,
  placement = 'top',
}) => {
  const placementClass = useMemo(() => {
    switch (placement) {
      case 'bottom':
        return 'top-full left-0 mt-2';
      case 'left':
        return 'right-full top-0 mr-2';
      case 'right':
        return 'left-full top-0 ml-2';
      default:
        return 'bottom-full left-0 mb-2';
    }
  }, [placement]);

  if (!visible) return null;

  return (
    <div
      aria-label={`Hint: ${id}`}
      className={`absolute z-50 max-w-[260px] rounded-xl border border-blue-200 bg-white p-3 text-left shadow-lg dark:border-blue-500/30 dark:bg-[#0f1821] ${placementClass}`}
    >
      <div className="text-xs font-semibold text-slate-900 dark:text-white">{title}</div>
      <div className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">{text}</div>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-2 inline-flex rounded-full bg-blue-600/90 px-3 py-1 text-[11px] font-semibold text-white"
      >
        Got it
      </button>
    </div>
  );
};

