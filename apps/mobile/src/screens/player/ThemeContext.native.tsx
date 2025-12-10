/* eslint-disable prettier/prettier */
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {ThemeTokens, HighlightTemplate } from './types.native';
import { hexToRgb, pickTextOnBg } from './utils.native';

const Ctx = createContext<ThemeTokens | null>(null);

const HL_KEY = 'classroomHlHex';
const GEN_KEY = 'classroomGenHex';
const TEMPLATE_KEY = 'classroomHighlightTemplate';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [hlHex, setHlHex] = useState<string>('#22d3ee');
  const [genHex, setGenHex] = useState<string>('#ffffff');
  const [templateId, setTemplateId] = useState<HighlightTemplate>('ribbon');

  // Load persisted values on mount (native-friendly)
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const [savedHl, savedGen, savedTemplate] = await Promise.all([
          AsyncStorage.getItem(HL_KEY),
          AsyncStorage.getItem(GEN_KEY),
          AsyncStorage.getItem(TEMPLATE_KEY),
        ]);

        if (!alive) return;
        if (savedHl) setHlHex(savedHl);
        if (savedGen) setGenHex(savedGen);
        if (savedTemplate && (['clean-stripe', 'underline-glow', 'karaoke-glow', 'boxed-pill', 'ribbon'] as HighlightTemplate[]).includes(savedTemplate as HighlightTemplate)) {
          setTemplateId(savedTemplate as HighlightTemplate);
        }
      } catch {
        // ignore, fall back to defaults
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Persist updates
  useEffect(() => {
    AsyncStorage.setItem(HL_KEY, hlHex).catch(() => {});
  }, [hlHex]);

  useEffect(() => {
    AsyncStorage.setItem(GEN_KEY, genHex).catch(() => {});
  }, [genHex]);

  useEffect(() => {
    AsyncStorage.setItem(TEMPLATE_KEY, templateId).catch(() => {});
  }, [templateId]);

  const hlRgb = useMemo(() => hexToRgb(hlHex), [hlHex]);
  const genRgb = useMemo(() => hexToRgb(genHex), [genHex]);
  const activeTextOnHl = useMemo(
    () => pickTextOnBg(hlHex),
    [hlHex],
  );

  const value: ThemeTokens = {
    hlHex,
    genHex,
    hlRgb,
    genRgb,
    activeTextOnHl,
    templateId,
    setTemplateId,
    setHlHex,
    setGenHex,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useThemeTokens() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      'useThemeTokens must be used inside <ThemeProvider>',
    );
  }
  return ctx;
}

// 👇 so you can do:
// import { useThemeTokens, type HighlightTemplate } from './ThemeContext.native';
export type { HighlightTemplate };
