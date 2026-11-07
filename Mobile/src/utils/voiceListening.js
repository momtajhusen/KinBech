import { File } from 'expo-file-system';

// Short words that mean "listen to me" even alone (Nepali, Hindi, English): stop, wait, no, yes.
const CUE_WORDS = new Set([
  'रोक', 'रोक्नुहोस्', 'पर्ख', 'पर्खनुहोस्', 'होइन', 'हैन', 'हो', 'हजुर',
  'रुको', 'रुकिए', 'रुकिये', 'रुक', 'नहीं', 'नही', 'ना', 'हाँ', 'हां',
  'stop', 'wait', 'ruko', 'rukiye', 'nahi', 'nahin', 'haan', 'han', 'no', 'yes',
]);
// Of the newest words heard over a spoken line, at least this share must not be the line itself.
const OWN_SHARE = 0.34;
// Cutting a reply short reacts sooner: two of the seller's words among the newest ones are enough.
const BARGE_SHARE = 0.25;
const RECENT_WORDS = 8;
// Android's live recording (before the mic stops): raw 16 kHz mono 16-bit.
const ANDROID_LIVE_RATE = 16000;

const wordsOf = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[\u093C]/g, '')
    .replace(/\u0901/g, '\u0902')
    .replace(/[।॥,.!?;:"'“”‘’()\-–—…]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/**
 * What the seller said in `heard`, without the helper's own voice: the mic also picks up `spoken` (the lines
 * being said), so any two words in a row that also come in a row in `spoken` are its echo.
 * Returns the seller's words, the longest run of them, and their share of the newest words.
 */
export function stripEcho(heard, spoken) {
  const words = wordsOf(heard);
  const said = wordsOf(spoken);
  const echo = new Array(words.length).fill(false);
  if (said.length) {
    const pairs = new Set();
    for (let i = 0; i < said.length - 1; i += 1) pairs.add(`${said[i]} ${said[i + 1]}`);
    for (let i = 0; i < words.length - 1; i += 1) {
      if (pairs.has(`${words[i]} ${words[i + 1]}`)) {
        echo[i] = true;
        echo[i + 1] = true;
      }
    }
    if (said.length === 1) words.forEach((word, i) => { if (word === said[0]) echo[i] = true; });
  }
  let run = 0;
  let longest = 0;
  echo.forEach((isEcho) => {
    run = isEcho ? 0 : run + 1;
    longest = Math.max(longest, run);
  });
  const recent = echo.slice(-RECENT_WORDS);
  const own = words.filter((_, i) => !echo[i]);
  return {
    text: own.join(' '),
    count: own.length,
    longest,
    share: recent.length ? recent.filter((isEcho) => !isEcho).length / recent.length : 0,
    cue: own.some((word) => CUE_WORDS.has(word) && !said.includes(word)),
  };
}

/** Enough of the seller's own voice to act on: a real phrase (not a misheard echo word) or a cue word. */
export function isOwnSpeech(info) {
  return Boolean(info?.text) && (info.cue || (info.longest >= 2 && info.share >= OWN_SHARE));
}

/** The seller is talking over the helper's line: stop it now. */
export function isBargeIn(info) {
  return isOwnSpeech(info) || (Boolean(info?.text) && info.count >= 2 && info.share >= BARGE_SHARE);
}

export function dropClip(uri) {
  if (!uri) return;
  [uri, `${uri}.pcm`].forEach((path) => {
    try {
      const file = new File(path);
      if (file.exists) file.delete();
    } catch {
      /* already gone */
    }
  });
}

function findChunk(bytes, id) {
  for (let i = 12; i < bytes.length - 8; i += 1) {
    if (bytes[i] === id.charCodeAt(0) && bytes[i + 1] === id.charCodeAt(1) && bytes[i + 2] === id.charCodeAt(2) && bytes[i + 3] === id.charCodeAt(3)) {
      return i;
    }
  }
  return -1;
}

function wavBytes(pcm, rate, channels) {
  const out = new Uint8Array(44 + pcm.length);
  const view = new DataView(out.buffer);
  const ascii = (offset, text) => [...text].forEach((ch, i) => { out[offset + i] = ch.charCodeAt(0); });
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function toBase64(bytes) {
  const parts = [];
  let chunk = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    chunk += B64[a >> 2] + B64[((a & 3) << 4) | ((b ?? 0) >> 4)]
      + (b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)])
      + (c === undefined ? '=' : B64[c & 63]);
    if (chunk.length >= 8192) {
      parts.push(chunk);
      chunk = '';
    }
  }
  parts.push(chunk);
  return parts.join('');
}

/**
 * The part of a recording (16-bit WAV being written by the recognizer) from `fromMs` (epoch ms) to now, as a
 * base64 WAV of at most `maxSeconds`; `startedAt` is when the recording began. '' when there is nothing usable.
 */
export function readClipSince({ uri, startedAt }, fromMs, maxSeconds = 20) {
  if (!uri || !/\.wav$/i.test(uri) || !startedAt) return '';
  let handle = null;
  try {
    let file = new File(uri);
    let channels = 1;
    let rate = ANDROID_LIVE_RATE;
    let dataStart = 0;
    if (file.exists && file.size) {
      handle = file.open();
      const head = handle.readBytes(Math.min(512, file.size));
      const fmt = findChunk(head, 'fmt ');
      const data = findChunk(head, 'data');
      if (fmt < 0 || data < 0) return '';
      const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
      channels = view.getUint16(fmt + 10, true) || 1;
      rate = view.getUint32(fmt + 12, true);
      if (view.getUint16(fmt + 22, true) !== 16 || !rate) return '';
      dataStart = data + 8;
    } else {
      // Android writes the WAV only when the mic stops; until then the audio is raw next to it.
      file = new File(`${uri}.pcm`);
      if (!file.exists || !file.size) return '';
      handle = file.open();
    }
    const block = channels * 2;
    const total = file.size - dataStart;
    const end = total - (total % block);
    // A little before the mark, so the first syllable is not cut.
    let from = Math.floor((Math.max(0, fromMs - startedAt - 300) * rate) / 1000) * block;
    from = Math.max(from, end - maxSeconds * rate * block);
    if (end - from < rate * block * 0.4) return '';
    handle.offset = dataStart + from;
    return toBase64(wavBytes(handle.readBytes(end - from), rate, channels));
  } catch {
    return '';
  } finally {
    try {
      handle?.close();
    } catch {
      /* closed */
    }
  }
}
