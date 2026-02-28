//apps/mobile/src/theme/ThemeContext.tsx
import React from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemePref = 'light' | 'dark' | 'system';
type ThemeState = {
  pref: ThemePref; // user preference: light | dark | system
  resolvedScheme: 'light' | 'dark'; // actual scheme in use
  setPref: (p: ThemePref) => void;
  toggle: () => void; // quick light <-> dark (keeps 'system' until user flips)
  resetSystem: () => void; // go back to 'system'
};

const ThemeCtx = React.createContext<ThemeState | null>(null);
const KEY = 'theme:preference';

function resolve(pref: ThemePref): 'light' | 'dark' {
  if (pref === 'system') return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
  return pref;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode; tw?: any }> = ({
  children,
  tw,
}) => {
  const [pref, setPrefState] = React.useState<ThemePref>('system');
  const [resolvedScheme, setResolved] = React.useState<'light' | 'dark'>(resolve('system'));

  // Load saved pref on mount
  React.useEffect(() => {
    (async () => {
      try {
        const saved = (await AsyncStorage.getItem(KEY)) as ThemePref | null;
        const init = saved || 'system';
        setPrefState(init);
        const scheme = resolve(init);
        setResolved(scheme);
        (tw as any)?.setColorScheme?.(scheme);
      } catch {}
    })();
  }, [tw]);

  // React to system changes only when pref === 'system'
  React.useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      if (pref === 'system') {
        const scheme = colorScheme === 'dark' ? 'dark' : 'light';
        setResolved(scheme);
        (tw as any)?.setColorScheme?.(scheme);
      }
    });
    return () => sub.remove();
  }, [pref, tw]);

  const persist = async (p: ThemePref) => {
    setPrefState(p);
    await AsyncStorage.setItem(KEY, p);
  };

  const setPref = (p: ThemePref) => {
    if (p === pref) return; // avoid extra work
    void persist(p);
    const scheme = resolve(p);
    setResolved(scheme);
    (tw as any)?.setColorScheme?.(scheme);
  };

  /** If user is on 'system', toggle to the *opposite* of the current resolved scheme. */
  const toggle = () => {
    const next = (
      pref === 'system'
        ? resolvedScheme === 'dark'
          ? 'light'
          : 'dark'
        : pref === 'dark'
          ? 'light'
          : 'dark'
    ) as ThemePref;
    setPref(next);
  };

  const resetSystem = () => setPref('system');

  return (
    <ThemeCtx.Provider value={{ pref, resolvedScheme, setPref, toggle, resetSystem }}>
      {children}
    </ThemeCtx.Provider>
  );
};

export const useThemePref = () => {
  const ctx = React.useContext(ThemeCtx);
  if (!ctx) throw new Error('useThemePref must be used inside ThemeProvider');
  return ctx;
};
