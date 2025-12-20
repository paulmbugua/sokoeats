/* eslint-disable prettier/prettier */
// apps/mobile/src/components/CourseReadingPanel.native.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import tw from '../../tailwind';

/* ------------------------------- types ------------------------------- */

type Status = 'Not Started' | 'In Progress' | 'Completed';

export type SyllabusItem = {
  week: number;
  topic?: string;
  assignment?: string;
  videoUrl?: string;
  notesUrl?: string;
};

type Props = {
  courseId: string;
  week?: number | null;
  item?: SyllabusItem | null;
  status?: Status | null;
  onSetStatus?: (next: Status) => Promise<void> | void;
};

/* ------------------------------ helpers ------------------------------ */

const isMp4 = (url?: string) => !!url && /\.mp4(\?|$)/i.test(url || '');
const isYouTube = (url?: string) => !!url && /(youtube\.com|youtu\.be)/i.test(url || '');
const isVimeo = (url?: string) => !!url && /vimeo\.com/i.test(url || '');

function ytIdFromUrl(input = ''): string {
  if (!input) return '';
  try {
    const u = new URL(input);
    const host = u.hostname.toLowerCase();
    if (host.includes('youtu.be')) return u.pathname.replace(/^\//, '');
    if (host.includes('youtube.com')) {
      if (u.pathname.startsWith('/embed/')) return (u.pathname.split('/').pop() || '').trim();
      return (u.searchParams.get('v') || '').trim();
    }
  } catch {
    // not a URL — assume already an ID
    return input;
  }
  return '';
}

function vimeoIdFromUrl(input = ''): string {
  if (!input) return '';
  const m = input.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  return m?.[1] || '';
}

/** Small progress bar */
const ProgressBar: React.FC<{ pct: number }> = ({ pct }) => (
  <View style={tw`h-2 w-full rounded bg-gray-200 overflow-hidden`}>
    <View style={[tw`h-2 bg-[#3d99f5]`, { width: `${Math.max(0, Math.min(100, pct))}%` }]} />
  </View>
);

/** Theme-aware card */
const Card: React.FC<{ title?: string; children?: React.ReactNode; style?: any }> = ({
  title,
  children,
  style,
}) => (
  <View style={[tw`rounded-2xl border border-gray-200 bg-white p-4`, style]}>
    {!!title && <Text style={tw`text-lg font-semibold mb-3`}>{title}</Text>}
    {children}
  </View>
);

/* ----------------------------- VideoGate ----------------------------- */
/**
 * - MP4: inline VideoView (expo-video) with precise progress
 * - YouTube/Vimeo: inline WebView using official JS APIs for precise progress
 * - Other URLs: open externally; coarse timer (4 min @ 80%)
 */
const VideoGate: React.FC<{
  url: string;
  onSatisfied: () => void;
}> = ({ url, onSatisfied }) => {
  const requiredPct = 80;

  const [watchedPct, setWatchedPct] = useState(0);
  const satisfiedRef = useRef(false);
  const [openLarge, setOpenLarge] = useState(false);

  const mp4 = isMp4(url);
  const yt = isYouTube(url);
  const vimeo = isVimeo(url);
  const externalOnly = !mp4 && !yt && !vimeo;

  /* ---------- MP4 via expo-video ---------- */
  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 1; // seconds
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await player.pause();
        await player.replace(mp4 ? url : null);
      } catch {
        /* ignore */
      }
      return () => {
        cancelled = true;
      };
    })();
  }, [url, mp4, player]);

  const { currentTime = 0, duration = 0 } = useEvent(player, 'timeUpdate', {
    currentTime: 0,
    duration: 0,
  } as any) as any;

  useEffect(() => {
    if (!mp4 || !duration) return;
    const pct = Math.min(100, Math.round((currentTime / duration) * 100));
    setWatchedPct(pct);
    if (!satisfiedRef.current && pct >= requiredPct) {
      satisfiedRef.current = true;
      onSatisfied();
    }
  }, [currentTime, duration, mp4, onSatisfied]);

  /* ---------- YouTube & Vimeo via WebView ---------- */

  const ytId = useMemo(() => (yt ? ytIdFromUrl(url) : ''), [yt, url]);
  const vimeoId = useMemo(() => (vimeo ? vimeoIdFromUrl(url) : ''), [vimeo, url]);

  const onWebMessage = useCallback(
    (e: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(e.nativeEvent.data || '{}');
        if (data?.type === 'progress') {
          const pct = Math.min(100, Math.round(Number(data.pct) || 0));
          setWatchedPct(pct);
          if (!satisfiedRef.current && pct >= requiredPct) {
            satisfiedRef.current = true;
            onSatisfied();
          }
        }
        if (data?.type === 'ended') {
          setWatchedPct(100);
          if (!satisfiedRef.current) {
            satisfiedRef.current = true;
            onSatisfied();
          }
        }
      } catch {
        // ignore bad messages
      }
    },
    [onSatisfied]
  );

  // YouTube HTML (IFrame API)
  const ytHtml = useMemo(() => {
    if (!ytId) return '';
    return `
<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>html,body,#player{margin:0;padding:0;height:100%;background:#000}</style></head>
<body>
  <div id="player"></div>
  <script>
    var tag=document.createElement('script'); tag.src="https://www.youtube.com/iframe_api";
    var firstScriptTag=document.getElementsByTagName('script')[0]; firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    var player;
    function onYouTubeIframeAPIReady(){
      player=new YT.Player('player',{
        videoId:'${ytId}',
        playerVars:{playsinline:1,rel:0,modestbranding:1},
        events:{
          onReady:function(e){
            setInterval(function(){
              try{
                var cur=e.target.getCurrentTime()||0;
                var dur=e.target.getDuration()||0;
                var pct= dur>0 ? Math.round(cur/dur*100) : 0;
                window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type:'progress',cur:cur,dur:dur,pct:pct}));
              }catch(err){}
            },1000);
          },
          onStateChange:function(e){
            if(e && e.data===0){
              var dur = player && player.getDuration ? player.getDuration()||0 : 0;
              window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type:'ended',dur:dur}));
            }
          }
        }
      });
    }
  </script>
</body></html>`;
  }, [ytId]);

  // Vimeo HTML (Player API)
  const vimeoHtml = useMemo(() => {
    if (!vimeoId) return '';
    return `
<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>html,body{margin:0;padding:0;height:100%;background:#000}#wrap{position:relative;width:100%;height:100%}iframe{position:absolute;inset:0;width:100%;height:100%}</style></head>
<body>
  <div id="wrap">
    <iframe id="vimeo" src="https://player.vimeo.com/video/${vimeoId}?playsinline=1&transparent=0" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
  </div>
  <script src="https://player.vimeo.com/api/player.js"></script>
  <script>
    (function(){
      var iframe = document.getElementById('vimeo');
      var player = new Vimeo.Player(iframe);
      player.on('timeupdate', function(data){
        try{
          var cur = data.seconds || 0;
          var dur = data.duration || 0;
          var pct = dur>0 ? Math.round(cur/dur*100) : 0;
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type:'progress',cur:cur,dur:dur,pct:pct}));
        }catch(e){}
      });
      player.on('ended', function(){
        try{
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type:'ended'}));
        }catch(e){}
      });
    })();
  </script>
</body></html>`;
  }, [vimeoId]);

  /* ---------- External (fallback / other providers) ---------- */
  const NON_MP4_TOTAL = 240; // 4 minutes
  const NON_MP4_REQUIRED = Math.round((requiredPct / 100) * NON_MP4_TOTAL); // 192s
  const [coarseElapsed, setCoarseElapsed] = useState(0);

  useEffect(() => {
    if (!externalOnly) return;
    let id: any = null;
    if (coarseElapsed > 0 && coarseElapsed < NON_MP4_REQUIRED) {
      id = setInterval(() => setCoarseElapsed((s) => s + 1), 1000);
    }
    if (coarseElapsed >= NON_MP4_REQUIRED && !satisfiedRef.current) {
      setWatchedPct(100);
      satisfiedRef.current = true;
      onSatisfied();
    }
    return () => id && clearInterval(id);
  }, [externalOnly, coarseElapsed, onSatisfied]);

  const startExternal = async () => {
    try {
      await Linking.openURL(url);
      if (coarseElapsed === 0) setCoarseElapsed(1);
    } catch {
      /* no-op */
    }
  };

  const pctLabel = externalOnly
    ? `Time: ${coarseElapsed}s / ${NON_MP4_REQUIRED}s (~80%)`
    : `Watched: ${watchedPct}% • need ${requiredPct}%`;

  // Shared container for players
  const containerStyle = openLarge
    ? [tw`mt-3 rounded-xl overflow-hidden bg-black`, { aspectRatio: 16 / 9 }]
    : [tw`rounded-lg overflow-hidden bg-black`, { aspectRatio: 16 / 9 }];

  return (
    <Card title="Video">
      {/* MP4 */}
      {mp4 && (
        <View>
          <View style={containerStyle}>
            <VideoView
              player={player}
              style={tw`w-full h-full`}
              nativeControls
              allowsFullscreen
              allowsPictureInPicture
              contentFit="contain"
            />
          </View>

          <View style={tw`mt-3`}>
            <ProgressBar pct={watchedPct} />
            <Text style={tw`mt-1 text-xs text-gray-600`}>{pctLabel}</Text>
          </View>

          <View style={tw`flex-row items-center mt-2`}>
            <TouchableOpacity
              onPress={() => setOpenLarge((s) => !s)}
              style={tw`self-start rounded-xl h-9 px-3 bg-[#e7edf4] justify-center`}
            >
              <Text style={tw`text-sm font-semibold`}>
                {openLarge ? 'Hide large player' : 'Open large player'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => (player.playing ? player.pause() : player.play())}
              style={tw`ml-2 self-start rounded-xl h-9 px-3 bg-gray-200 justify-center`}
            >
              <Text style={tw`text-sm font-semibold`}>{player.playing ? 'Pause' : 'Play'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* YouTube */}
      {yt && !!ytId && (
        <View>
          <View style={[tw`rounded-lg overflow-hidden bg-black`, { aspectRatio: 16 / 9 }]}>
            <WebView
              originWhitelist={['*']}
              source={{ html: ytHtml }}
              onMessage={onWebMessage}
              allowsFullscreenVideo
              javaScriptEnabled
              automaticallyAdjustContentInsets={false}
              mediaPlaybackRequiresUserAction={false}
            />
          </View>

          <View style={tw`mt-3`}>
            <ProgressBar pct={watchedPct} />
            <Text style={tw`mt-1 text-xs text-gray-600`}>
              Watched: {watchedPct}% • need {requiredPct}%
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => Linking.openURL(url)}
            style={tw`mt-2 self-start rounded-xl h-9 px-3 bg-gray-200 justify-center`}
          >
            <Text style={tw`text-sm font-semibold`}>Open in YouTube app</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Vimeo */}
      {vimeo && !!vimeoId && (
        <View>
          <View style={[tw`rounded-lg overflow-hidden bg-black`, { aspectRatio: 16 / 9 }]}>
            <WebView
              originWhitelist={['*']}
              source={{ html: vimeoHtml }}
              onMessage={onWebMessage}
              allowsFullscreenVideo
              javaScriptEnabled
              automaticallyAdjustContentInsets={false}
              mediaPlaybackRequiresUserAction={false}
            />
          </View>

          <View style={tw`mt-3`}>
            <ProgressBar pct={watchedPct} />
            <Text style={tw`mt-1 text-xs text-gray-600`}>
              Watched: {watchedPct}% • need {requiredPct}%
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => Linking.openURL(url)}
            style={tw`mt-2 self-start rounded-xl h-9 px-3 bg-gray-200 justify-center`}
          >
            <Text style={tw`text-sm font-semibold`}>Open in Vimeo</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* External only (other providers) */}
      {externalOnly && (
        <View>
          <TouchableOpacity
            onPress={startExternal}
            style={tw`rounded-xl h-11 px-4 bg-[#3d99f5] justify-center items-center`}
          >
            <Text style={tw`text-white font-semibold`}>Open video</Text>
          </TouchableOpacity>

          <View style={tw`mt-3`}>
            <ProgressBar
              pct={Math.min(100, Math.round((coarseElapsed / NON_MP4_REQUIRED) * 100))}
            />
            <Text style={tw`mt-1 text-xs text-gray-600`}>{pctLabel}</Text>
          </View>

          <Text style={tw`mt-2 text-xs text-gray-500`}>
            Video opens in your browser/app. Keep it playing; this timer will reach ~80%.
          </Text>
        </View>
      )}
    </Card>
  );
};

/* ----------------------------- NotesGate ------------------------------ */
/** Opens notes (PDF/image) externally, then requires 30s of dwell time */
const NotesGate: React.FC<{
  url: string;
  onSatisfied: () => void;
}> = ({ url, onSatisfied }) => {
  const requiredSeconds = 30;
  const [downloaded, setDownloaded] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let id: any = null;
    if (downloaded && elapsed < requiredSeconds) {
      id = setInterval(() => setElapsed((s) => s + 1), 1000);
    }
    return () => id && clearInterval(id);
  }, [downloaded, elapsed]);

  useEffect(() => {
    if (downloaded && elapsed >= requiredSeconds) onSatisfied();
  }, [downloaded, elapsed, onSatisfied]);

  const onOpen = async () => {
    try {
      await Linking.openURL(url);
      setDownloaded(true);
    } catch {
      /* no-op */
    }
  };

  return (
    <Card title="Notes / PDF">
      <View style={tw`flex-col gap-2`}>
        <Text style={tw`text-sm text-gray-600`}>Please download and review the notes.</Text>
        <TouchableOpacity
          onPress={onOpen}
          style={tw`self-start rounded-xl h-9 px-3 bg-[#e7edf4] justify-center`}
        >
          <Text style={tw`text-sm font-semibold`}>Open notes</Text>
        </TouchableOpacity>
        <Text style={tw`text-xs text-gray-600`}>
          Time on step: {elapsed}s / {requiredSeconds}s{' '}
          {downloaded ? '• opened ✔' : '• not opened'}
        </Text>
      </View>
    </Card>
  );
};

/* --------------------------- AssignmentGate --------------------------- */
/** Simple dwell requirement (60s) after reading the task text */
const AssignmentGate: React.FC<{
  text?: string;
  onSatisfied: () => void;
}> = ({ text, onSatisfied }) => {
  const requiredSeconds = 60;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (elapsed >= requiredSeconds) onSatisfied();
  }, [elapsed, onSatisfied]);

  return (
    <Card title="Assignment">
      <Text style={tw`text-sm text-gray-800`}>
        {text?.trim() || 'Work through this week’s task before marking complete.'}
      </Text>
      <Text style={tw`mt-2 text-xs text-gray-600`}>
        Spend at least {requiredSeconds}s on this step. Time on step: {elapsed}s
      </Text>
    </Card>
  );
};

/* ---------------------------- Main component --------------------------- */

const CourseReadingPanelNative: React.FC<Props> = ({
  courseId,
  week,
  item,
  status,
  onSetStatus,
}) => {
  const safeStatus: Status = status ?? 'Not Started';
  const safeItem: SyllabusItem | null = item ?? null;
  const weekLabel = safeItem?.week ?? week ?? 0;

  // step gates
  const [videoOk, setVideoOk] = useState(false);
  const [notesOk, setNotesOk] = useState(false);
  const [assignmentOk, setAssignmentOk] = useState(false);

  // mark "In Progress" on first mount if not started
  useEffect(() => {
    if (safeStatus === 'Not Started' && onSetStatus) {
      void onSetStatus('In Progress');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const needVideo = !!safeItem?.videoUrl;
  const needNotes = !!safeItem?.notesUrl;
  const needAssign = !!(safeItem?.assignment && safeItem.assignment.trim().length > 0);

  const canComplete =
    (needVideo ? videoOk : true) &&
    (needNotes ? notesOk : true) &&
    (needAssign ? assignmentOk : true);

  const onMarkComplete = async () => {
    if (!canComplete || !onSetStatus) return;
    await onSetStatus('Completed');
  };

  // placeholder while item loads / absent
  if (!safeItem) {
    return (
      <ScrollView contentContainerStyle={tw`p-4`}>
        <View style={tw`flex-row items-center justify-between mb-3`}>
          <View>
            <Text style={tw`text-xl font-bold`}>Week {weekLabel}: Loading…</Text>
            <Text style={tw`text-sm text-gray-600`}>We’re fetching this week’s resources.</Text>
          </View>
          <View style={tw`rounded-lg h-8 px-3 bg-gray-200 justify-center`}>
            <Text style={tw`text-xs font-semibold`}>{safeStatus}</Text>
          </View>
        </View>
        <Card>
          <Text style={tw`text-sm text-gray-600`}>
            No week data yet. If this persists, check your progress API route or the enrollment/Week
            ID.
          </Text>
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={tw`p-4`}>
      {/* Header */}
      <View style={tw`flex-row items-start justify-between mb-3`}>
        <View style={tw`pr-3 flex-1`}>
          <Text style={tw`text-xl font-bold`}>
            Week {weekLabel}: {safeItem.topic || 'Untitled'}
          </Text>
          <Text style={tw`text-sm text-gray-600`}>Work through the resources below.</Text>
        </View>

        <View style={tw`flex-row items-center`}>
          <View style={tw`rounded-lg h-8 px-3 bg-gray-200 justify-center mr-2`}>
            <Text style={tw`text-xs font-semibold`}>{safeStatus}</Text>
          </View>
          <TouchableOpacity
            disabled={!canComplete || safeStatus === 'Completed' || !onSetStatus}
            onPress={onMarkComplete}
            style={tw.style(
              'rounded-xl h-9 px-4 justify-center',
              !canComplete || safeStatus === 'Completed' || !onSetStatus
                ? 'bg-gray-200'
                : 'bg-[#3d99f5]'
            )}
          >
            <Text
              style={tw.style(
                'text-sm font-semibold',
                !canComplete || safeStatus === 'Completed' || !onSetStatus
                  ? 'text-gray-500'
                  : 'text-white'
              )}
            >
              {safeStatus === 'Completed' ? 'Completed' : 'Mark week as complete'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Resources */}
      {!!safeItem.videoUrl && (
        <View style={tw`mb-4`}>
          <VideoGate url={safeItem.videoUrl!} onSatisfied={() => setVideoOk(true)} />
        </View>
      )}

      {!!safeItem.notesUrl && (
        <View style={tw`mb-4`}>
          <NotesGate url={safeItem.notesUrl!} onSatisfied={() => setNotesOk(true)} />
        </View>
      )}

      {!!(safeItem.assignment && safeItem.assignment.trim().length > 0) && (
        <View style={tw`mb-4`}>
          <AssignmentGate text={safeItem.assignment} onSatisfied={() => setAssignmentOk(true)} />
        </View>
      )}

      {/* Empty state if no resources */}
      {!safeItem.videoUrl &&
        !safeItem.notesUrl &&
        !(safeItem.assignment && safeItem.assignment.trim().length > 0) && (
          <Card>
            <Text style={tw`text-sm text-gray-600`}>
              No resources were added for this week. You can still mark it complete when ready.
            </Text>
          </Card>
        )}
    </ScrollView>
  );
};

export default CourseReadingPanelNative;
