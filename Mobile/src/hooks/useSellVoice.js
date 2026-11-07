import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { api } from '../services/api';
import { holdSpeaking, resumeSpeaking, speakHindi, stopSpeaking } from '../services/voicePlayer';
import { claimSpeech, ownsSpeech, releaseSpeech } from '../services/speechSession';
import { dropClip, isBargeIn, isOwnSpeech, readClipSince, stripEcho } from '../utils/voiceListening';

// The phone waits ~2 s of silence before a final result; this much pause after words is enough.
// Words that keep coming after it are merged into the same turn, so a short pause costs nothing.
const SPEECH_PAUSE_MS = 700;
const SPEECH_END_MS = 300;
// The phone's words for the last bit of a spoken line arrive a moment after it ends.
const ECHO_TAIL_MS = 600;
// Nothing heard this long: ask once more, then keep listening quietly.
const QUIET_MS = 8000;
// The mic stays open across turns; a fresh recording after this long keeps the saved file small.
const SESSION_MS = 4 * 60 * 1000;
// Voice level (-2…10) above the room's own noise that counts as someone speaking; low for quiet or far speech.
const VOICE_ABOVE_NOISE = 1.2;
// That much voice with no words from the phone, then this much quiet: send the saved clip to the AI instead.
const VOICED_MIN_MS = 600;
const SOUND_GAP_MS = 1500;
// Clips that came back with no words in a row before waiting for real words again (noise, TV).
const MAX_EMPTY_CLIPS = 2;
// The recognizer failing to start this many times in a row: retry less often, but never give up.
const MAX_RESTARTS = 5;
const FAILING_RETRY_MS = 3000;
// Recordings of a voice heard over one spoken line that may go to the AI (each is an AI call).
const MAX_PROBES = 2;
// A line paused for a voice over it this long with nothing decided: it stops and the helper listens.
const HOLD_MAX_MS = 8000;
// How often a mic that closed without telling is noticed and opened again.
const MIC_CHECK_MS = 3000;
// Each conversation starts in Nepali; it turns Hindi when the AI asks the seller to speak Hindi, until it ends.
const LANGS = {
  ne: {
    speech: 'ne-NP',
    busy: 'माफ गर्नुहोस्, जवाफ आउन समस्या भयो। एक पटक फेरि भन्नुहोस्।',
    limit: 'आजको आवाज सहायताको सीमा पुग्यो। फारम आफैं भर्नुहोस्।',
    // Words sellers say on this screen; the phone's recognizer leans towards them.
    hints: ['हो', 'होइन', 'रोक', 'हुन्छ', 'ठिक छ', 'पब्लिश', 'पब्लिश गर', 'सेभ', 'स्किप', 'रुपैयाँ', 'हजार', 'लाख', 'मोलमोलाइ', 'RAM', 'GB', 'स्टोरेज', 'फोटो', 'क्यामेरा'],
  },
  hi: {
    speech: 'hi-IN',
    busy: 'माफ़ कीजिए, जवाब आने में दिक्कत हुई। एक बार फिर बोलिए।',
    limit: 'आज की आवाज़ सहायता की सीमा पूरी हो गई। फ़ॉर्म खुद भर लीजिए।',
    hints: ['हाँ', 'नहीं', 'रुको', 'ठीक है', 'पब्लिश', 'पब्लिश कर दो', 'सेव', 'स्किप', 'रुपये', 'हज़ार', 'लाख', 'नेगोशिएबल', 'RAM', 'GB', 'स्टोरेज', 'फोटो', 'कैमरा'],
  },
};
// The phone's recognizer for a language it lacks: Nepali falls back to Hindi (same script), then English.
const SPEECH_FALLBACK = { 'ne-NP': 'hi-IN', 'hi-IN': 'en-IN' };
// iOS records 32-bit float at 48 kHz by default; the AI reads 16-bit WAV.
const RECORDING = Platform.OS === 'ios'
  ? { persist: true, outputSampleRate: 16000, outputEncoding: 'pcmFormatInt16' }
  : { persist: true };

const wordsIn = (text) => String(text || '').split(' ').filter(Boolean);

let recordingSupported = null;
function canRecord() {
  if (recordingSupported === null) {
    try {
      recordingSupported = Boolean(ExpoSpeechRecognitionModule.supportsRecording());
    } catch {
      recordingSupported = false;
    }
  }
  return recordingSupported;
}

/** Asks for the mic (and speech recognition on iOS) unless already allowed; true when the helper can listen. */
export async function askVoiceMic() {
  try {
    const now = await ExpoSpeechRecognitionModule.getPermissionsAsync();
    if (now.granted) return true;
    if (now.canAskAgain === false) return false;
    const asked = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return Boolean(asked.granted);
  } catch {
    return false;
  }
}

/**
 * The voice helper of the sell screens: Nepali by default, Hindi for the rest of a conversation once the AI
 * has asked the seller to speak Hindi, Nepali again when the next conversation starts. While `active` it speaks first for each `stage`
 * ("check", "details", "form", "publish"; "reading" while AI reads the photo), sends what the seller said
 * with `buildTurn()` (form snapshot and the screen's controls) to the AI and speaks the reply, until the
 * listing is posted. The mic stays open the whole time, also while the AI thinks and speaks: the helper's
 * own voice is filtered out of what the phone hears, and a voice over a reply pauses it at once. The line
 * stops for good when the seller's words come (or the AI hears them in the recording) and goes on from
 * where it paused when it was not the seller. When the phone hears a voice but no words (quiet,
 * far away), the locally saved recording goes to the AI instead. `applyTurn(turn, 'now')` runs before the
 * reply is said and `applyTurn(turn, 'later')` after it (returns true when it did something; skipped when
 * the seller spoke over the reply). The mic is open in every phase but "off" (the X, no mic permission, daily
 * limit) and while `paused` (keyboard open); it listens again by itself when the keyboard closes.
 * Phases: "idle", "reading", "thinking", "speaking", "listening", "retry", "off".
 */
export function useSellVoice({ active, stage, paused = false, buildTurn, applyTurn }) {
  const [phase, setPhase] = useState('idle');
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [muted, setMuted] = useState(false);

  const ownerRef = useRef(Math.random());
  const runRef = useRef(0);
  const liveRef = useRef(false);
  const stageRef = useRef(stage);
  const phaseRef = useRef(phase);
  const startedRef = useRef(false);
  const historyRef = useRef([]);
  const expectStageRef = useRef(false);
  const stageMovedRef = useRef(false);
  const quietRef = useRef(0);
  const micRef = useRef(false);
  // The conversation's language ("ne" | "hi") and the phone recognizer's language for it.
  const talkRef = useRef('ne');
  const langRef = useRef(LANGS.ne.speech);
  // fullRef: everything the phone heard this mic session; doneWordsRef: its finished part.
  // baseRef: where the used-up part ends: the finished text then, the words of the phrase still open then
  // (the phone may still rewrite them), and the seller's words of that phrase once it finished.
  const fullRef = useRef('');
  const baseRef = useRef({ done: '', open: [], carry: '' });
  const doneWordsRef = useRef('');
  // The seller's own words since baseRef (the helper's voice taken out), and the part already sent.
  const heardRef = useRef('');
  const sentRef = useRef('');
  const altsRef = useRef([]);
  const ownRef = useRef(null);
  // The line being said, taken out of what the mic hears until `echoUntilRef` (epoch ms).
  const echoRef = useRef('');
  const echoUntilRef = useRef(0);
  const echoOpenRef = useRef(false);
  const interruptedRef = useRef(false);
  // A voice heard over the helper's line (epoch ms it began), and the clips of it sent to the AI for that line.
  const overRef = useRef({ at: 0, probes: 0, busy: false });
  // When the line was paused for a voice over it (epoch ms, 0 = not paused), and whether that voice goes on.
  const holdRef = useRef(0);
  const holdTimerRef = useRef(null);
  const voiceOnRef = useRef(false);
  const handledRef = useRef(false);
  const startedMicRef = useRef(false);
  const sessionAtRef = useRef(0);
  const listenFromRef = useRef(0);
  const restartsRef = useRef(0);
  const pausedRef = useRef(false);
  const emptyClipsRef = useRef(0);
  const soundRef = useRef({ noise: 0, tick: 0, lastAt: 0, voicedMs: 0 });
  const clipRef = useRef({ uri: null, startedAt: 0, started: false });
  const pauseTimerRef = useRef(null);
  const quietTimerRef = useRef(null);
  const soundTimerRef = useRef(null);
  const callbacksRef = useRef({ buildTurn, applyTurn });
  callbacksRef.current = { buildTurn, applyTurn };

  const mine = () => ownsSpeech(ownerRef.current);
  const go = (next) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const clearTimers = () => {
    clearTimeout(pauseTimerRef.current);
    clearTimeout(quietTimerRef.current);
    clearTimeout(soundTimerRef.current);
  };

  const stopListening = useCallback(() => {
    clearTimers();
    if (!ownsSpeech(ownerRef.current)) return;
    releaseSpeech(ownerRef.current);
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      /* already stopped */
    }
  }, []);

  /** Everything stops; a turn still waiting for the AI is dropped when it returns. */
  const halt = useCallback((next) => {
    runRef.current += 1;
    stopListening();
    stopSpeaking();
    if (next) go(next);
  }, [stopListening]);

  const runTurnRef = useRef(null);
  const playTurnRef = useRef(null);
  const listenRef = useRef(null);
  const sendClipRef = useRef(null);
  const finishHeardRef = useRef(null);

  /** What the phone heard so far counts as used: only words from now on are the seller's next answer. */
  const rebase = () => {
    clearTimeout(pauseTimerRef.current);
    clearTimeout(soundTimerRef.current);
    const done = doneWordsRef.current;
    baseRef.current = { done, open: wordsIn(fullRef.current).slice(wordsIn(done).length), carry: '' };
    heardRef.current = '';
    ownRef.current = null;
    sentRef.current = '';
    altsRef.current = [];
    handledRef.current = false;
    listenFromRef.current = Date.now();
    soundRef.current = { ...soundRef.current, tick: 0, lastAt: 0, voicedMs: 0 };
    setHeard('');
  };

  const micAllowed = async () => {
    if (micRef.current) return true;
    const now = await ExpoSpeechRecognitionModule.getPermissionsAsync();
    const permission = now.granted ? now : await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setMuted(true);
      go('off');
      return false;
    }
    micRef.current = true;
    return true;
  };

  /** A new mic session (and recording); the old one's file is dropped. */
  const startMic = () => {
    stopListening();
    claimSpeech(ownerRef.current);
    dropClip(clipRef.current.uri);
    clipRef.current = { uri: null, startedAt: 0, started: false };
    fullRef.current = '';
    doneWordsRef.current = '';
    echoOpenRef.current = false;
    voiceOnRef.current = false;
    startedMicRef.current = false;
    sessionAtRef.current = Date.now();
    rebase();
    ExpoSpeechRecognitionModule.start({
      lang: langRef.current,
      interimResults: true,
      continuous: true,
      maxAlternatives: 3,
      contextualStrings: LANGS[talkRef.current].hints,
      volumeChangeEventOptions: { enabled: true, intervalMillis: 120 },
      // iOS takes the phone's own speaker out of the mic, so the helper can listen while it talks.
      ...(Platform.OS === 'ios' ? { iosVoiceProcessingEnabled: true } : {}),
      ...(canRecord() ? { recordingOptions: RECORDING } : {}),
      androidIntentOptions: {
        EXTRA_LANGUAGE_MODEL: 'free_form',
        EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 1500,
        EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 1200,
      },
    });
  };

  /** Mic on without changing the phase (while thinking or speaking). */
  const ensureMic = async () => {
    try {
      if (!(await micAllowed())) return false;
      if (!liveRef.current) return false;
      if (!mine()) startMic();
      return true;
    } catch {
      releaseSpeech(ownerRef.current);
      return false;
    }
  };

  const relisten = (delay = 250) => {
    const run = runRef.current;
    setTimeout(() => {
      if (run === runRef.current && liveRef.current) listenRef.current?.(true);
    }, delay);
  };

  const armQuiet = () => {
    clearTimeout(quietTimerRef.current);
    quietTimerRef.current = setTimeout(() => {
      if (!mine() || phaseRef.current !== 'listening' || heardRef.current || handledRef.current) return;
      const sound = soundRef.current;
      if (Date.now() - sound.lastAt < SOUND_GAP_MS) {
        armQuiet();
        return;
      }
      if (sound.voicedMs >= VOICED_MIN_MS && emptyClipsRef.current < MAX_EMPTY_CLIPS) {
        sendClipRef.current?.();
        return;
      }
      quietRef.current += 1;
      if (quietRef.current === 1) {
        runTurnRef.current?.('quiet');
        return;
      }
      // Stay open; a long session starts a fresh recording now and then.
      if (Date.now() - sessionAtRef.current > SESSION_MS) relisten(150);
      else armQuiet();
    }, QUIET_MS);
  };

  /** Listening for the seller's answer; `fresh` starts a new mic session. */
  const listen = useCallback(async (fresh = false) => {
    if (!liveRef.current) return;
    const run = runRef.current;
    try {
      if (!(await micAllowed())) return;
      if (run !== runRef.current || !liveRef.current) return;
      if (fresh || !mine()) startMic();
      else rebase();
      // The end of the last line can still come through for a moment, and in the phrase the phone is still
      // writing (it may rewrite the helper's words there until that phrase ends).
      echoUntilRef.current = Date.now() + 1500;
      echoOpenRef.current = baseRef.current.open.length > 0;
      go('listening');
      armQuiet();
    } catch {
      releaseSpeech(ownerRef.current);
      go('retry');
    }
  }, [stopListening]);
  listenRef.current = listen;

  /** Says a turn's reply and does what it asks (now, and after the line unless the seller cut it short). */
  const playTurn = async (run, res, said, audio) => {
    holdRef.current = 0;
    clearTimeout(holdTimerRef.current);
    // Words taken from a recording can be misheard: they may open the final review, never post.
    const turn = audio && res?.data
      ? {
          ...res.data,
          publish: res.data.publish === 'confirm' ? 'open' : res.data.publish,
          actions: (res.data.actions || []).filter((action) => action?.id !== 'publish_now'),
        }
      : res?.data;
    if (res?.error || !turn?.reply) {
      if (res?.status === 429) {
        setReply(LANGS[talkRef.current].limit);
        stopListening();
        setMuted(true);
        go('off');
        return;
      }
      const busy = LANGS[talkRef.current].busy;
      setReply(busy);
      echoRef.current = busy;
      echoUntilRef.current = Infinity;
      rebase();
      go('speaking');
      await speakHindi(busy, null, LANGS[talkRef.current].speech);
      if (run === runRef.current && liveRef.current) listen();
      return;
    }
    const words = said || turn.heard || '';
    if (audio) {
      emptyClipsRef.current = turn.heard ? 0 : emptyClipsRef.current + 1;
      if (turn.heard) setHeard(turn.heard);
    }
    startedRef.current = true;
    historyRef.current = [
      ...historyRef.current,
      ...(words ? [{ role: 'user', text: words }] : []),
      { role: 'assistant', text: turn.reply },
    ].slice(-12);
    // What opens or fills shows while it speaks; what closes, posts or leaves waits until the line is said.
    expectStageRef.current = Boolean(
      turn.check || turn.detailsDone || turn.publish || turn.actions?.length || Object.keys(turn.details || {}).length
    );
    callbacksRef.current.applyTurn(turn, 'now');
    echoRef.current = turn.reply;
    echoUntilRef.current = Infinity;
    if (turn.language === 'hi' && talkRef.current !== 'hi') {
      // Asked to speak Hindi: the rest of this conversation is Hindi, heard by a Hindi recognizer.
      talkRef.current = 'hi';
      langRef.current = LANGS.hi.speech;
      if (mine()) startMic();
    }
    rebase();
    overRef.current = { at: 0, probes: 0, busy: false };
    setReply(turn.reply);
    go('speaking');
    await speakHindi(turn.reply, turn.speechId, LANGS[talkRef.current].speech);
    if (run !== runRef.current || !liveRef.current) return;
    expectStageRef.current = false;

    // Cut short by the seller: listen to the rest of what they are saying, nothing else runs.
    if (interruptedRef.current) {
      interruptedRef.current = false;
      stageMovedRef.current = false;
      go('listening');
      armQuiet();
      if (heardRef.current) pauseTimerRef.current = setTimeout(() => finishHeardRef.current?.(), SPEECH_PAUSE_MS);
      return;
    }
    // Words said over the reply (too short to cut it) are answered now, before anything the reply would do.
    await new Promise((resolve) => setTimeout(resolve, ECHO_TAIL_MS));
    if (run !== runRef.current || !liveRef.current) return;
    if (isOwnSpeech(ownRef.current)) {
      stageMovedRef.current = false;
      go('listening');
      finishHeardRef.current?.();
      return;
    }
    if (callbacksRef.current.applyTurn(turn, 'later')) {
      // The step it changed starts its own turn; if nothing moved, listen again.
      stageMovedRef.current = false;
      go('idle');
      setTimeout(() => {
        if (run === runRef.current && liveRef.current && phaseRef.current === 'idle') listen();
      }, 400);
      return;
    }
    if (turn.stop) {
      // Asked to be quiet: no more questions, but the mic keeps listening (only the X turns it off).
      quietRef.current = 1;
      listen();
      return;
    }
    if (stageMovedRef.current) {
      runTurnRef.current?.('stage');
      return;
    }
    listen();
  };
  playTurnRef.current = playTurn;

  /** One turn: what the seller said (or the saved clip of it) and the screen go to the AI, and its reply is said. */
  const runTurn = useCallback(async (event, said = '', { audio = '' } = {}) => {
    if (!liveRef.current) return;
    runRef.current += 1;
    const run = runRef.current;
    stopSpeaking();
    clearTimeout(quietTimerRef.current);
    stageMovedRef.current = false;
    interruptedRef.current = false;
    go('thinking');
    await ensureMic();
    if (run !== runRef.current || !liveRef.current) return;
    const history = said ? [...historyRef.current, { role: 'user', text: said }].slice(-12) : historyRef.current;
    const res = await api.sellVoice({
      ...callbacksRef.current.buildTurn(),
      event,
      stage: stageRef.current,
      language: talkRef.current,
      said,
      ...(said ? { heardAlso: altsRef.current } : {}),
      ...(audio ? { audio } : {}),
      history,
    });
    if (run !== runRef.current || !liveRef.current) return;
    // The seller kept talking (or started) while the AI thought: answer the newer words instead.
    if (said ? heardRef.current !== sentRef.current : isOwnSpeech(ownRef.current)) {
      finishHeardRef.current?.();
      return;
    }
    await playTurnRef.current(run, res, said, audio);
  }, [listen, stopListening]);
  runTurnRef.current = runTurn;

  const finishHeard = useCallback(() => {
    clearTimeout(pauseTimerRef.current);
    const text = heardRef.current;
    if (!text || text === sentRef.current || phaseRef.current === 'speaking') return;
    sentRef.current = text;
    handledRef.current = true;
    quietRef.current = 0;
    restartsRef.current = 0;
    emptyClipsRef.current = 0;
    runTurn('reply', text);
  }, [runTurn]);
  finishHeardRef.current = finishHeard;

  /** A voice the phone could not turn into words: the recording since the question goes to the AI. */
  const sendClip = useCallback(async () => {
    if (handledRef.current || !liveRef.current || phaseRef.current !== 'listening') return;
    handledRef.current = true;
    clearTimers();
    const run = runRef.current;
    go('thinking');
    // Let the recorder write the last few hundred milliseconds.
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (run !== runRef.current || !liveRef.current) return;
    if (heardRef.current && heardRef.current !== sentRef.current) {
      finishHeard();
      return;
    }
    const audio = readClipSince(clipRef.current, listenFromRef.current);
    if (!audio) {
      emptyClipsRef.current = MAX_EMPTY_CLIPS;
      handledRef.current = false;
      go('listening');
      armQuiet();
      return;
    }
    quietRef.current = 0;
    runTurn('reply', '', { audio });
  }, [finishHeard, runTurn]);
  sendClipRef.current = sendClip;

  /** The seller is talking over the line: it stops for good and the helper listens to them. */
  const cutLine = () => {
    holdRef.current = 0;
    clearTimeout(holdTimerRef.current);
    interruptedRef.current = true;
    stopSpeaking();
  };

  /** A voice over the line: it pauses at once (or stops, when the phone's own voice cannot pause). */
  const holdLine = () => {
    if (holdRef.current || interruptedRef.current) return;
    if (!holdSpeaking()) {
      cutLine();
      return;
    }
    const run = runRef.current;
    const heldAt = Date.now();
    holdRef.current = heldAt;
    clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      if (holdRef.current === heldAt && run === runRef.current && phaseRef.current === 'speaking') cutLine();
    }, HOLD_MAX_MS);
  };

  /** Nothing of the seller in that voice: the paused line goes on, unless their words came meanwhile. */
  const resumeHeld = (run) => {
    setTimeout(() => {
      if (!holdRef.current || voiceOnRef.current || interruptedRef.current) return;
      if (run !== runRef.current || phaseRef.current !== 'speaking' || overRef.current.busy) return;
      holdRef.current = 0;
      clearTimeout(holdTimerRef.current);
      resumeSpeaking();
    }, ECHO_TAIL_MS);
  };

  /**
   * The phone heard a voice over the helper's line but wrote no words (with echo cancelling it rarely can):
   * the recording of it goes to the AI while the line waits paused. Only when the AI hears the seller's own
   * words is the line cut and its answer said; otherwise it goes on.
   */
  const probeOver = async () => {
    const over = overRef.current;
    const from = over.at;
    const run = runRef.current;
    over.at = 0;
    if (over.busy) return;
    if (!from || over.probes >= MAX_PROBES || interruptedRef.current || !liveRef.current) {
      resumeHeld(run);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    const audio = readClipSince(clipRef.current, from, 12);
    if (!audio || interruptedRef.current) {
      resumeHeld(run);
      return;
    }
    over.busy = true;
    over.probes += 1;
    const line = echoRef.current;
    const res = await api.sellVoice({
      ...callbacksRef.current.buildTurn(),
      event: 'reply',
      stage: stageRef.current,
      language: talkRef.current,
      said: '',
      audio,
      speakingOver: line,
      history: historyRef.current,
    });
    over.busy = false;
    if (run !== runRef.current || !liveRef.current || interruptedRef.current) return;
    if (phaseRef.current !== 'speaking' && (phaseRef.current !== 'listening' || heardRef.current)) return;
    const turn = res?.data;
    // Its own line heard back is not the seller.
    const own = turn?.heard ? stripEcho(turn.heard, line) : null;
    if (res?.error || !turn?.reply || !own?.text || own.count * 2 < stripEcho(turn.heard, '').count) {
      resumeHeld(run);
      return;
    }
    holdRef.current = 0;
    clearTimeout(holdTimerRef.current);
    runRef.current += 1;
    const next = runRef.current;
    stopSpeaking();
    clearTimeout(pauseTimerRef.current);
    clearTimeout(quietTimerRef.current);
    stageMovedRef.current = false;
    interruptedRef.current = false;
    quietRef.current = 0;
    await playTurnRef.current(next, res, '', audio);
  };
  const probeOverRef = useRef(null);
  probeOverRef.current = probeOver;

  useSpeechRecognitionEvent('start', () => {
    if (mine()) startedMicRef.current = true;
  });
  useSpeechRecognitionEvent('speechstart', () => {
    if (!mine()) return;
    restartsRef.current = 0;
    voiceOnRef.current = true;
    if (phaseRef.current !== 'speaking' || interruptedRef.current) return;
    if (!overRef.current.at) overRef.current.at = Date.now();
    holdLine();
  });
  useSpeechRecognitionEvent('speechend', () => {
    if (!mine()) return;
    voiceOnRef.current = false;
    if (phaseRef.current === 'speaking' && (overRef.current.at || holdRef.current)) probeOverRef.current?.();
  });
  useSpeechRecognitionEvent('audiostart', (event) => {
    if (!mine()) return;
    clipRef.current = { uri: event?.uri || null, startedAt: event?.timestamp || Date.now(), started: true };
  });
  useSpeechRecognitionEvent('volumechange', (event) => {
    // While the helper speaks the mic mostly hears it: only words count then, not loudness.
    if (!mine() || phaseRef.current !== 'listening') return;
    const sound = soundRef.current;
    const now = Date.now();
    const step = sound.tick ? Math.min(now - sound.tick, 300) : 0;
    sound.tick = now;
    const level = Number(event?.value);
    if (!Number.isFinite(level)) return;
    if (level < sound.noise + VOICE_ABOVE_NOISE) {
      // The room's own sound, followed slowly so a fan or traffic does not count as a voice.
      sound.noise = sound.noise * 0.95 + Math.max(-2, level) * 0.05;
      return;
    }
    // A sound that never stops (fan, TV) slowly becomes the room's noise too.
    sound.noise += (level - sound.noise) * 0.01;
    sound.lastAt = now;
    sound.voicedMs += step;
    if (heardRef.current || handledRef.current || emptyClipsRef.current >= MAX_EMPTY_CLIPS) return;
    clearTimeout(soundTimerRef.current);
    soundTimerRef.current = setTimeout(() => {
      if (!mine() || heardRef.current || handledRef.current) return;
      if (soundRef.current.voicedMs >= VOICED_MIN_MS) sendClip();
    }, SOUND_GAP_MS);
  });
  useSpeechRecognitionEvent('result', (event) => {
    if (!mine()) return;
    const results = event.results || [];
    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const done = doneWordsRef.current;
    const join = (value) => (!done || value.startsWith(done) ? value : `${done} ${value}`.trim());
    const all = join(clean(results[0]?.transcript));
    if (event.isFinal) doneWordsRef.current = all;
    fullRef.current = all;
    // Only what came after the used-up part, without the helper's own voice.
    const { done: baseDone, open, carry } = baseRef.current;
    const sinceBase = (text) => {
      const words = wordsIn(text).slice(wordsIn(baseDone).length);
      let same = 0;
      while (same < open.length && same < words.length && words[same] === open[same]) same += 1;
      return [carry, ...words.slice(Math.max(same, Math.min(open.length, words.length)))].filter(Boolean).join(' ');
    };
    const spoken = Date.now() < echoUntilRef.current || echoOpenRef.current ? echoRef.current : '';
    const own = stripEcho(sinceBase(all), spoken);
    // The phrase that was open is finished: a shorter rewrite of it must not eat the words that come next.
    if (event.isFinal) {
      baseRef.current = { done: all, open: [], carry: own.text };
      echoOpenRef.current = false;
    }
    ownRef.current = own;
    altsRef.current = results
      .slice(1, 3)
      .map((item) => stripEcho(sinceBase(join(clean(item?.transcript))), spoken).text)
      .filter((item) => item && item !== own.text);
    if (own.text !== heardRef.current) {
      heardRef.current = own.text;
      setHeard(own.text);
      if (own.text) {
        clearTimeout(quietTimerRef.current);
        clearTimeout(soundTimerRef.current);
      }
    }
    clearTimeout(pauseTimerRef.current);
    if (phaseRef.current === 'speaking') {
      // The seller talking over the reply: stop and listen to them. With the line paused any own word counts.
      if ((isBargeIn(own) || (holdRef.current && own.text)) && !interruptedRef.current) cutLine();
      return;
    }
    // While the AI thinks, a stray word is not a new answer; a phrase, a cue word or more of the sent sentence is.
    if (phaseRef.current === 'thinking' && !sentRef.current && !isOwnSpeech(own)) return;
    if (heardRef.current) pauseTimerRef.current = setTimeout(finishHeard, event.isFinal ? SPEECH_END_MS : SPEECH_PAUSE_MS);
  });
  useSpeechRecognitionEvent('end', () => {
    if (!mine() || !startedMicRef.current) return;
    releaseSpeech(ownerRef.current);
    const listening = phaseRef.current === 'listening';
    if (listening && heardRef.current && heardRef.current !== sentRef.current) {
      finishHeard();
      return;
    }
    if (listening && !handledRef.current && soundRef.current.voicedMs >= VOICED_MIN_MS && emptyClipsRef.current < MAX_EMPTY_CLIPS) {
      sendClip();
      return;
    }
    // The phone closed the mic on its own: open it again, whatever the helper is doing.
    if (liveRef.current) {
      if (listening) relisten();
      else setTimeout(() => { if (liveRef.current && !mine()) ensureMic(); }, 250);
    }
  });
  useSpeechRecognitionEvent('error', (event) => {
    if (!mine()) return;
    if (event.error === 'aborted' && !startedMicRef.current) return;
    releaseSpeech(ownerRef.current);
    if (event.error === 'language-not-supported' && SPEECH_FALLBACK[langRef.current]) {
      langRef.current = SPEECH_FALLBACK[langRef.current];
      if (phaseRef.current === 'listening') listen(true);
      else ensureMic();
      return;
    }
    if (event.error === 'not-allowed') {
      clearTimers();
      micRef.current = false;
      setMuted(true);
      go('off');
      return;
    }
    const listening = phaseRef.current === 'listening';
    if (listening && heardRef.current && heardRef.current !== sentRef.current) {
      finishHeard();
      return;
    }
    if (listening && !handledRef.current && soundRef.current.voicedMs >= VOICED_MIN_MS && emptyClipsRef.current < MAX_EMPTY_CLIPS) {
      sendClip();
      return;
    }
    // "no-speech", network drops and a busy recognizer: keep listening, more slowly when it keeps failing.
    restartsRef.current += 1;
    const delay = restartsRef.current > MAX_RESTARTS ? FAILING_RETRY_MS : event.error === 'network' ? 1500 : 300;
    if (listening) relisten(delay);
    else setTimeout(() => { if (liveRef.current && !mine()) ensureMic(); }, delay);
  });

  const live = active && !muted;
  liveRef.current = live && !paused;

  // On, off and paused.
  useEffect(() => {
    if (!active) {
      halt('idle');
      startedRef.current = false;
      historyRef.current = [];
      // The conversation ended: the next one starts in Nepali again.
      talkRef.current = 'ne';
      langRef.current = LANGS.ne.speech;
      quietRef.current = 0;
      emptyClipsRef.current = 0;
      setHeard('');
      setReply('');
      setMuted(false);
      return;
    }
    if (muted) {
      halt('off');
    } else if (paused) {
      pausedRef.current = true;
      halt('retry');
    } else if (pausedRef.current) {
      // Keyboard closed: listen again at once, without waiting for a tap.
      pausedRef.current = false;
      if (startedRef.current) listenRef.current?.(true);
      else runTurnRef.current?.('start');
    }
  }, [active, muted, paused, halt]);

  // The phone can close the mic without an "end" event: open it again in every state but off.
  useEffect(() => {
    if (!live || paused) return undefined;
    const timer = setInterval(() => {
      if (!liveRef.current || phaseRef.current === 'off' || phaseRef.current === 'idle' || mine()) return;
      if (phaseRef.current === 'listening' || phaseRef.current === 'retry') listenRef.current?.(true);
      else ensureMic();
    }, MIC_CHECK_MS);
    return () => clearInterval(timer);
  }, [live, paused]);

  // Each new step gets its own first line; a step opened by the seller's spoken answer waits for the reply to end.
  useEffect(() => {
    const moved = stageRef.current !== stage;
    stageRef.current = stage;
    if (!live || paused) return;
    if (stage === 'reading') {
      // The AI reads the photo: nothing is said meanwhile, but the mic stays open.
      runRef.current += 1;
      stopSpeaking();
      clearTimeout(quietTimerRef.current);
      go('reading');
      ensureMic();
      return;
    }
    if (!stage) return;
    const busy = phaseRef.current === 'thinking' || (phaseRef.current === 'speaking' && expectStageRef.current);
    if (busy) {
      if (moved) stageMovedRef.current = true;
      return;
    }
    if (moved || phaseRef.current === 'idle' || phaseRef.current === 'reading') {
      quietRef.current = 0;
      runTurn(startedRef.current ? 'stage' : 'start');
    }
  }, [stage, live, paused, runTurn]);

  useEffect(() => () => {
    liveRef.current = false;
    runRef.current += 1;
    clearTimeout(holdTimerRef.current);
    stopListening();
    stopSpeaking();
    dropClip(clipRef.current.uri);
  }, [stopListening]);

  /** The mic button: listens now (stops a line being said). */
  const talk = useCallback(() => {
    if (!active) return;
    restartsRef.current = 0;
    emptyClipsRef.current = 0;
    if (muted) {
      setMuted(false);
      liveRef.current = !paused;
      quietRef.current = 0;
      setTimeout(() => runTurnRef.current?.(startedRef.current ? 'stage' : 'start'), 0);
      return;
    }
    runRef.current += 1;
    stopSpeaking();
    quietRef.current = 0;
    liveRef.current = true;
    listen();
  }, [active, muted, paused, listen]);

  const mute = useCallback(() => setMuted(true), []);

  return { phase: active ? phase : 'idle', heard, reply, muted, talk, mute };
}
