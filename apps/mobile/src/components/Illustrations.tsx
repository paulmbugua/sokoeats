import React from 'react';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import { colors } from '../theme/tokens';

type IllustrationProps = {
  width?: number;
  height?: number;
};

export function ServiceHeroIllustration({ width = 260, height = 210 }: IllustrationProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 260 210" fill="none">
      <Defs>
        <SvgLinearGradient id="truckBody" x1="44" y1="55" x2="205" y2="165">
          <Stop offset="0" stopColor="#22C55E" />
          <Stop offset="1" stopColor="#0B5F4E" />
        </SvgLinearGradient>
      </Defs>
      <Path d="M35 172c16 16 162 17 190 1 10-6 5-17-11-21-33-9-138-8-172 0-17 4-22 13-7 20Z" fill="#DDEFE5" />
      <Circle cx="205" cy="42" r="24" fill="#FFF2C7" />
      <Rect x="48" y="82" width="130" height="70" rx="8" fill="url(#truckBody)" />
      <Path d="M178 101h31l18 23v28h-49v-51Z" fill="#FFB000" />
      <Path d="M192 108h15l11 14h-26v-14Z" fill="#F8FAFC" />
      <Circle cx="84" cy="154" r="17" fill="#0F172A" />
      <Circle cx="84" cy="154" r="8" fill="#E5E7EB" />
      <Circle cx="196" cy="154" r="17" fill="#0F172A" />
      <Circle cx="196" cy="154" r="8" fill="#E5E7EB" />
      <Path d="M84 65l17 17-34 34-17-17 34-34Z" fill="#F8FAFC" opacity="0.96" />
      <Path d="M111 58l10 10-16 16-10-10 16-16Z" fill="#0F172A" />
      <Path d="M73 96l10 10-27 27a8 8 0 0 1-11-11l28-26Z" fill="#FFB000" />
      <Rect x="62" y="117" width="74" height="10" rx="5" fill="#0B5F4E" opacity="0.35" />
      <Rect x="62" y="134" width="54" height="8" rx="4" fill="#FFFFFF" opacity="0.7" />
      <Circle cx="40" cy="58" r="9" fill="#FFB000" />
      <Circle cx="223" cy="83" r="7" fill={colors.primary} />
    </Svg>
  );
}

export function QuoteIllustration({ width = 118, height = 96 }: IllustrationProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 118 96" fill="none">
      <Rect x="12" y="12" width="76" height="58" rx="8" fill="#FFFFFF" />
      <Rect x="22" y="26" width="44" height="7" rx="3.5" fill="#0F172A" opacity="0.9" />
      <Rect x="22" y="41" width="52" height="6" rx="3" fill="#CBD5E1" />
      <Rect x="22" y="54" width="35" height="6" rx="3" fill="#CBD5E1" />
      <Circle cx="84" cy="67" r="23" fill="#FFB000" />
      <Path d="M76 67l6 6 13-15" stroke="#0F172A" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M13 79c15 9 70 10 91 0" stroke="#CDEBDD" strokeWidth="9" strokeLinecap="round" />
    </Svg>
  );
}

export function CategoryTileIllustration({ width = 62, height = 54 }: IllustrationProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 62 54" fill="none">
      <Path d="M9 44c8 7 35 7 44 0 4-3 2-8-4-10-10-4-27-4-39 0-6 2-7 7-1 10Z" fill="#DDEFE5" />
      <Rect x="17" y="17" width="31" height="24" rx="6" fill="#16A34A" />
      <Path d="M16 21 32 9l17 12" stroke="#0F172A" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M25 34h16" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
      <Circle cx="48" cy="13" r="7" fill="#FFB000" />
    </Svg>
  );
}
