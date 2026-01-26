// apps/mobile/src/screens/AutoPreviewVideo.native.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Pressable, View, Text } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

type Props = {
  uri: string;
  shouldPlay: boolean;
  style?: any;

  /** NEW (optional): preview always starts muted */
  startMuted?: boolean; // default true
  /** NEW (optional): allow user to tap preview to toggle sound */
  allowTapToToggleMute?: boolean; // default false (keeps it strictly silent)
};

export default function AutoPreviewVideo({
  uri,
  shouldPlay,
  style,
  startMuted = true,
  allowTapToToggleMute = false,
}: Props) {
  // ✅ avoid creating a player with an empty uri
  if (!uri) return null;

  const [muted, setMuted] = useState<boolean>(startMuted);

  // Reset mute when uri changes (list recycling)
  useEffect(() => {
    setMuted(startMuted);
  }, [uri, startMuted]);

  // Create player
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;

    // ✅ enforce mute at creation time
    try {
      // expo-video (most versions)
      // @ts-ignore
      p.isMuted = true;
      // Some versions may use `muted`
      // @ts-ignore
      p.muted = true;
    } catch {}
  });

  // Helper: hard-enforce mute on the underlying player
  const applyMute = useCallback(
    (nextMuted: boolean) => {
      if (!player) return;
      try {
        // @ts-ignore
        player.isMuted = nextMuted;
      } catch {}
      try {
        // @ts-ignore
        player.muted = nextMuted;
      } catch {}
    },
    [player]
  );

  // ✅ Always keep it muted unless explicitly toggled
  useEffect(() => {
    applyMute(muted);
  }, [muted, applyMute]);

  // Play/pause based on visibility — but ALWAYS apply mute BEFORE play
  useEffect(() => {
    if (!player) return;

    try {
      // prevent any audio blip
      applyMute(muted);

      if (shouldPlay) player.play();
      else player.pause();
    } catch {}

    return () => {
      try {
        player.pause();
      } catch {}
    };
  }, [player, shouldPlay, muted, applyMute]);

  const onToggleMute = () => {
    if (!allowTapToToggleMute) return;
    const next = !muted;
    setMuted(next);
    // apply immediately
    applyMute(next);
  };

  return (
    // ✅ critical: forces native VideoView remount when uri changes / rows recycle
    <Pressable onPress={onToggleMute} disabled={!allowTapToToggleMute} style={style} key={uri}>
      <VideoView
        player={player}
        style={{ flex: 1 }}
        nativeControls={false}
        contentFit="cover"
        surfaceType="textureView"
      />

      {allowTapToToggleMute ? (
        <View
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            paddingHorizontal: 8,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: 'rgba(0,0,0,0.55)',
          }}
        >
          <Text style={{ color: 'white', fontSize: 11, fontWeight: '600' }}>
            {muted ? '🔇' : '🔊'}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
