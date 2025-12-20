import React from 'react';
import { ThemeTokens } from './types';
import { hexToRgb, pickTextOnBg } from './utils';

const Ctx = React.createContext<ThemeTokens | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [hlHex, setHlHex] = React.useState<string>(() => {
    try {
      return localStorage.getItem('classroomHlHex') || '#22d3ee';
    } catch {
      return '#22d3ee';
    }
  });
  const [genHex, setGenHex] = React.useState<string>(() => {
    try {
      return localStorage.getItem('classroomGenHex') || '#ffffff';
    } catch {
      return '#ffffff';
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem('classroomHlHex', hlHex);
    } catch {}
  }, [hlHex]);
  React.useEffect(() => {
    try {
      localStorage.setItem('classroomGenHex', genHex);
    } catch {}
  }, [genHex]);

  const hlRgb = React.useMemo(() => hexToRgb(hlHex), [hlHex]);
  const genRgb = React.useMemo(() => hexToRgb(genHex), [genHex]);
  const activeTextOnHl = React.useMemo(() => pickTextOnBg(hlHex), [hlHex]);

  const value: ThemeTokens = { hlHex, genHex, hlRgb, genRgb, activeTextOnHl, setHlHex, setGenHex };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useThemeTokens() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('useThemeTokens must be used inside <ThemeProvider>');
  return ctx;
}
