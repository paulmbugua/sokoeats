export type SpeakAsMode = 'math' | 'spell-out' | 'characters' | 'none';

export type LessonLite = {
  id: string;
  title?: string;
  ssml: string;
  narration?: string;
  narrationDisplay?: string;
  narrationTts?: string;
  markdown?: string;
  formulas?: {
    id: string;
    latex: string;
    speakAs?: SpeakAsMode;
    title?: string;
    announceAtSentence?: number;
  }[];
  tables?: {
    title: string;
    columns: string[];
    rows: (string | number)[][];
    caption?: string;
    announceAtSentence?: number;
  }[];
};

export type OutlineSection = { id: string; title: string; keyPoints?: string[] };

export type ThemeTokens = {
  hlHex: string;
  genHex: string;
  hlRgb: string; // "r g b"
  genRgb: string; // "r g b"
  activeTextOnHl: '#000' | '#fff';
  setHlHex: (v: string) => void;
  setGenHex: (v: string) => void;
};

export type VoiceInfo = { name: string };
