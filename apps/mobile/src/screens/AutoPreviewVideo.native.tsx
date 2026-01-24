// apps/mobile/src/screens/AutoPreviewVideo.native.tsx
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

type Props = {
  uri: string;
  shouldPlay: boolean;
  style?: any;
};

export default function AutoPreviewVideo({ uri, shouldPlay, style }: Props) {
  // ✅ avoid creating a player with an empty uri
  if (!uri) return null;

  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    // ✅ expo-video uses isMuted (most versions)
    // if your version only supports muted, switch back — but try isMuted first.
    // @ts-ignore
    p.isMuted = true;
  });

  useEffect(() => {
    if (!player) return;

    try {
      if (shouldPlay) player.play();
      else player.pause();
    } catch {}

    return () => {
      try {
        player.pause();
      } catch {}
    };
  }, [player, shouldPlay]);

  return (
    // ✅ critical: forces native VideoView remount when uri changes / rows recycle
    <View key={uri} style={style}>
      <VideoView
        player={player}
        style={{ flex: 1 }}
        nativeControls={false}
        contentFit="cover"
        surfaceType="textureView"
      />
    </View>
  );
}
