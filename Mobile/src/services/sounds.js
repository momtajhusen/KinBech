import { Vibration } from 'react-native';

const incomingSource = require('../../assets/sounds/incoming-call.mp3');
// Buzz, pause, repeat while an incoming call rings inside the app.
const RING_VIBRATION = [0, 900, 1100];
const ringingSource = require('../../assets/sounds/ringing.mp3');
const messageSource = require('../../assets/sounds/new-message.mp3');

function loadAudio() {
  try {
    return require('expo-audio');
  } catch {
    return null;
  }
}

let modeReady = null;
let loopPlayer = null;
let loopKind = null;
let loopToken = 0;
let messagePlayer = null;
let activeChatId = '';
let ringVibrating = false;
const heardMessageAt = new Map();

/** Stops only the ring buzz, so a haptic played right after a tap is not cut off. */
export function stopRingVibration() {
  if (!ringVibrating) return;
  ringVibrating = false;
  Vibration.cancel();
}

function ensureMode() {
  const audio = loadAudio();
  if (!audio) return Promise.resolve();
  if (!modeReady) {
    modeReady = audio.setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    }).catch(() => {
      modeReady = null;
    });
  }
  return modeReady;
}

function releasePlayer(player) {
  if (!player) return;
  try {
    player.pause();
  } catch {
    /* already stopped */
  }
  try {
    player.release();
  } catch {
    /* already released */
  }
}

export function resetAudioMode() {
  modeReady = null;
}

export function setActiveChatId(chatId) {
  activeChatId = chatId ? String(chatId) : '';
}

export function getActiveChatId() {
  return activeChatId;
}

export function stopCallSounds() {
  stopRingVibration();
  loopToken += 1;
  loopKind = null;
  const player = loopPlayer;
  loopPlayer = null;
  releasePlayer(player);
}

async function startLoop(kind, source) {
  if (loopKind === kind && loopPlayer) return;
  const token = loopToken + 1;
  loopToken = token;
  try {
    await ensureMode();
    if (token !== loopToken) return;
    releasePlayer(loopPlayer);
    loopPlayer = null;
    const audio = loadAudio();
    if (!audio) return;
    const player = audio.createAudioPlayer(source);
    player.loop = true;
    player.volume = 1;
    if (token !== loopToken) {
      releasePlayer(player);
      return;
    }
    loopPlayer = player;
    loopKind = kind;
    player.play();
  } catch {
    /* native audio module is unavailable until the app is rebuilt */
  }
}

export function startIncomingRing() {
  if (!ringVibrating) {
    ringVibrating = true;
    Vibration.vibrate(RING_VIBRATION, true);
  }
  return startLoop('incoming', incomingSource);
}

export function startOutgoingRing() {
  return startLoop('outgoing', ringingSource);
}

export async function playNewMessageSound(chatId, at) {
  if (loopKind === 'incoming') return;
  const id = String(chatId || '');
  const stamp = new Date(at || Date.now()).getTime();
  const previous = heardMessageAt.get(id) || 0;
  if (!stamp || stamp <= previous + 1500) {
    if (stamp > previous) heardMessageAt.set(id, stamp);
    return;
  }
  heardMessageAt.set(id, stamp);

  try {
    const audio = loadAudio();
    if (!audio) return;
    await ensureMode();
    if (!messagePlayer) {
      messagePlayer = audio.createAudioPlayer(messageSource);
      messagePlayer.loop = false;
      messagePlayer.volume = 1;
    }
    await messagePlayer.seekTo(0);
    messagePlayer.play();
  } catch {
    /* ignore a missing or busy player */
  }
}
