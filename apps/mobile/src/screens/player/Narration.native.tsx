/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  Easing,
  type TextStyle,
} from 'react-native';
import tw from '../../../tailwind';
import { useThemeTokens } from './ThemeContext.native';
import type { HighlightTemplate } from './ThemeContext.native';

type WordTiming = { text: string; start: number; end: number };
type Line = { text: string; start: number; end: number; indices: number[] };

type Props = {
  chromeTop: number; // still passed, but not used for layout
  chromeBottom: number; // still passed, but not used for layout
  words: WordTiming[];
  lines: Line[];
  activeLine: number;
  currentIndex: number;
  isMax: boolean;
};

const Narration: React.FC<Props> = ({
  chromeTop: _chromeTop,
  chromeBottom: _chromeBottom,
  words,
  lines,
  activeLine,
  currentIndex,
  isMax,
}) => {
  const { hlHex, genHex, activeTextOnHl, templateId } = useThemeTokens();

  const [fontScale, setFontScale] = useState(1);

  const hasLines = Array.isArray(lines) && lines.length > 0;
  const MAX_LINES = isMax ? 5 : 3;

  // Window/chunk index based on the *logical* activeLine
  const logicalWindowIndex = hasLines
    ? Math.floor(activeLine / Math.max(1, MAX_LINES))
    : 0;

  // What we're actually showing (we animate when this changes)
  const [visibleWindowIndex, setVisibleWindowIndex] = useState(
    logicalWindowIndex
  );

  // Animation values for fade + slight slide
  const fadeA = useRef(new Animated.Value(1)).current;
  const slideA = useRef(new Animated.Value(0)).current;

  // When lines reset (e.g. new lesson), snap window + reset animation
  useEffect(() => {
    if (!hasLines) {
      setVisibleWindowIndex(0);
      fadeA.setValue(1);
      slideA.setValue(0);
      return;
    }

    // When we restart at the beginning, snap instead of animating
    if (activeLine === 0) {
      setVisibleWindowIndex(logicalWindowIndex);
      fadeA.setValue(1);
      slideA.setValue(0);
    }
  }, [hasLines, logicalWindowIndex, activeLine]);

  // Animate when the logical window changes (page flip)
  useEffect(() => {
    if (!hasLines) return;
    if (logicalWindowIndex === visibleWindowIndex) return;

    // Fade out + small slide down
    Animated.parallel([
      Animated.timing(fadeA, {
        toValue: 0,
        duration: 130,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(slideA, {
        toValue: 8,
        duration: 130,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Switch to the new window
      setVisibleWindowIndex(logicalWindowIndex);

      // Prepare for fade-in from slightly above
      fadeA.setValue(0);
      slideA.setValue(-8);

      Animated.parallel([
        Animated.timing(fadeA, {
          toValue: 1,
          duration: 170,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(slideA, {
          toValue: 0,
          duration: 170,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [hasLines, logicalWindowIndex, visibleWindowIndex]);

  // Compute the chunk of lines to display
  let startIdx = visibleWindowIndex * MAX_LINES;
  if (hasLines && startIdx + MAX_LINES > lines.length) {
    startIdx = Math.max(0, lines.length - MAX_LINES);
  }
  const contextLines = hasLines
    ? lines.slice(startIdx, startIdx + MAX_LINES)
    : [];

  const baseFontSize = isMax ? 18 : 15;
  const effectiveFontSize = baseFontSize * fontScale;
  const lineHeight = effectiveFontSize * 1.35;

  const cycleFontScale = () => {
    setFontScale((prev) => {
      if (prev < 1.15) return 1.2;
      if (prev < 1.35) return 1.4;
      return 1; // back to default
    });
  };

  // Fixed vertical offset to avoid shaking as the number of lines changes
  const translateYCenter = isMax ? -110 : -80;

  // If no lines yet, render nothing (after all hooks)
  if (!hasLines || !contextLines.length) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={[
        tw`absolute left-0 right-0 px-4`,
        {
          top: '50%',
          alignItems: 'center',
          transform: [{ translateY: translateYCenter }],
        },
      ]}
    >
      <Pressable
        onPress={cycleFontScale}
        style={tw`bg-black/45 rounded-2xl px-4 py-3 max-w-[95%]`}
        android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: false }}
      >
        <Animated.View
          style={{
            opacity: fadeA,
            transform: [{ translateY: slideA }],
          }}
        >
          {contextLines.map((line, lineIdx) => (
            <Text
              key={`${line.start}-${line.end}-${lineIdx}`}
              style={[
                tw`text-white flex-row flex-wrap`,
                lineIdx > 0 && tw`mt-1`,
                {
                  fontSize: effectiveFontSize,
                  lineHeight,
                },
              ]}
            >
              {line.indices.map((wi, j) => {
                const w = words[wi];
                if (!w) return null;

                const isActiveWord = wi === currentIndex;

                const isPunct = /^[,.;:!?]+$/.test(w.text.trim());
                const prefix = j === 0 ? '' : isPunct ? '' : ' ';
                const displayText = prefix + w.text;

                const baseWordStyle: TextStyle = {
                  color: genHex,
                  opacity: 0.95,
                };

                let activeStyle: TextStyle = {};
                if (isActiveWord) {
                  switch (templateId as HighlightTemplate) {
                    case 'boxed-pill':
                      activeStyle = {
                        backgroundColor: hlHex,
                        color: activeTextOnHl,
                        borderRadius: 4,
                      };
                      break;
                    case 'underline-glow':
                      activeStyle = {
                        color: activeTextOnHl,
                        textDecorationLine: 'underline',
                        textDecorationColor: hlHex,
                        textDecorationStyle: 'solid',
                      };
                      break;
                    case 'karaoke-glow':
                      activeStyle = {
                        color: activeTextOnHl,
                        textShadowColor: hlHex,
                        textShadowOffset: { width: 0, height: 0 },
                        textShadowRadius: 6,
                      };
                      break;
                    case 'ribbon':
                      activeStyle = {
                        backgroundColor: hlHex,
                        color: activeTextOnHl,
                        borderRadius: 999,
                      };
                      break;
                    case 'clean-stripe':
                    default:
                      activeStyle = {
                        backgroundColor: hlHex + '33',
                        color: activeTextOnHl,
                        borderRadius: 2,
                      };
                      break;
                  }
                }

                return (
                  <Text
                    key={wi}
                    style={[baseWordStyle, isActiveWord && activeStyle]}
                  >
                    {displayText}
                  </Text>
                );
              })}
            </Text>
          ))}
        </Animated.View>
      </Pressable>
    </View>
  );
};

export default Narration;
