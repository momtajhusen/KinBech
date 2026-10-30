import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import KinBechCall from '../../modules/kinbech-call';
import { resolveMediaUrl } from '../utils/listing';

// "Not now" only hides the sheet briefly, so moving from the chat list into a chat does not show it twice.
const NOT_NOW_MS = 60 * 1000;
const BATTERY_ASKED_KEY = 'kinbech_battery_asked_at';
// Android's own dialog; asking again on every launch after "Deny" would nag.
const BATTERY_ASK_EVERY_MS = 3 * 24 * 60 * 60 * 1000;

let visible = false;
let hiddenUntil = 0;
let batteryAsking = false;
const listeners = new Set();

/** Lets the native push receiver load caller photos (server paths) before JS has started. */
export function shareMediaBaseWithNative() {
  try {
    KinBechCall?.setMediaBase?.(resolveMediaUrl('/'));
  } catch {
    /* builds without the call module */
  }
}

/** The native push receiver rings without JS, so it needs to know when nobody is signed in. */
export function shareSignedInWithNative(signedIn) {
  try {
    KinBechCall?.setSignedIn?.(Boolean(signedIn));
  } catch {
    /* builds without the call module */
  }
}

export function readCallReadiness() {
  if (Platform.OS !== 'android' || !KinBechCall?.getCallReadiness) return null;
  try {
    return KinBechCall.getCallReadiness();
  } catch {
    return null;
  }
}

export function openCallSetting(kind) {
  try {
    return Boolean(KinBechCall?.openCallSetting?.(kind));
  } catch {
    return false;
  }
}

/** Opens Android's one-tap "Let KinBech run in background?" dialog by itself while that is still off. */
export async function autoAllowBackground() {
  if (batteryAsking) return;
  const state = readCallReadiness();
  if (!state || state.batteryUnrestricted) return;
  batteryAsking = true;
  try {
    const last = Number(await AsyncStorage.getItem(BATTERY_ASKED_KEY).catch(() => 0)) || 0;
    if (Date.now() - last < BATTERY_ASK_EVERY_MS) return;
    await AsyncStorage.setItem(BATTERY_ASKED_KEY, String(Date.now())).catch(() => {});
    openCallSetting('batteryPrompt');
  } finally {
    batteryAsking = false;
  }
}

/** Every switch a call needs to ring while the app is closed or the phone is locked, with its state. */
export async function readCallSetupSteps() {
  const state = readCallReadiness();
  if (!state) return null;
  return [
    {
      key: 'notifications',
      icon: 'notifications',
      title: 'Call notifications',
      hint: 'Lets KinBech ring and show who is calling.',
      action: 'notifications',
      cta: 'Turn on',
      done: Boolean(state.notifications),
    },
    {
      key: 'fullScreen',
      icon: 'phone-portrait',
      title: 'Calls on lock screen',
      hint: 'Incoming calls open over the lock screen.',
      action: 'fullScreen',
      cta: 'Allow',
      done: Boolean(state.fullScreen),
    },
  ];
}

function emit() {
  listeners.forEach((listener) => listener(visible));
}

export function subscribeCallSetup(listener) {
  listeners.add(listener);
  listener(visible);
  return () => listeners.delete(listener);
}

/** Opens the setup sheet from a menu, even right after "Not now". */
export function openCallSetup() {
  hiddenUntil = 0;
  visible = true;
  emit();
}

export function closeCallSetup({ notNow = false } = {}) {
  if (notNow) hiddenUntil = Date.now() + NOT_NOW_MS;
  visible = false;
  emit();
}

/** Called each time a chat screen gains focus: shows the setup sheet while any call switch is still off. */
export async function requireCallSetup() {
  if (visible || Date.now() < hiddenUntil) return;
  const steps = await readCallSetupSteps();
  if (!steps || steps.every((step) => step.done)) return;
  if (visible || Date.now() < hiddenUntil) return;
  visible = true;
  emit();
}
