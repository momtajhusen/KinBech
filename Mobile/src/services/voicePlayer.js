import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';
import { api } from './api';

// Upper bound for a streamed line (about 11 spoken characters a second), in case the player never reports the end.
const speechSeconds = (text) => String(text || '').length / 11 + 3;
const NATURAL_VOICE_WAIT_MS = 3500;

let voicesPromise = null;
let modeReady = false;
let current = null;
let token = 0;
let cancelLine = null;
// Held: the line is paused (or waits to start) until resumeSpeaking(); the phone's own voice cannot pause.
let held = false;
let unhold = null;
let phoneTalking = false;

/**
 * The phone's most natural voice for `language` (enhanced quality first, then network voices), and the
 * language it speaks; a phone without a Nepali voice reads Nepali with its Hindi one (same script).
 */
async function phoneVoice(language) {
  if (!voicesPromise) voicesPromise = Speech.getAvailableVoicesAsync().catch(() => []);
  const voices = await voicesPromise;
  const score = (voice) => (voice.quality === 'Enhanced' ? 2 : 0) + (/network/i.test(voice.identifier || '') ? 1 : 0);
  const best = (code) => voices
    .filter((voice) => String(voice.language || '').replace('_', '-').toLowerCase() === code.toLowerCase())
    .sort((a, b) => score(b) - score(a))[0]?.identifier;
  const own = language === 'ne-NP' ? best('ne-NP') : null;
  return own ? { voice: own, language } : { voice: best('hi-IN'), language: 'hi-IN' };
}

function stopPlayer() {
  const entry = current;
  current = null;
  if (!entry) return;
  clearTimeout(entry.timer);
  try {
    entry.player.pause();
    entry.player.release?.();
  } catch {
    /* already released */
  }
  entry.resolve();
}

async function playUri(uri, seconds) {
  if (!modeReady) {
    modeReady = true;
    await setAudioModeAsync({
      playsInSilentMode: true,
      // The sell helper keeps the mic open while it talks.
      allowsRecording: true,
      // No audio focus on Android: taking it can make the speech recognizer stop listening.
      interruptionMode: 'mixWithOthers',
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
    const entry = { player, resolve, timer: null, seconds };
    player.addListener('playbackStatusUpdate', (status) => {
      if (status?.didJustFinish && current === entry) stopPlayer();
    });
    current = entry;
    if (held) return;
    armEnd(entry);
    player.play();
  });
}

function armEnd(entry) {
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    if (current === entry) stopPlayer();
  }, (entry.seconds + 3) * 1000);
}

/**
 * Pauses the line being said at once (one still loading starts paused); false when it cannot pause
 * (the phone's own voice is talking), then stop it instead.
 */
export function holdSpeaking() {
  if (phoneTalking) return false;
  held = true;
  if (current) {
    clearTimeout(current.timer);
    try {
      current.player.pause();
    } catch {
      /* released */
    }
  }
  return true;
}

/** Goes on with a held line from where it paused. */
export function resumeSpeaking() {
  if (!held) return;
  held = false;
  const go = unhold;
  unhold = null;
  go?.();
  if (!current) return;
  armEnd(current);
  try {
    current.player.play();
  } catch {
    /* released */
  }
}

/** Stops whatever is being said now; a line still loading ends at once too. */
export function stopSpeaking() {
  token += 1;
  held = false;
  unhold = null;
  phoneTalking = false;
  const cancel = cancelLine;
  cancelLine = null;
  cancel?.();
  stopPlayer();
  Speech.stop().catch(() => {});
}

/**
 * Says a Hindi (or with `language` "ne-NP", Nepali) line: the server's natural voice when `speechId` is
 * ready, else the phone's own voice. Resolves when it ends or is stopped.
 */
export async function speakHindi(text, speechId, language = 'hi-IN') {
  stopSpeaking();
  const id = token;
  const stopped = new Promise((resolve) => {
    cancelLine = () => resolve(null);
  });
  if (speechId) {
    // A slow natural voice is worse than the phone's own: give it a few seconds, then speak anyway.
    const ready = await Promise.race([
      api.voiceReady(speechId),
      stopped,
      new Promise((resolve) => setTimeout(() => resolve(null), NATURAL_VOICE_WAIT_MS)),
    ]);
    if (id !== token) return;
    const url = ready?.data?.ok ? api.voiceAudioUrl(speechId) : '';
    if (url) {
      await Promise.race([playUri(url, speechSeconds(text)), stopped]);
      return;
    }
  }
  const pick = await Promise.race([phoneVoice(language), stopped]);
  if (id !== token) return;
  if (held) await Promise.race([new Promise((resolve) => { unhold = resolve; }), stopped]);
  if (id !== token) return;
  phoneTalking = true;
  await Promise.race([
    stopped,
    new Promise((resolve) => {
      Speech.speak(text, {
        language: pick?.language || 'hi-IN',
        voice: pick?.voice,
        rate: 0.95,
        onDone: resolve,
        onError: resolve,
        onStopped: resolve,
      });
    }),
  ]);
  if (id === token) phoneTalking = false;
}
