import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import Reanimated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Icon from './Icon';
import { api } from '../services/api';
import { claimSpeech, ownsSpeech, releaseSpeech } from '../services/speechSession';

const LANG_KEY = 'kinbech.voiceLang';
const STT_LANG = { ne: 'ne-NP', hi: 'hi-IN', en: 'en-IN' };
const MAX_FAILS = 4;

let voicesPromise = null;

function loadVoices() {
  if (!voicesPromise) voicesPromise = Speech.getAvailableVoicesAsync().catch(() => []);
  return voicesPromise;
}

const voiceLang = (voice) => String(voice.language || '').replace('_', '-').toLowerCase();

/** The phone's most natural voice for this language: enhanced quality first, then network voices. */
async function phoneVoice(lang) {
  const voices = await loadVoices();
  const has = (code) => voices.some((voice) => voiceLang(voice).startsWith(code));
  let language = 'hi-IN';
  if (lang === 'ne') language = !voices.length || has('ne') ? 'ne-NP' : 'hi-IN';
  if (lang === 'en') language = has('en-in') ? 'en-IN' : 'en-US';
  const score = (voice) => (voice.quality === 'Enhanced' ? 2 : 0) + (/network/i.test(voice.identifier || '') ? 1 : 0);
  const best = voices
    .filter((voice) => voiceLang(voice) === language.toLowerCase())
    .sort((a, b) => score(b) - score(a))[0];
  return { language, voice: best?.identifier };
}

// After the natural voice fails, answers use the phone's voice for a short while before trying again.
const NATURAL_PAUSE_MS = 60 * 1000;
// The phone waits ~2 s of silence before a final result; this much pause after words is enough.
const SPEECH_PAUSE_MS = 700;
// After the phone hears the buyer stop (its own end-of-speech), a short wait: the last word can come ~0.4 s later.
const SPEECH_END_MS = 400;
// Upper bound for a streamed reply (about 11 spoken characters a second), in case the player never reports the end.
const speechSeconds = (text) => String(text || '').length / 11 + 3;

// When the buyer stays quiet, the chat says a short "still here" line after each of these waits
// (counted from the end of whatever it last said); still quiet after the last one, it says a
// friendly goodbye after GOODBYE_AFTER_MS and closes.
const NUDGE_AFTER_MS = [20000, 12000];
const GOODBYE_AFTER_MS = 8000;

// The hello and "still here" lines are recorded ahead of time and kept on the phone, so they play at once.
const CLIP_KEY = 'kinbech.voiceClip.';
const clipJobs = new Map();

/** Records the next `kind` line ("greeting", "nudge" or "goodbye", random words with the buyer's name) in the background. */
export function prepareVoiceClip(kind = 'greeting', lang = 'ne') {
  const name = `${kind}-${lang}`;
  if (clipJobs.has(name)) return clipJobs.get(name);
  const job = (async () => {
    try {
      const file = new File(Paths.cache, `kinbech-${name}.wav`);
      if (file.exists && await AsyncStorage.getItem(CLIP_KEY + name)) return;
      const res = await api.voiceGreeting({ kind, lang });
      const id = res?.data?.speechId;
      const url = id ? api.voiceAudioUrl(id) : '';
      if (!url) return;
      await File.downloadFileAsync(`${url}?full=1`, file, { idempotent: true });
      if (file.size > 2000) await AsyncStorage.setItem(CLIP_KEY + name, res.data.text);
    } catch {
      /* the line is then spoken live */
    } finally {
      clipJobs.delete(name);
    }
  })();
  clipJobs.set(name, job);
  return job;
}

export const prepareVoiceGreeting = () => prepareVoiceClip('greeting', 'ne');

async function takeClip(kind, lang) {
  try {
    const name = `${kind}-${lang}`;
    const text = await AsyncStorage.getItem(CLIP_KEY + name);
    const file = new File(Paths.cache, `kinbech-${name}.wav`);
    if (!text || !file.exists || file.size < 2000) return null;
    await AsyncStorage.removeItem(CLIP_KEY + name);
    return { text, uri: file.uri, seconds: (file.size - 44) / 48000 };
  } catch {
    return null;
  }
}

/**
 * Hands-free voice chat (run once for the whole app by `VoiceHost`). When opened it says hello by name,
 * then while `active` (and not `paused`) it keeps listening (after a quiet while it says it is still there),
 * asks the AI with `getCurrent()` (`{ current, screen }`), lets the app act through `onTurn(turn)`
 * (resolves to `{ act, afterSpeak }` or null), runs `act` (e.g. navigation) right away while it speaks the
 * answer (the server adds the real result count), then `afterSpeak` and listens again. Only the user turns it off.
 * `onHeard(text, done)` gets the live words, and `done` once the buyer stops, before the AI answers.
 * `onFail(reason)` fires when it cannot go on ('mic' | 'error' | 'limit'), or 'quiet' after the goodbye.
 */
export function useVoiceChat({ active, paused = false, getCurrent, onHeard, onTurn, onFail }) {
  const [phase, setPhase] = useState('idle');
  const level = useSharedValue(0);

  const ownerRef = useRef(Math.random());
  const runningRef = useRef(false);
  const langRef = useRef('ne');
  const fallbackRef = useRef(false);
  const micGrantedRef = useRef(false);
  const heardRef = useRef('');
  const handledRef = useRef(false);
  const speechEndedRef = useRef(false);
  const startedRef = useRef(false);
  const startTimerRef = useRef(null);
  const retryTimerRef = useRef(null);
  const failsRef = useRef(0);
  const turnRef = useRef(0);
  const speakRef = useRef(0);
  const abortRef = useRef(null);
  const speakAbortRef = useRef(null);
  const playerRef = useRef(null);
  const naturalPauseRef = useRef(0);
  const historyRef = useRef([]);
  const pauseTimerRef = useRef(null);
  const greetedRef = useRef(false);
  const lastActiveRef = useRef(0);
  const nudgesRef = useRef(0);
  const phaseRef = useRef('idle');
  phaseRef.current = phase;
  const callbacksRef = useRef({ getCurrent, onHeard, onTurn, onFail });
  callbacksRef.current = { getCurrent, onHeard, onTurn, onFail };

  useEffect(() => {
    AsyncStorage.getItem(LANG_KEY).then((saved) => {
      if (STT_LANG[saved]) langRef.current = saved;
    }).catch(() => {});
    loadVoices();
  }, []);

  const mine = () => ownsSpeech(ownerRef.current);

  const stopRecognition = useCallback(() => {
    clearTimeout(startTimerRef.current);
    clearTimeout(pauseTimerRef.current);
    if (!ownsSpeech(ownerRef.current)) return;
    releaseSpeech(ownerRef.current);
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      /* already stopped */
    }
  }, []);

  const stopPlayer = useCallback(() => {
    const current = playerRef.current;
    playerRef.current = null;
    if (!current) return;
    clearTimeout(current.timer);
    try {
      current.player.pause();
      current.player.release?.();
    } catch {
      /* already released */
    }
    current.resolve();
  }, []);

  const silence = useCallback(() => {
    speakRef.current += 1;
    speakAbortRef.current?.abort();
    stopPlayer();
    Speech.stop().catch(() => {});
  }, [stopPlayer]);

  const fail = useCallback((reason) => {
    runningRef.current = false;
    callbacksRef.current.onFail?.(reason);
  }, []);

  const startListeningRef = useRef(null);
  const listenSoon = useCallback((delay = 250) => {
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => startListeningRef.current?.(), delay);
  }, []);

  const startListening = useCallback(async () => {
    if (!runningRef.current) return;
    silence();
    try {
      // Asking again opens Android's (invisible) permission screen, which pauses the app every turn.
      if (!micGrantedRef.current) {
        const current = await ExpoSpeechRecognitionModule.getPermissionsAsync();
        const permission = current.granted ? current : await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!runningRef.current) return;
        if (!permission.granted) {
          fail('mic');
          return;
        }
        micGrantedRef.current = true;
      }
      if (!runningRef.current) return;
      claimSpeech(ownerRef.current);
      heardRef.current = '';
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
        if (!ownsSpeech(ownerRef.current) || startedRef.current) return;
        stopRecognition();
        failsRef.current += 1;
        if (failsRef.current >= MAX_FAILS) fail('error');
        else listenSoon(800);
      }, 8000);
    } catch {
      releaseSpeech(ownerRef.current);
      fail('error');
    }
  }, [fail, listenSoon, silence, stopRecognition]);
  startListeningRef.current = startListening;

  const audioModeReady = useRef(false);

  /** Plays a WAV clip; resolves when it ends or is stopped. */
  const playUri = useCallback(async (uri, seconds) => {
    if (!audioModeReady.current) {
      audioModeReady.current = true;
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
        interruptionMode: 'duckOthers',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      }).catch(() => {});
    }
    stopPlayer();
    return new Promise((resolve) => {
      let player;
      try {
        // A forward buffer also makes the (patched) Android player start after 0.5 s of audio, not 2.5 s.
        player = createAudioPlayer(uri, { preferredForwardBufferDuration: 30 });
      } catch {
        resolve();
        return;
      }
      const entry = { player, resolve, timer: null };
      const done = () => {
        if (playerRef.current === entry) stopPlayer();
      };
      // The timer covers a player that never reports the end.
      entry.timer = setTimeout(done, (seconds + 3) * 1000);
      player.addListener('playbackStatusUpdate', (status) => {
        if (status?.didJustFinish) done();
      });
      playerRef.current = entry;
      player.play();
    });
  }, [stopPlayer]);

  /** The phone's own voice, used when the natural voice is not available. */
  const speakPhone = useCallback(async (text, replyLang, id, next) => {
    const { language, voice } = await phoneVoice(replyLang);
    if (id !== speakRef.current || !runningRef.current) return;
    setPhase('speaking');
    Speech.speak(text, {
      language,
      voice,
      rate: replyLang === 'en' ? 1 : 0.95,
      onDone: next,
      onError: next,
    });
  }, []);

  const handleUtterance = useCallback(async (spoken) => {
    const text = String(spoken || '').replace(/\s+/g, ' ').trim();
    if (!text || !runningRef.current) return;
    const turn = turnRef.current + 1;
    turnRef.current = turn;
    const id = speakRef.current + 1;
    speakRef.current = id;
    const live = () => turn === turnRef.current && id === speakRef.current && runningRef.current;
    nudgesRef.current = 0;
    lastActiveRef.current = Date.now();
    setPhase('thinking');

    // Snapshot the screen first: the instant search below changes the list the AI picks from.
    const current = callbacksRef.current.getCurrent?.() || {};
    callbacksRef.current.onHeard?.(text, true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const res = await api.voiceSearch(
      {
        text,
        history: historyRef.current.slice(-8),
        ...current,
        lang: langRef.current,
        speak: Date.now() >= naturalPauseRef.current,
      },
      { signal: controller.signal }
    );
    if (!live() || res?.aborted) return;
    const data = res?.data;
    if (res?.error || !data?.reply) {
      const message = data?.message || res?.error || 'Voice helper is busy. Please try again.';
      speakPhone(message, 'en', id, () => {
        if (!live()) return;
        lastActiveRef.current = Date.now();
        if (res?.status === 429) fail('limit');
        else listenSoon(150);
      });
      return;
    }

    if (STT_LANG[data.lang] && data.lang !== langRef.current) {
      langRef.current = data.lang;
      fallbackRef.current = false;
      AsyncStorage.setItem(LANG_KEY, data.lang).catch(() => {});
      prepareVoiceClip('nudge', data.lang);
    }
    historyRef.current = [...historyRef.current, { role: 'user', text }, { role: 'assistant', text: data.reply }].slice(-12);
    const outcomeDone = Promise.resolve()
      .then(() => callbacksRef.current.onTurn?.(data))
      .catch(() => null);
    outcomeDone.then((outcome) => {
      if (live()) outcome?.act?.();
    });
    const next = () => {
      outcomeDone.then((outcome) => {
        if (!live()) return;
        lastActiveRef.current = Date.now();
        outcome?.afterSpeak?.();
        listenSoon(150);
      });
    };

    // The server is already speaking the reply (Gemini Live); stream it as it is made.
    if (data.speechId) {
      speakAbortRef.current?.abort();
      const speechController = new AbortController();
      speakAbortRef.current = speechController;
      const ready = await api.voiceReady(data.speechId, { signal: speechController.signal });
      if (!live() || ready?.aborted) return;
      const url = ready?.data?.ok ? api.voiceAudioUrl(data.speechId) : '';
      if (url) {
        setPhase('speaking');
        await playUri(url, speechSeconds(data.reply));
        if (live()) next();
        return;
      }
      naturalPauseRef.current = Date.now() + NATURAL_PAUSE_MS;
    }
    speakPhone(data.reply, data.lang, id, next);
  }, [fail, listenSoon, playUri, speakPhone]);

  /**
   * A line the chat says on its own ("greeting", "nudge" or "goodbye"): the saved clip plays at once, else it
   * is spoken live. Only in the natural voice; without it the line is skipped rather than said robotically.
   * Then it listens again, or runs `then` instead (the goodbye closes the chat).
   */
  const sayClip = useCallback(async (kind, lang, then = null) => {
    const id = speakRef.current + 1;
    speakRef.current = id;
    const live = () => id === speakRef.current && runningRef.current;
    stopRecognition();
    const saved = await takeClip(kind, lang);
    if (!live()) return;
    let text = '';
    if (saved) {
      text = saved.text;
      setPhase('speaking');
      await playUri(saved.uri, saved.seconds);
    } else {
      setPhase('thinking');
      const res = await api.voiceGreeting({ kind, lang });
      if (!live()) return;
      text = res?.data?.text || '';
      const speechId = res?.data?.speechId;
      const ready = speechId ? await api.voiceReady(speechId) : null;
      if (!live()) return;
      if (ready?.data?.ok) {
        setPhase('speaking');
          await playUri(api.voiceAudioUrl(speechId), speechSeconds(text));
      } else {
        text = '';
      }
    }
    if (!live()) return;
    if (text) historyRef.current = [...historyRef.current, { role: 'assistant', text }].slice(-12);
    lastActiveRef.current = Date.now();
    prepareVoiceClip(kind, lang);
    if (then) then();
    else startListening();
  }, [playUri, startListening, stopRecognition]);

  const finishHeard = useCallback(() => {
    clearTimeout(pauseTimerRef.current);
    if (handledRef.current) return;
    handledRef.current = true;
    level.value = withTiming(0, { duration: 150 });
    const text = heardRef.current;
    stopRecognition();
    if (text) handleUtterance(text);
    else listenSoon(250);
  }, [handleUtterance, level, listenSoon, stopRecognition]);

  // An `end` from the session before a restart can arrive late; only a started session may finish.
  // Listening shows only once the microphone is really on, so the first words are not lost.
  useSpeechRecognitionEvent('start', () => {
    if (!mine()) return;
    startedRef.current = true;
    failsRef.current = 0;
    setPhase('listening');
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
    if (text && text !== heardRef.current) {
      heardRef.current = text;
      callbacksRef.current.onHeard?.(text, false);
    }
    if (event.isFinal && heardRef.current) {
      finishHeard();
      return;
    }
    clearTimeout(pauseTimerRef.current);
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
    const value = Math.max(0, Math.min(1, (Number(event.value) + 2) / 12));
    level.value = withTiming(value, { duration: 110 });
  });
  useSpeechRecognitionEvent('error', (event) => {
    if (!mine()) return;
    if (event.error === 'aborted' && !startedRef.current) return;
    clearTimeout(startTimerRef.current);
    clearTimeout(pauseTimerRef.current);
    releaseSpeech(ownerRef.current);
    const heard = handledRef.current ? '' : heardRef.current;
    handledRef.current = true;
    level.value = withTiming(0, { duration: 150 });
    if (!runningRef.current) return;
    // The recognizer often drops (network) right at the end of a sentence; what it heard is still used.
    if (heard && event.error !== 'not-allowed') {
      handleUtterance(heard);
      return;
    }
    if (event.error === 'language-not-supported' && !fallbackRef.current) {
      fallbackRef.current = true;
      listenSoon(100);
      return;
    }
    if (event.error === 'not-allowed') {
      micGrantedRef.current = false;
      fail('mic');
      return;
    }
    if (event.error === 'no-speech' || event.error === 'speech-timeout' || event.error === 'aborted') {
      listenSoon(300);
      return;
    }
    // Brief network drops of the phone's recognizer are common; listen again at once.
    if (event.error === 'network') {
      failsRef.current += 1;
      if (failsRef.current >= MAX_FAILS * 2) fail('error');
      else listenSoon(150);
      return;
    }
    failsRef.current += 1;
    if (failsRef.current >= MAX_FAILS) fail('error');
    else listenSoon(1000);
  });

  const stopAll = useCallback(() => {
    clearTimeout(retryTimerRef.current);
    turnRef.current += 1;
    abortRef.current?.abort();
    silence();
    stopRecognition();
    audioModeReady.current = false;
    level.value = 0;
    setPhase('idle');
  }, [level, silence, stopRecognition]);

  const running = Boolean(active && !paused);
  useEffect(() => {
    runningRef.current = running;
    if (running) {
      fallbackRef.current = false;
      failsRef.current = 0;
      lastActiveRef.current = Date.now();
      prepareVoiceClip('nudge', langRef.current);
      if (greetedRef.current) {
        startListening();
      } else {
        greetedRef.current = true;
        sayClip('greeting', 'ne');
      }
    } else {
      stopAll();
    }
  }, [running, sayClip, startListening, stopAll]);

  // Quiet for a while (listening, nothing heard): say a short "still here" line with the buyer's name.
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => {
      if (phaseRef.current !== 'listening' || heardRef.current) return;
      const asked = nudgesRef.current;
      const wait = asked < NUDGE_AFTER_MS.length ? NUDGE_AFTER_MS[asked] : GOODBYE_AFTER_MS;
      if (Date.now() - lastActiveRef.current < wait) return;
      nudgesRef.current += 1;
      if (asked < NUDGE_AFTER_MS.length) {
        // The last nudge gets the goodbye ready, so it plays at once if the buyer stays quiet.
        if (asked === NUDGE_AFTER_MS.length - 1) prepareVoiceClip('goodbye', langRef.current);
        sayClip('nudge', langRef.current);
      } else {
        sayClip('goodbye', langRef.current, () => fail('quiet'));
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [fail, running, sayClip]);

  useEffect(() => {
    if (active) return;
    historyRef.current = [];
    greetedRef.current = false;
    nudgesRef.current = 0;
  }, [active]);

  useEffect(() => () => {
    runningRef.current = false;
    clearTimeout(retryTimerRef.current);
    clearTimeout(startTimerRef.current);
    clearTimeout(pauseTimerRef.current);
    turnRef.current += 1;
    abortRef.current?.abort();
    speakRef.current += 1;
    speakAbortRef.current?.abort();
    const current = playerRef.current;
    playerRef.current = null;
    clearTimeout(current?.timer);
    try {
      current?.player.pause();
      current?.player.release?.();
    } catch {
      /* already released */
    }
    Speech.stop().catch(() => {});
    if (ownsSpeech(ownerRef.current)) {
      releaseSpeech(ownerRef.current);
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        /* already stopped */
      }
    }
  }, []);

  return { phase: running ? phase : 'idle', level };
}

/** Small gradient button inside the search bar; it shows the voice chat state while active. */
export function VoiceTalkButton({ active, phase, level, colors, onPress, size = 32 }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (active && phase !== 'listening') {
      pulse.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) }), -1, true);
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 200 });
    }
    return () => cancelAnimation(pulse);
  }, [active, phase, pulse]);

  const ringStyle = useAnimatedStyle(() => {
    const amount = phase === 'listening' ? 0.25 + level.value * 0.75 : pulse.value;
    return {
      opacity: active ? 0.2 + amount * 0.25 : 0,
      transform: [{ scale: 1 + amount * 0.45 }],
    };
  });

  const gradient = active ? ['#EF4444', '#F97316'] : colors.gradient || [colors.primary, colors.primary];
  const icon = phase === 'speaking' ? 'volume-high' : 'speaker';

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={active ? 'Stop talking to KinBech' : 'Talk to KinBech'}
    >
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Reanimated.View
          pointerEvents="none"
          style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: gradient[0] }, ringStyle]}
        />
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}
        >
          {active && phase === 'thinking'
            ? <ActivityIndicator size="small" color="#FFFFFF" />
            : <Icon name={icon} size={Math.round(size * 0.53)} color="#FFFFFF" />}
        </LinearGradient>
      </View>
    </Pressable>
  );
}
