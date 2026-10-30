import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import Icon from './Icon';
import { api } from '../services/api';
import { claimSpeech, ownsSpeech, releaseSpeech } from '../services/speechSession';

const LANG_KEY = 'kinbech.voiceLang';
const STT_LANG = { ne: 'ne-NP', hi: 'hi-IN', en: 'en-IN' };

// The phone waits ~2 s of silence before a final result; this much pause after words is enough.
const SPEECH_PAUSE_MS = 700;
// After the phone hears the buyer stop (its own end-of-speech), a short wait: the last word can come ~0.4 s later.
const SPEECH_END_MS = 400;
// Listening with nothing heard this long: stop and let the buyer tap to try again.
const QUIET_MS = 9000;

/**
 * One silent voice search while `open`: listens at once and never speaks. When the buyer stops, the AI turns the
 * words into a search or an app action, then `onResult(text, searchPromise)` (resolves to it, or null when the AI
 * could not answer). Nothing heard: phase "retry" until `listenAgain()`. `onFail('mic' | 'error')` when the
 * microphone cannot be used. Phases: "listening", "searching", "retry", "idle". `heard` is the live words.
 */
export function useVoiceSearch({ open, area = 'explore', places, onResult, onFail }) {
  const [phase, setPhase] = useState('idle');
  const [heard, setHeard] = useState('');
  const level = useSharedValue(0);

  const ownerRef = useRef(Math.random());
  const runningRef = useRef(false);
  const langRef = useRef('ne');
  const fallbackRef = useRef(false);
  const micGrantedRef = useRef(false);
  const heardRef = useRef('');
  // Words of the parts the recognizer already finished; a pause mid-sentence ends a part, not the search.
  const doneWordsRef = useRef('');
  const handledRef = useRef(false);
  const speechEndedRef = useRef(false);
  const startedRef = useRef(false);
  const startTimerRef = useRef(null);
  const pauseTimerRef = useRef(null);
  const quietTimerRef = useRef(null);
  const callbacksRef = useRef({ area, places, onResult, onFail });
  callbacksRef.current = { area, places, onResult, onFail };

  useEffect(() => {
    AsyncStorage.getItem(LANG_KEY).then((saved) => {
      if (STT_LANG[saved]) langRef.current = saved;
    }).catch(() => {});
  }, []);

  const mine = () => ownsSpeech(ownerRef.current);

  const stopRecognition = useCallback(() => {
    clearTimeout(startTimerRef.current);
    clearTimeout(pauseTimerRef.current);
    clearTimeout(quietTimerRef.current);
    if (!ownsSpeech(ownerRef.current)) return;
    releaseSpeech(ownerRef.current);
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      /* already stopped */
    }
  }, []);

  const toRetry = useCallback(() => {
    stopRecognition();
    level.value = withTiming(0, { duration: 150 });
    if (runningRef.current) setPhase('retry');
  }, [level, stopRecognition]);

  /** True once the microphone may be used; asks for it the first time. */
  const micReady = useCallback(async () => {
    if (micGrantedRef.current) return true;
    // Asking again opens Android's (invisible) permission screen, which pauses the app.
    const current = await ExpoSpeechRecognitionModule.getPermissionsAsync();
    const permission = current.granted ? current : await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!runningRef.current) return false;
    if (!permission.granted) {
      runningRef.current = false;
      callbacksRef.current.onFail?.('mic');
      return false;
    }
    micGrantedRef.current = true;
    return true;
  }, []);

  const showListening = useCallback(() => {
    setPhase('listening');
    clearTimeout(quietTimerRef.current);
    quietTimerRef.current = setTimeout(() => {
      if (mine() && !heardRef.current) toRetry();
    }, QUIET_MS);
  }, [toRetry]);

  const startListening = useCallback(async () => {
    if (!runningRef.current) return;
    try {
      if (!(await micReady()) || !runningRef.current) return;
      claimSpeech(ownerRef.current);
      heardRef.current = '';
      doneWordsRef.current = '';
      setHeard('');
      handledRef.current = false;
      startedRef.current = false;
      speechEndedRef.current = false;
      ExpoSpeechRecognitionModule.start({
        lang: fallbackRef.current ? 'en-US' : STT_LANG[langRef.current],
        interimResults: true,
        continuous: true,
        volumeChangeEventOptions: { enabled: true, intervalMillis: 120 },
        androidIntentOptions: { EXTRA_LANGUAGE_MODEL: 'free_form' },
      });
      clearTimeout(startTimerRef.current);
      startTimerRef.current = setTimeout(() => {
        if (ownsSpeech(ownerRef.current) && !startedRef.current) toRetry();
      }, 8000);
    } catch {
      releaseSpeech(ownerRef.current);
      runningRef.current = false;
      callbacksRef.current.onFail?.('error');
    }
  }, [micReady, toRetry]);

  const finishHeard = useCallback(() => {
    clearTimeout(pauseTimerRef.current);
    if (handledRef.current) return;
    handledRef.current = true;
    const text = heardRef.current;
    stopRecognition();
    level.value = withTiming(0, { duration: 150 });
    if (!text || !runningRef.current) {
      toRetry();
      return;
    }
    setPhase('searching');
    const { area: searchArea, places: appPlaces } = callbacksRef.current;
    const search = api.voiceQuery({ text, area: searchArea, places: appPlaces })
      .then((res) => res?.data?.search || null)
      .catch(() => null);
    runningRef.current = false;
    callbacksRef.current.onResult?.(text, search);
  }, [level, stopRecognition, toRetry]);

  // An `end` from the session before a restart can arrive late; only a started session may finish.
  // Listening shows only once the microphone is really on, so the first words are not lost.
  useSpeechRecognitionEvent('start', () => {
    if (!mine()) return;
    startedRef.current = true;
    showListening();
  });
  useSpeechRecognitionEvent('speechend', () => {
    if (!mine()) return;
    speechEndedRef.current = true;
    if (!heardRef.current) return;
    clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = setTimeout(finishHeard, SPEECH_END_MS);
  });
  useSpeechRecognitionEvent('result', (event) => {
    if (!mine()) return;
    const text = String(event.results?.[0]?.transcript || '').replace(/\s+/g, ' ').trim();
    // Each part comes alone ("mobile aur", then "dustbin dikhao"), or on some phones with the parts before it.
    const done = doneWordsRef.current;
    const all = !done || text.startsWith(done) ? text : `${done} ${text}`.trim();
    if (event.isFinal) doneWordsRef.current = all;
    if (all && all !== heardRef.current) {
      heardRef.current = all;
      setHeard(all);
      clearTimeout(quietTimerRef.current);
    }
    clearTimeout(pauseTimerRef.current);
    if (event.isFinal && heardRef.current) {
      pauseTimerRef.current = setTimeout(finishHeard, SPEECH_END_MS);
      return;
    }
    if (heardRef.current) {
      pauseTimerRef.current = setTimeout(finishHeard, speechEndedRef.current ? SPEECH_END_MS : SPEECH_PAUSE_MS);
    }
  });
  useSpeechRecognitionEvent('end', () => {
    if (!mine() || !startedRef.current) return;
    releaseSpeech(ownerRef.current);
    finishHeard();
  });
  useSpeechRecognitionEvent('volumechange', (event) => {
    if (!mine()) return;
    // Silence reads about -2..0 and a voice 7..10.
    const value = Math.max(0, Math.min(1, (Number(event.value) + 2) / 12));
    level.value = withTiming(value, { duration: 110 });
  });
  useSpeechRecognitionEvent('error', (event) => {
    if (!mine()) return;
    if (event.error === 'aborted' && !startedRef.current) return;
    clearTimeout(startTimerRef.current);
    clearTimeout(pauseTimerRef.current);
    releaseSpeech(ownerRef.current);
    if (!runningRef.current || handledRef.current) return;
    // The recognizer often drops (network) right at the end of a sentence; what it heard is still used.
    if (heardRef.current && event.error !== 'not-allowed') {
      finishHeard();
      return;
    }
    handledRef.current = true;
    if (event.error === 'language-not-supported' && !fallbackRef.current) {
      fallbackRef.current = true;
      startListening();
      return;
    }
    if (event.error === 'not-allowed') {
      micGrantedRef.current = false;
      runningRef.current = false;
      callbacksRef.current.onFail?.('mic');
      return;
    }
    toRetry();
  });

  useEffect(() => {
    if (!open) {
      runningRef.current = false;
      stopRecognition();
      level.value = 0;
      setPhase('idle');
      setHeard('');
      return;
    }
    runningRef.current = true;
    fallbackRef.current = false;
    setPhase('listening');
    // The microphone goes on the moment the card opens.
    micReady().then((ready) => {
      if (ready && runningRef.current) startListening();
    });
  }, [level, micReady, open, startListening, stopRecognition]);

  useEffect(() => () => {
    runningRef.current = false;
    clearTimeout(startTimerRef.current);
    clearTimeout(pauseTimerRef.current);
    clearTimeout(quietTimerRef.current);
    if (ownsSpeech(ownerRef.current)) {
      releaseSpeech(ownerRef.current);
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        /* already stopped */
      }
    }
  }, []);

  /** Tapping the orb after "retry" listens again. */
  const listenAgain = useCallback(() => {
    if (!open) return;
    runningRef.current = true;
    startListening();
  }, [open, startListening]);

  return { phase: open ? phase : 'idle', heard, level, listenAgain };
}

/** Small gradient voice button inside a search box; it opens voice search. */
export function VoiceTalkButton({ colors, onPress, size = 32 }) {
  const gradient = colors.gradient || [colors.primary, colors.primary];
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel="Search by voice">
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="speaker" size={Math.round(size * 0.53)} color="#FFFFFF" />
        </LinearGradient>
      </View>
    </Pressable>
  );
}
