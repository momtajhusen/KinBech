import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import KinBechCall from '../../modules/kinbech-call';
import { resolveMediaUrl } from '../utils/listing';

const AUTOSTART_KEY = 'kinbech_call_autostart_confirmed';
// "Not now" only hides the sheet briefly, so moving from the chat list into a chat does not show it twice.
const NOT_NOW_MS = 60 * 1000;
const BRAND_NAMES = {
  vivo: 'Vivo',
  iqoo: 'iQOO',
  xiaomi: 'Xiaomi',
  redmi: 'Redmi',
  poco: 'POCO',
  oppo: 'OPPO',
  realme: 'realme',
  oneplus: 'OnePlus',
  huawei: 'Huawei',
  honor: 'Honor',
  infinix: 'Infinix',
  tecno: 'TECNO',
  itel: 'itel',
};

let visible = false;
let hiddenUntil = 0;
let autostartConfirmed = null;
const listeners = new Set();

/** Lets the native push receiver load caller photos (server paths) before JS has started. */
export function shareMediaBaseWithNative() {
  try {
    KinBechCall?.setMediaBase?.(resolveMediaUrl('/'));
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

async function loadAutostartConfirmed() {
  if (autostartConfirmed === null) {
    autostartConfirmed = (await AsyncStorage.getItem(AUTOSTART_KEY).catch(() => null)) === '1';
  }
  return autostartConfirmed;
}

/** Android cannot report OEM autostart, so the user tells us once they have switched it on. */
export async function confirmAutostart() {
  autostartConfirmed = true;
  await AsyncStorage.setItem(AUTOSTART_KEY, '1').catch(() => {});
}

/** Every switch a call needs to ring while the app is closed or the phone is locked, with its state. */
export async function readCallSetupSteps() {
  const state = readCallReadiness();
  if (!state) return null;
  const brand = BRAND_NAMES[state.manufacturer] || 'Phone';
  const steps = [
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
    {
      key: 'battery',
      icon: 'battery-charging',
      title: 'Run in background',
      hint: 'Tap Allow on the next popup so Android does not put KinBech to sleep.',
      action: 'batteryRequest',
      cta: 'Allow',
      done: Boolean(state.batteryUnrestricted),
    },
  ];
  if (state.needsAutostart) {
    steps.push({
      key: 'autostart',
      icon: 'rocket',
      title: `${brand} autostart`,
      hint: `${brand} closes apps you swipe away. Turn KinBech on in the list that opens.`,
      action: 'autostart',
      cta: 'Open',
      confirmable: true,
      done: await loadAutostartConfirmed(),
    });
  }
  return steps;
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
