import { Component, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule,
  RecordingPresets,
  createAudioPlayer,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { resetAudioMode } from '../services/sounds';

const MAX_SECONDS = 120;
let activePlayer = null;

class VoiceErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFailed?.(
      'Voice recording is not ready on this app build. Rebuild the Android app once, then try the mic again.'
    );
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function Recorder({ captureRef, onTick, onFailed }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const startedRef = useRef(false);
  const onFailedRef = useRef(onFailed);
  const onTickRef = useRef(onTick);
  onFailedRef.current = onFailed;
  onTickRef.current = onTick;

  useEffect(() => {
    onTickRef.current?.(state.durationMillis || 0);
  }, [state.durationMillis]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const permission = await AudioModule.requestRecordingPermissionsAsync();
        if (!permission?.granted) {
          onFailedRef.current?.('Allow microphone access to record a voice message.');
          return;
        }
        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: true,
          shouldPlayInBackground: false,
        });
        if (cancelled) return;
        await recorder.prepareToRecordAsync();
        recorder.record({ forDuration: MAX_SECONDS });
        startedRef.current = true;
      } catch (error) {
        onFailedRef.current?.(error?.message || 'Could not start the recording.');
      }
    })();

    return () => {
      cancelled = true;
      if (startedRef.current) {
        recorder.stop().catch(() => {});
        startedRef.current = false;
      }
      setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
        interruptionMode: 'mixWithOthers',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      }).catch(() => {});
      resetAudioMode();
    };
  }, [recorder]);

  useImperativeHandle(captureRef, () => ({
    async finish() {
      const status = typeof recorder.getStatus === 'function' ? recorder.getStatus() : {};
      const millis = status?.durationMillis || Math.round((recorder.currentTime || 0) * 1000);
      if (startedRef.current) {
        await recorder.stop();
        startedRef.current = false;
      }
      if (!recorder.uri || millis < 700) {
        return { uri: '', durationSec: 0 };
      }
      return {
        uri: recorder.uri,
        durationSec: Math.min(MAX_SECONDS, Math.max(1, Math.round(millis / 1000))),
      };
    },
    async cancel() {
      if (startedRef.current) {
        await recorder.stop().catch(() => {});
        startedRef.current = false;
      }
    },
  }));

  return null;
}

export default function VoiceCapture(props) {
  return (
    <VoiceErrorBoundary onFailed={props.onFailed}>
      <Recorder {...props} />
    </VoiceErrorBoundary>
  );
}

export function VoiceBubble({ uri, durationLabel, styles }) {
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef(null);

  useEffect(
    () => () => {
      const player = playerRef.current;
      if (!player) return;
      try {
        player.pause();
        player.release?.();
      } catch {
        /* already released */
      }
      if (activePlayer === player) activePlayer = null;
    },
    []
  );

  const toggle = () => {
    if (!uri) return;
    try {
      if (playing && playerRef.current) {
        playerRef.current.pause();
        setPlaying(false);
        return;
      }
      if (activePlayer && activePlayer !== playerRef.current) {
        try {
          activePlayer.pause();
        } catch {
          /* ignore */
        }
      }
      if (!playerRef.current) {
        const player = createAudioPlayer(uri);
        player.addListener('playbackStatusUpdate', (status) => {
          if (status?.didJustFinish) {
            setPlaying(false);
            try {
              player.seekTo(0);
            } catch {
              /* ignore */
            }
          }
        });
        playerRef.current = player;
      } else {
        playerRef.current.seekTo(0);
      }
      activePlayer = playerRef.current;
      playerRef.current.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };

  return (
    <Pressable onPress={toggle} style={styles.voiceRow}>
      <View style={styles.voicePlay}>
        <Ionicons name={playing ? 'pause' : 'play'} size={18} color="#FFFFFF" />
      </View>
      <View style={styles.voiceTrack}>
        {Array.from({ length: 16 }, (_, index) => (
          <View key={index} style={[styles.voiceBar, { height: 4 + ((index * 7) % 12) }]} />
        ))}
      </View>
      <Text style={styles.voiceDuration}>{durationLabel || '0:00'}</Text>
    </Pressable>
  );
}
