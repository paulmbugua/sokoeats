import React from 'react';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

export type IconName = 'home' | 'grid' | 'receipt' | 'heart' | 'person' | 'bike' | 'cash' | 'bell' | 'bag' | 'back' | 'pin' | 'flag' | 'call' | 'search' | 'mic' | 'qr' | 'fork' | 'cart' | 'fuel' | 'menu' | 'bolt' | 'online' | 'lock' | 'sms' | 'chevron' | 'card' | 'check' | 'star';

export function AppIcon({ name, size = 18, color = '#904d00', style }: { name: IconName | string; size?: number; color?: string; style?: any }) {
  const common = { stroke: color, strokeWidth: 2.25, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  switch (name) {
    case 'home':
      return <Svg width={size} height={size} viewBox="0 0 24 24" style={style}><Path {...common} d="M3 10.8 12 3l9 7.8" /><Path {...common} d="M5.5 10.5V21h13V10.5" /><Path {...common} d="M9.5 21v-6h5v6" /></Svg>;
    case 'grid':
      return <Svg width={size} height={size} viewBox="0 0 24 24" style={style}><Rect {...common} x="4" y="4" width="6" height="6" rx="1.5" /><Rect {...common} x="14" y="4" width="6" height="6" rx="1.5" /><Rect {...common} x="4" y="14" width="6" height="6" rx="1.5" /><Rect {...common} x="14" y="14" width="6" height="6" rx="1.5" /></Svg>;
    case 'receipt':
      return <Svg width={size} height={size} viewBox="0 0 24 24" style={style}><Path {...common} d="M6 3h12v18l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2L6 21V3Z" /><Line {...common} x1="9" y1="8" x2="15" y2="8" /><Line {...common} x1="9" y1="12" x2="15" y2="12" /><Line {...common} x1="9" y1="16" x2="13" y2="16" /></Svg>;
    case 'heart':
      return <Svg width={size} height={size} viewBox="0 0 24 24" style={style}><Path {...common} d="M20.2 5.8a5 5 0 0 0-7.1 0L12 6.9l-1.1-1.1a5 5 0 1 0-7.1 7.1L12 21l8.2-8.1a5 5 0 0 0 0-7.1Z" /></Svg>;
    case 'person':
      return <Svg width={size} height={size} viewBox="0 0 24 24" style={style}><Circle {...common} cx="12" cy="8" r="4" /><Path {...common} d="M4.5 21a7.5 7.5 0 0 1 15 0" /></Svg>;
    case 'bike':
      return <Svg width={size} height={size} viewBox="0 0 24 24" style={style}><Circle {...common} cx="6" cy="17" r="3" /><Circle {...common} cx="18" cy="17" r="3" /><Path {...common} d="M8.5 17 12 9h3l3 8M12 9l-3-3M10 13h5" /></Svg>;
    case 'cash':
      return <Svg width={size} height={size} viewBox="0 0 24 24" style={style}><Rect {...common} x="3" y="6" width="18" height="12" rx="2" /><Circle {...common} cx="12" cy="12" r="3" /><Line {...common} x1="6" y1="9" x2="6" y2="9.1" /><Line {...common} x1="18" y1="15" x2="18" y2="15.1" /></Svg>;
    case 'bell':
      return <Svg width={size} height={size} viewBox="0 0 24 24" style={style}><Path {...common} d="M18 9a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><Path {...common} d="M10 21a2 2 0 0 0 4 0" /></Svg>;
    case 'bag':
      return <Svg width={size} height={size} viewBox="0 0 24 24" style={style}><Path {...common} d="M6 8h12l1 13H5L6 8Z" /><Path {...common} d="M9 8a3 3 0 0 1 6 0" /></Svg>;
    case 'back':
      return <Svg width={size} height={size} viewBox="0 0 24 24" style={style}><Line {...common} x1="20" y1="12" x2="5" y2="12" /><Polyline {...common} points="12 5 5 12 12 19" /></Svg>;
    case 'pin':
      return <Svg width={size} height={size} viewBox="0 0 24 24" style={style}><Path {...common} d="M12 21s7-5.4 7-12a7 7 0 1 0-14 0c0 6.6 7 12 7 12Z" /><Circle {...common} cx="12" cy="9" r="2.5" /></Svg>;
    case 'flag':
      return <Svg width={size} height={size} viewBox="0 0 24 24" style={style}><Path {...common} d="M5 21V4" /><Path {...common} d="M5 4h12l-1.5 4L17 12H5" /></Svg>;
    case 'call':
      return <Svg width={size} height={size} viewBox="0 0 24 24" style={style}><Path {...common} d="M22 16.9v3a2 2 0 0 1-2.2 2 19.7 19.7 0 0 1-8.6-3.1 19.2 19.2 0 0 1-6-6A19.7 19.7 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7A2 2 0 0 1 22 16.9Z" /></Svg>;
    case 'search':
      return <Svg width={size} height={size} viewBox="0 0 24 24" style={style}><Circle {...common} cx="11" cy="11" r="7" /><Line {...common} x1="16.5" y1="16.5" x2="21" y2="21" /></Svg>;
    case 'mic':
      return <Svg width={size} height={size} viewBox="0 0 24 24" style={style}><Path {...common} d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" /><Path {...common} d="M5 11a7 7 0 0 0 14 0" /><Line {...common} x1="12" y1="18" x2="12" y2="22" /></Svg>;
    case 'qr':
      return <Svg width={size} height={size} viewBox="0 0 24 24" style={style}><Rect {...common} x="4" y="4" width="6" height="6" /><Rect {...common} x="14" y="4" width="6" height="6" /><Rect {...common} x="4" y="14" width="6" height="6" /><Path {...common} d="M14 14h2v2h-2zM18 14h2M14 20h6v-2" /></Svg>;
    case 'fork':
      return <Svg width={size} height={size} viewBox="0 0 24 24" style={style}><Path {...common} d="M7 3v8M4 3v8M10 3v8M4 11h6M7 11v10" /><Path {...common} d="M17 3v18M17 3c3 2 4 5 4 8h-4" /></Svg>;
    case 'cart':
      return <Svg width={size} height={size} viewBox="0 0 24 24" style={style}><Path {...common} d="M4 5h2l2.2 10.5A2 2 0 0 0 10.2 17H18" /><Path {...common} d="M8 7h13l-2 7H9.5" /><Circle {...common} cx="10" cy="20" r="1" /><Circle {...common} cx="18" cy="20" r="1" /></Svg>;
    case 'fuel':
      return <Svg width={size} height={size} viewBox="0 0 24 24" style={style}><Path {...common} d="M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17" /><Path {...common} d="M5 10h10M15 7h2l2 2v8a2 2 0 0 0 4 0v-5l-3-3" /></Svg>;
    case 'bolt':
      return <Svg width={size} height={size} viewBox="0 0 24 24" style={style}><Path {...common} d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></Svg>;
    case 'online':
      return <Svg width={size} height={size} viewBox="0 0 24 24" style={style}><Circle cx="12" cy="12" r="7" fill={color} /></Svg>;
    case 'lock':
      return <Svg width={size} height={size} viewBox="0 0 24 24" style={style}><Rect {...common} x="5" y="11" width="14" height="10" rx="2" /><Path {...common} d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>;
    case 'sms':
      return <Svg width={size} height={size} viewBox="0 0 24 24" style={style}><Path {...common} d="M4 5h16v11H8l-4 4V5Z" /><Line {...common} x1="8" y1="9" x2="16" y2="9" /><Line {...common} x1="8" y1="13" x2="13" y2="13" /></Svg>;
    case 'chevron':
      return <Svg width={size} height={size} viewBox="0 0 24 24" style={style}><Polyline {...common} points="9 6 15 12 9 18" /></Svg>;
    case 'card':
      return <Svg width={size} height={size} viewBox="0 0 24 24" style={style}><Rect {...common} x="3" y="5" width="18" height="14" rx="2" /><Line {...common} x1="3" y1="10" x2="21" y2="10" /></Svg>;
    case 'check':
    default:
      return <Svg width={size} height={size} viewBox="0 0 24 24" style={style}><Circle {...common} cx="12" cy="12" r="9" /><Path {...common} d="m8 12 2.5 2.5L16.5 9" /></Svg>;
  }
}