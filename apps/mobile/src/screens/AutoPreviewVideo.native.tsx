import React, { useEffect } from 'react';
import { useVideoPlayer, VideoView } from 'expo-video';

type Props = {
  uri: string;
  shouldPlay: boolean;
  style?: any;
};

export default function AutoPreviewVideo({ uri, shouldPlay, style }: Props) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;

  });

  useEffect(() => {
    if (!player) return;
    if (shouldPlay) player.play();
    else player.pause();

    return () => {
      try {
        player.pause();
      } catch {}
    };
  }, [player, shouldPlay]);

  return (
    <VideoView
      player={player}
      style={style}
      nativeControls={false}
      contentFit="cover"
      // safer on Android if you ever overlap surfaces
      surfaceType="textureView"
    />
  );
}
