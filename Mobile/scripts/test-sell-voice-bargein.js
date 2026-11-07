// Simulates the sell voice helper (real hook, fake mic / AI / speaker): `node scripts/test-sell-voice-bargein.js`.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');

const SRC = path.join(__dirname, '..', 'src');

require.extensions['.js'] = (module, filename) => {
  const code = fs.readFileSync(filename, 'utf8');
  if (!filename.startsWith(SRC)) return module._compile(code, filename);
  const out = babel.transformSync(code, {
    filename,
    babelrc: false,
    configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  module._compile(out.code, filename);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

// A one-component hook runner: enough of React for this hook.
function createReact() {
  let slots = [];
  let index = 0;
  let pending = [];
  let renderFn = null;
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      renderFn?.();
    });
  };
  const React = {
    useState(initial) {
      const k = index++;
      if (!slots[k]) slots[k] = { value: typeof initial === 'function' ? initial() : initial };
      const slot = slots[k];
      return [slot.value, (next) => {
        const value = typeof next === 'function' ? next(slot.value) : next;
        if (Object.is(value, slot.value)) return;
        slot.value = value;
        schedule();
      }];
    },
    useRef(initial) {
      const k = index++;
      if (!slots[k]) slots[k] = { current: initial };
      return slots[k];
    },
    useCallback(fn, deps) {
      const k = index++;
      if (slots[k] && same(slots[k].deps, deps)) return slots[k].fn;
      slots[k] = { fn, deps };
      return fn;
    },
    useEffect(fn, deps) {
      const k = index++;
      const slot = slots[k] || (slots[k] = {});
      if (slot.deps && same(slot.deps, deps)) return;
      slot.deps = deps;
      pending.push(() => {
        slot.cleanup?.();
        slot.cleanup = fn();
      });
    },
  };
  const mount = (hook, props) => {
    const state = { props, result: null };
    renderFn = () => {
      index = 0;
      state.result = hook(state.props);
      const effects = pending;
      pending = [];
      effects.forEach((run) => run());
    };
    renderFn();
    return {
      get current() {
        return state.result;
      },
      update(next) {
        state.props = { ...state.props, ...next };
        renderFn();
      },
      unmount() {
        slots.forEach((slot) => slot?.cleanup?.());
        renderFn = null;
        slots = [];
      },
    };
  };
  return { React, mount };
}

function loadWithMocks(file, mocks) {
  const original = Module._load;
  Module._load = function load(request, ...rest) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return original.call(this, request, ...rest);
  };
  try {
    Object.keys(require.cache).forEach((key) => {
      if (key.startsWith(SRC)) delete require.cache[key];
    });
    return require(path.join(SRC, file));
  } finally {
    Module._load = original;
  }
}

// ---------- The hook, with a fake recognizer, AI and speaker ----------

function setupHook({ replies, speakMs, stage = 'form', files = {}, canHold = true }) {
  const { React, mount } = createReact();
  class File {
    constructor(uri) {
      this.uri = uri;
      this.exists = Boolean(files[uri]);
      this.size = files[uri]?.length || 0;
    }
    open() {
      const data = files[this.uri];
      return {
        offset: 0,
        readBytes(n) {
          const out = data.slice(this.offset, this.offset + n);
          this.offset += n;
          return out;
        },
        close() {},
      };
    }
    delete() {
      delete files[this.uri];
    }
  }
  const handlers = {};
  const log = [];
  const t0 = Date.now();
  const at = () => Date.now() - t0;
  let line = null;

  const recognizer = {
    start: (options) => {
      log.push({ at: at(), what: 'mic-start', lang: options?.lang });
      setTimeout(() => handlers.start?.(), 5);
    },
    stop: () => {},
    abort: () => log.push({ at: at(), what: 'mic-abort' }),
    getPermissionsAsync: async () => ({ granted: true }),
    requestPermissionsAsync: async () => ({ granted: true }),
    supportsRecording: () => false,
  };
  const calls = [];
  const api = {
    sellVoice: async (body) => {
      calls.push({ at: at(), body });
      await sleep(80);
      const next = replies.shift();
      return { data: next };
    },
  };
  const spoken = [];
  const endLine = (how) => {
    const current = line;
    if (!current) return;
    line = null;
    clearTimeout(current.timer);
    spoken.push({ text: current.text, how, endedAt: at() });
    current.resolve();
  };
  const player = {
    speakHindi: (text) => new Promise((resolve) => {
      endLine('replaced');
      line = { text, resolve, timer: setTimeout(() => endLine('done'), speakMs), endsAt: Date.now() + speakMs };
      spoken.push({ text, how: 'start', at: at() });
    }),
    stopSpeaking: () => endLine('stopped'),
    holdSpeaking: () => {
      if (!canHold) return false;
      if (line && !line.held) {
        clearTimeout(line.timer);
        line.held = true;
        line.left = Math.max(0, line.endsAt - Date.now());
        spoken.push({ text: line.text, how: 'held', at: at() });
      }
      return true;
    },
    resumeSpeaking: () => {
      if (!line || !line.held) return;
      line.held = false;
      line.endsAt = Date.now() + line.left;
      line.timer = setTimeout(() => endLine('done'), line.left);
      spoken.push({ text: line.text, how: 'resumed', at: at() });
    },
  };
  const applied = [];

  const { useSellVoice } = loadWithMocks('hooks/useSellVoice.js', {
    react: React,
    'react-native': { Platform: { OS: 'android' } },
    'expo-speech-recognition': {
      ExpoSpeechRecognitionModule: recognizer,
      useSpeechRecognitionEvent: (name, fn) => {
        handlers[name] = fn;
      },
    },
    'expo-file-system': { File },
    '../services/api': { api },
    '../services/voicePlayer': player,
  });

  const hook = mount(useSellVoice, {
    active: true,
    stage,
    paused: false,
    buildTurn: () => ({ form: {} }),
    applyTurn: (turn, when) => {
      applied.push({ reply: turn.reply, when, at: at(), turn });
      return false;
    },
  });
  const say = (transcript, isFinal = false) => {
    handlers.result?.({ isFinal, results: [{ transcript }] });
  };
  const waitFor = async (check, ms = 3000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (check()) return;
      await sleep(10);
    }
    throw new Error('timed out');
  };
  const fail = (error) => handlers.error?.({ error, message: error });
  const emit = (name, event) => handlers[name]?.(event);
  const micStarts = () => log.filter((item) => item.what === 'mic-start').length;
  const micLang = () => log.filter((item) => item.what === 'mic-start').pop()?.lang;
  return { hook, say, fail, emit, waitFor, calls, spoken, applied, at, micStarts, micLang, isSpeaking: () => Boolean(line && !line.held), isHeld: () => Boolean(line?.held) };
}

// What the voice bar shows for a phase (SellVoiceBar's own rules), to name the state a test is in.
function barText({ phase, heard, reply }) {
  const status = { reading: 'फोटो देख रहा हूँ…', thinking: 'सोच रहा हूँ…', speaking: 'AI सहायक', listening: 'सुन रहा हूँ…', retry: 'बोलने के लिए माइक दबाएँ', off: 'AI सहायक बंद है' }[phase] || '';
  let line = '';
  if (phase === 'listening') line = heard ? `“${heard}”` : '';
  else if (phase === 'speaking' || phase === 'retry') line = reply;
  else if (phase === 'off') line = 'बात करके फ़ॉर्म भरने के लिए दबाएँ';
  return [status, line].filter(Boolean).join(' / ');
}

// The seller answers in the state the bar shows now; it must reach the AI as a reply right away.
async function answeredIn(t, words, expectSaid = words) {
  const before = t.calls.length;
  const shown = barText(t.hook.current);
  const segment = words;
  t.say(segment);
  await sleep(120);
  const doneAt = t.at();
  t.say(segment, true);
  await t.waitFor(() => t.calls.length > before, 2000).catch(() => {
    throw new Error(`"${words}" was not heard while the bar showed "${shown}"`);
  });
  const turn = t.calls[before];
  assert.equal(turn.body.event, 'reply', `event while "${shown}"`);
  assert.equal(turn.body.said, expectSaid, `heard while "${shown}"`);
  assert.ok(turn.at - doneAt <= 450, `answer took ${turn.at - doneAt} ms while "${shown}"`);
  return shown;
}

const LONG_REPLY = 'अच्छा, आप Samsung Galaxy A52 बेच रहे हैं। इसकी कीमत कितनी रखनी है?';

async function speakingOverReplyIsAnsweredAtOnce() {
  const t = setupHook({
    speakMs: 8000,
    replies: [
      { reply: LONG_REPLY },
      { reply: 'ठीक है, RAM आठ GB कर दी।' },
    ],
  });
  await t.waitFor(() => t.hook.current.phase === 'speaking');
  const spokeAt = t.at();

  // The mic hears the helper itself: that must not stop the line.
  t.say('अच्छा आप samsung galaxy');
  await sleep(150);
  assert.ok(t.isSpeaking(), 'own echo stopped the reply');
  assert.equal(t.hook.current.phase, 'speaking');

  // The seller talks over it.
  const bargeAt = t.at();
  t.say('अच्छा आप samsung galaxy a52 बेच नहीं पहले ram');
  const stopped = t.spoken.find((item) => item.how === 'stopped');
  assert.ok(stopped, 'reply was not cut short');
  assert.ok(stopped.endedAt - bargeAt <= 5, `cut after ${stopped.endedAt - bargeAt} ms`);
  await sleep(0);
  assert.equal(t.hook.current.phase, 'listening');

  // The seller finishes the sentence; the newest words go to the AI right away.
  await sleep(200);
  t.say('अच्छा आप samsung galaxy a52 बेच नहीं पहले ram आठ जीबी करो');
  await sleep(150);
  const doneAt = t.at();
  t.say('अच्छा आप samsung galaxy a52 बेच नहीं पहले ram आठ जीबी करो', true);
  await t.waitFor(() => t.calls.length === 2);
  const turn = t.calls[1];
  assert.equal(turn.body.event, 'reply');
  assert.equal(turn.body.said, 'नहीं पहले ram आठ जीबी करो');
  const answerDelay = turn.at - doneAt;
  assert.ok(answerDelay <= 450, `answer sent ${answerDelay} ms after the seller stopped`);
  assert.ok(turn.at - spokeAt < 8000, 'waited for the old reply to finish');

  await t.waitFor(() => t.spoken.some((item) => item.how === 'start' && item.text.startsWith('ठीक है')));
  assert.ok(!t.applied.some((item) => item.reply === LONG_REPLY && item.when === 'later'), 'cut reply still ran its later actions');
  t.hook.unmount();
  return { cutMs: stopped.endedAt - bargeAt, answerMs: answerDelay };
}

async function echoAloneDoesNotInterrupt() {
  const t = setupHook({ speakMs: 900, replies: [{ reply: LONG_REPLY }] });
  await t.waitFor(() => t.hook.current.phase === 'speaking');
  t.say('अच्छा आप samsung galaxy a52 बेच रहे हैं');
  await sleep(100);
  t.say('अच्छा आप samsung galaxy a52 बेच रहे हैं इसकी कीमत कितनी रखनी है', true);
  await t.waitFor(() => t.hook.current.phase === 'listening', 3000);
  assert.ok(t.spoken.some((item) => item.how === 'done'), 'echo cut the reply');
  await sleep(900);
  assert.equal(t.calls.length, 1, 'echo was sent as the seller\'s answer');
  t.hook.unmount();
}

async function speakingWhileThinkingReplacesTheTurn() {
  const t = setupHook({
    speakMs: 8000,
    replies: [
      { reply: 'फ़ोन की कीमत बताइए।' },
      { reply: 'पंद्रह हज़ार रख दी।' },
      { reply: 'ठीक है, बीस हज़ार कर दी।' },
    ],
  });
  await t.waitFor(() => t.hook.current.phase === 'speaking');
  t.say('पंद्रह हजार', true);
  await t.waitFor(() => t.calls.length === 2);
  assert.equal(t.calls[1].body.said, 'पंद्रह हजार');
  // Still thinking about "पंद्रह हज़ार": the seller changes it.
  t.say('पंद्रह हजार नहीं बीस हजार', true);
  await t.waitFor(() => t.calls.length === 3);
  assert.equal(t.calls[2].body.said, 'पंद्रह हजार नहीं बीस हजार');
  await t.waitFor(() => t.spoken.some((item) => item.how === 'start' && item.text.startsWith('ठीक है')));
  assert.ok(!t.spoken.some((item) => item.text === 'पंद्रह हज़ार रख दी।'), 'the outdated reply was still said');
  t.hook.unmount();
}

// "सुन रहा हूँ…" right after a reply: the phone rewrites its words for the helper's voice shorter.
async function listeningAfterReplyHearsShortAnswer() {
  const t = setupHook({ speakMs: 300, replies: [{ reply: LONG_REPLY }, { reply: 'ठीक है।' }] });
  await t.waitFor(() => t.hook.current.phase === 'speaking');
  t.say('अच्छा आप samsung galaxy a52 बेच रहे हैं इसकी कीमत');
  await t.waitFor(() => t.hook.current.phase === 'listening');
  assert.equal(barText(t.hook.current), 'सुन रहा हूँ…');
  t.say('अच्छा आप सैमसंग गैलेक्सी बेच रहे हैं', true);
  await sleep(50);
  assert.equal(t.hook.current.heard, '', 'the helper\'s own words showed up as heard');
  const shown = await answeredIn(t, 'पंद्रह हजार');
  t.hook.unmount();
  return shown;
}

// The phone finishes the helper's last phrase late (after the short echo window), longer than before.
async function lateEchoPhraseIsNotAnAnswer() {
  const reply = 'मेंस फॉर्मल सूट तीन हजार रुपये में। क्या मैं इसे पब्लिश कर दूं?';
  const t = setupHook({ speakMs: 300, replies: [{ reply }, { reply: 'ठीक है।' }] });
  await t.waitFor(() => t.hook.current.phase === 'speaking');
  t.say('मेंस फॉर्मल सूट तीन हजार');
  await t.waitFor(() => t.hook.current.phase === 'listening');
  await sleep(1700);
  t.say('मेंस फॉर्मल सूट तीन हजार रुपये में क्या मैं इसे पब्लिश कर दूं', true);
  await sleep(700);
  assert.equal(t.calls.length, 1, `echo sent as the seller's answer: "${t.calls[1]?.body.said}"`);
  const shown = await answeredIn(t, 'हां पब्लिश करो', 'हां पब्लिश करो');
  t.hook.unmount();
  return shown;
}

async function listeningWithWordsShown() {
  const t = setupHook({ speakMs: 200, replies: [{ reply: 'कीमत बताइए।' }, { reply: 'ठीक है।' }] });
  await t.waitFor(() => t.hook.current.phase === 'listening');
  t.say('बीस');
  await t.waitFor(() => t.hook.current.heard === 'बीस');
  assert.equal(barText(t.hook.current), 'सुन रहा हूँ… / “बीस”');
  await sleep(120);
  t.say('बीस हजार', true);
  await t.waitFor(() => t.calls.length === 2);
  assert.equal(t.calls[1].body.said, 'बीस हजार');
  t.hook.unmount();
}

async function readingPhotoKeepsListening() {
  const t = setupHook({ speakMs: 200, stage: 'reading', replies: [{ reply: 'ठीक है, नया फ़ोन।' }] });
  await t.waitFor(() => t.hook.current.phase === 'reading' && t.micStarts() > 0);
  const shown = await answeredIn(t, 'यह फोन बिल्कुल नया है');
  t.hook.unmount();
  return shown;
}

async function keyboardClosedListensAgain() {
  const t = setupHook({ speakMs: 200, replies: [{ reply: 'कीमत बताइए।' }, { reply: 'ठीक है।' }] });
  await t.waitFor(() => t.hook.current.phase === 'listening');
  t.hook.update({ paused: true });
  await t.waitFor(() => t.hook.current.phase === 'retry');
  const starts = t.micStarts();
  t.hook.update({ paused: false });
  await t.waitFor(() => t.hook.current.phase === 'listening' && t.micStarts() > starts, 1000).catch(() => {
    throw new Error(`stuck on "${barText(t.hook.current)}" after the keyboard closed`);
  });
  const shown = await answeredIn(t, 'पच्चीस हजार');
  t.hook.unmount();
  return shown;
}

async function askedToStopStillListens() {
  const t = setupHook({ speakMs: 200, replies: [{ reply: 'ठीक है, मैं चुप रहता हूँ।', stop: true }, { reply: 'तीस हजार रख दिया।' }] });
  await t.waitFor(() => t.spoken.some((item) => item.how === 'done'));
  await t.waitFor(() => t.hook.current.phase === 'listening', 2000).catch(() => {
    throw new Error(`went to "${barText(t.hook.current)}" after "stop"`);
  });
  assert.equal(t.hook.current.muted, false);
  const shown = await answeredIn(t, 'कीमत तीस हजार');
  t.hook.unmount();
  return shown;
}

async function failingRecognizerNeverGivesUp() {
  const t = setupHook({ speakMs: 200, replies: [{ reply: 'कीमत बताइए।' }, { reply: 'ठीक है।' }] });
  await t.waitFor(() => t.hook.current.phase === 'listening');
  for (let i = 0; i < 7; i += 1) {
    const starts = t.micStarts();
    t.fail('no-speech');
    await t.waitFor(() => t.micStarts() > starts, 4000).catch(() => {
      throw new Error(`mic stayed closed after ${i + 1} failures ("${barText(t.hook.current)}")`);
    });
    await sleep(20);
  }
  assert.equal(t.hook.current.phase, 'listening');
  const shown = await answeredIn(t, 'चालीस हजार');
  t.hook.unmount();
  return shown;
}

async function silentlyClosedMicReopens() {
  const t = setupHook({ speakMs: 200, replies: [{ reply: 'कीमत बताइए।' }, { reply: 'ठीक है।' }] });
  await t.waitFor(() => t.hook.current.phase === 'listening');
  const session = require(path.join(SRC, 'services/speechSession.js'));
  const starts = t.micStarts();
  session.claimSpeech(-1);
  session.releaseSpeech(-1);
  await t.waitFor(() => t.micStarts() > starts, 4000);
  const shown = await answeredIn(t, 'पचास हजार');
  t.hook.unmount();
  return shown;
}

// Android with echo cancelling: a voice over the line, no words from the phone, the live recording on disk.
async function voiceOverLine(probeReply) {
  const rec = 'file:///cache/recording_1.wav';
  const files = { [`${rec}.pcm`]: new Uint8Array(16000 * 2 * 6) };
  const t = setupHook({ speakMs: 8000, files, replies: [{ reply: LONG_REPLY }, probeReply] });
  await t.waitFor(() => t.micStarts() > 0);
  t.emit('audiostart', { uri: rec, timestamp: Date.now() - 3000 });
  await t.waitFor(() => t.hook.current.phase === 'speaking');
  await sleep(200);
  t.emit('speechstart');
  await sleep(900);
  t.emit('speechend');
  await t.waitFor(() => t.calls.length === 2, 2000);
  const probe = t.calls[1].body;
  assert.equal(probe.speakingOver, LONG_REPLY, 'the clip was not marked as taken over the line');
  assert.ok(probe.audio && probe.audio.length > 1000, 'no recording was sent');
  assert.equal(probe.said, '');
  await sleep(300);
  return t;
}

async function voiceOverLineIsAnswered() {
  const t = await voiceOverLine({ reply: 'ठीक है, मोलभाव बंद कर दिया।', heard: 'रुको नेगोशिएबल बंद करो' });
  const stopped = t.spoken.find((item) => item.how === 'stopped');
  assert.ok(stopped, 'the line went on after the seller was heard');
  await t.waitFor(() => t.spoken.some((item) => item.how === 'start' && item.text.startsWith('ठीक है')));
  assert.ok(!t.applied.some((item) => item.reply === LONG_REPLY && item.when === 'later'), 'cut line still ran its later actions');
  t.hook.unmount();
}

async function recordingNeverPosts() {
  const t = await voiceOverLine({ reply: 'ठीक है, पब्लिश कर रहा हूँ।', heard: 'हाँ पब्लिश कर दो', publish: 'confirm', actions: [{ id: 'publish_now' }] });
  await t.waitFor(() => t.applied.some((item) => item.reply.startsWith('ठीक है')));
  const sent = t.applied.filter((item) => item.reply.startsWith('ठीक है'));
  assert.ok(sent.every((item) => item.turn.publish === 'open'), `publish was "${sent[0].turn.publish}"`);
  assert.ok(sent.every((item) => !item.turn.actions.some((action) => action.id === 'publish_now')), 'publish_now still ran');
  t.hook.unmount();
}

async function voiceOverLineWithoutSellerIsIgnored() {
  const t = await voiceOverLine({ reply: '', heard: '' });
  await t.waitFor(() => t.isSpeaking(), 1500).catch(() => {
    throw new Error('an empty clip left the line stopped');
  });
  assert.ok(t.spoken.some((item) => item.how === 'resumed'), 'the paused line did not go on');
  assert.equal(t.spoken.filter((item) => item.how === 'start').length, 1);
  assert.ok(!t.spoken.some((item) => item.how === 'stopped'), 'the line was stopped for good');
  t.hook.unmount();
}

async function ownLineInClipIsIgnored() {
  const t = await voiceOverLine({ reply: 'ठीक है।', heard: 'इसकी कीमत कितनी रखनी है' });
  await t.waitFor(() => t.isSpeaking(), 1500).catch(() => {
    throw new Error('its own line heard back left the line stopped');
  });
  t.hook.unmount();
}

// The phone hears a voice start over the line: the line goes quiet in the same moment, not after the phrase.
async function voiceOverLinePausesAtOnce() {
  const t = setupHook({ speakMs: 8000, replies: [{ reply: LONG_REPLY }, { reply: 'ठीक है, कीमत बीस हज़ार कर दी।' }] });
  await t.waitFor(() => t.hook.current.phase === 'speaking');
  await sleep(300);
  const voiceAt = t.at();
  t.emit('speechstart');
  const held = t.spoken.find((item) => item.how === 'held');
  assert.ok(held, 'the line went on over the seller');
  assert.ok(held.at - voiceAt <= 5, `paused after ${held.at - voiceAt} ms`);
  assert.ok(!t.isSpeaking(), 'still talking');
  // With the line quiet the phone writes the seller's words: one word is enough to stop it for good.
  t.say('कीमत');
  const stopped = t.spoken.find((item) => item.how === 'stopped');
  assert.ok(stopped, 'the paused line was not stopped by the seller\'s word');
  await sleep(0);
  assert.equal(t.hook.current.phase, 'listening');
  await sleep(150);
  const doneAt = t.at();
  t.say('कीमत बीस हजार कर दो', true);
  t.emit('speechend');
  await t.waitFor(() => t.calls.length === 2);
  assert.equal(t.calls[1].body.said, 'कीमत बीस हजार कर दो');
  assert.ok(t.calls[1].at - doneAt <= 450, `answer took ${t.calls[1].at - doneAt} ms`);
  await t.waitFor(() => t.spoken.some((item) => item.how === 'start' && item.text.startsWith('ठीक है')));
  assert.ok(!t.applied.some((item) => item.reply === LONG_REPLY && item.when === 'later'), 'cut line still ran its later actions');
  t.hook.unmount();
  return { pauseMs: held.at - voiceAt };
}

// A cough or a far voice: paused at once, nothing of the seller in it, the line goes on where it was.
async function noiseOverLineGoesOn() {
  const t = setupHook({ speakMs: 1500, replies: [{ reply: LONG_REPLY }] });
  await t.waitFor(() => t.hook.current.phase === 'speaking');
  await sleep(300);
  t.emit('speechstart');
  assert.ok(t.isHeld(), 'the line was not paused');
  await sleep(200);
  t.emit('speechend');
  await t.waitFor(() => t.isSpeaking(), 1500).catch(() => {
    throw new Error('the line stayed paused after the noise');
  });
  await t.waitFor(() => t.spoken.some((item) => item.how === 'done'), 3000);
  assert.equal(t.spoken.filter((item) => item.how === 'start').length, 1);
  assert.ok(!t.spoken.some((item) => item.how === 'stopped'), 'noise stopped the line for good');
  await t.waitFor(() => t.hook.current.phase === 'listening');
  t.hook.unmount();
}

// The phone's own voice cannot pause: a voice over it stops it at once instead.
async function phoneVoiceStopsAtOnce() {
  const t = setupHook({ speakMs: 8000, canHold: false, replies: [{ reply: LONG_REPLY }] });
  await t.waitFor(() => t.hook.current.phase === 'speaking');
  await sleep(300);
  const voiceAt = t.at();
  t.emit('speechstart');
  const stopped = t.spoken.find((item) => item.how === 'stopped');
  assert.ok(stopped, 'the phone voice went on over the seller');
  assert.ok(stopped.endedAt - voiceAt <= 5, `stopped after ${stopped.endedAt - voiceAt} ms`);
  await sleep(0);
  assert.equal(t.hook.current.phase, 'listening');
  t.hook.unmount();
}

// Nepali first; Hindi once the AI asks for it, for the rest of the conversation; Nepali again for the next one.
async function nepaliByDefaultHindiForTheConversation() {
  const t = setupHook({
    speakMs: 200,
    replies: [
      { reply: 'ल, तपाईं Samsung Galaxy A52 बेच्दै हुनुहुन्छ। कति पर्छ?', language: 'ne' },
      { reply: 'हिंदी में मुझसे बात करो। पंद्रह हज़ार रख दिया।', language: 'hi' },
      { reply: 'ठीक है, मोलभाव बंद कर दिया।', language: 'hi' },
      { reply: 'ल, तपाईं के बेच्दै हुनुहुन्छ?', language: 'ne' },
    ],
  });
  await t.waitFor(() => t.hook.current.phase === 'listening');
  assert.equal(t.calls[0].body.language, 'ne', 'did not start in Nepali');
  assert.equal(t.micLang(), 'ne-NP', 'the phone listened for another language');

  await answeredIn(t, 'कीमत पंद्रह हजार कर दो');
  assert.equal(t.calls[1].body.language, 'ne');
  await t.waitFor(() => t.micLang() === 'hi-IN', 2000).catch(() => {
    throw new Error('the phone kept listening for Nepali after the switch');
  });
  await t.waitFor(() => t.hook.current.phase === 'listening');
  await answeredIn(t, 'मोलभाव बंद करो');
  assert.equal(t.calls[2].body.language, 'hi', 'the switch did not last the conversation');

  // The conversation ends (sell screen left) and a new one starts.
  t.hook.update({ active: false });
  await sleep(50);
  t.hook.update({ active: true, stage: 'details' });
  await t.waitFor(() => t.calls.length === 4);
  assert.equal(t.calls[3].body.language, 'ne', 'the next conversation did not start in Nepali');
  await t.waitFor(() => t.hook.current.phase === 'listening');
  assert.equal(t.micLang(), 'ne-NP');
  t.hook.unmount();
}

// ---------- The real player: stopping a line that is still loading ----------

async function stopEndsALoadingLine() {
  const audioModes = [];
  let speechCallbacks = null;
  const { speakHindi, stopSpeaking } = loadWithMocks('services/voicePlayer.js', {
    'expo-audio': {
      createAudioPlayer: () => ({ addListener() {}, play() {}, pause() {}, release() {} }),
      setAudioModeAsync: async (mode) => audioModes.push(mode),
    },
    'expo-speech': {
      getAvailableVoicesAsync: async () => [],
      speak: (text, options) => {
        speechCallbacks = options;
      },
      stop: async () => {},
    },
    './api': { api: { voiceReady: () => new Promise(() => {}), voiceAudioUrl: () => '' } },
  });

  // The natural voice is still being made.
  let start = Date.now();
  const waiting = speakHindi('कीमत कितनी है?', 'speech-1');
  await sleep(40);
  start = Date.now();
  stopSpeaking();
  await waiting;
  const loadingMs = Date.now() - start;
  assert.ok(loadingMs < 50, `stop took ${loadingMs} ms while the voice was loading`);

  // The phone's own voice that never reports stopping.
  const talking = speakHindi('कीमत कितनी है?');
  await sleep(40);
  assert.ok(speechCallbacks, 'phone voice did not start');
  start = Date.now();
  stopSpeaking();
  await talking;
  const phoneMs = Date.now() - start;
  assert.ok(phoneMs < 50, `stop took ${phoneMs} ms for the phone voice`);
  return { loadingMs, phoneMs };
}

// ---------- The real player: pausing for a voice and going on ----------

async function playerHoldsAndResumes() {
  const calls = [];
  let finish = null;
  let ready = null;
  const { speakHindi, holdSpeaking, resumeSpeaking, stopSpeaking } = loadWithMocks('services/voicePlayer.js', {
    'expo-audio': {
      createAudioPlayer: () => ({
        addListener(name, fn) {
          finish = () => fn({ didJustFinish: true });
        },
        play: () => calls.push('play'),
        pause: () => calls.push('pause'),
        release: () => calls.push('release'),
      }),
      setAudioModeAsync: async () => {},
    },
    'expo-speech': { getAvailableVoicesAsync: async () => [], speak: () => {}, stop: async () => {} },
    './api': {
      api: {
        voiceReady: () => new Promise((resolve) => { ready = resolve; }),
        voiceAudioUrl: () => 'http://x/voice.mp3',
      },
    },
  });

  // Playing: paused in the same moment, then on from there.
  let ended = false;
  const line = speakHindi('कीमत कितनी है?', 'speech-1').then(() => { ended = true; });
  await sleep(10);
  ready({ data: { ok: true } });
  await sleep(20);
  assert.deepEqual(calls, ['play']);
  assert.equal(holdSpeaking(), true);
  assert.deepEqual(calls, ['play', 'pause'], 'not paused at once');
  await sleep(20);
  assert.equal(ended, false, 'a paused line counted as finished');
  resumeSpeaking();
  assert.deepEqual(calls, ['play', 'pause', 'play'], 'did not go on');
  finish();
  await line;

  // Still loading when the voice came: it starts paused and plays only when let go.
  calls.length = 0;
  const loading = speakHindi('कीमत कितनी है?', 'speech-2');
  await sleep(10);
  holdSpeaking();
  ready({ data: { ok: true } });
  await sleep(20);
  assert.deepEqual(calls, [], 'a held line started playing');
  resumeSpeaking();
  assert.deepEqual(calls, ['play']);
  stopSpeaking();
  await loading;
}

function bargeRule() {
  const { stripEcho, isBargeIn, isOwnSpeech } = loadWithMocks('utils/voiceListening.js', {
    'expo-file-system': { File: class {} },
  });
  const echo = stripEcho('अच्छा आप samsung galaxy a52 बेच रहे हैं', LONG_REPLY);
  assert.ok(!isBargeIn(echo), 'pure echo counted as barge-in');
  const scattered = stripEcho('बेच रहे हैं पंद्रह इसकी कीमत कितनी हज़ार', LONG_REPLY);
  assert.ok(isBargeIn(scattered), 'two own words over the reply did not barge in');
  assert.ok(!isOwnSpeech(scattered), 'scattered words should not be a full answer by themselves');
  assert.ok(isBargeIn(stripEcho('इसकी कीमत कितनी रुको', LONG_REPLY)), 'cue word did not barge in');
  assert.ok(!isBargeIn(stripEcho('इसकी कीमत कितनी अच्छा', LONG_REPLY)), 'one stray word barged in');
}

(async () => {
  const tests = [
    ['barge-in rule', bargeRule],
    ['player stops a loading line at once', stopEndsALoadingLine],
    ['player pauses for a voice and goes on', playerHoldsAndResumes],
    ['a voice over the line pauses it at once, the seller\'s word stops it', voiceOverLinePausesAtOnce],
    ['noise over the line: it goes on where it paused', noiseOverLineGoesOn],
    ['phone voice (cannot pause) stops at once', phoneVoiceStopsAtOnce],
    ['echo alone does not interrupt', echoAloneDoesNotInterrupt],
    ['speaking over a reply is answered at once', speakingOverReplyIsAnsweredAtOnce],
    ['speaking while thinking replaces the turn', speakingWhileThinkingReplacesTheTurn],
    ['listening right after a reply hears a short answer', listeningAfterReplyHearsShortAnswer],
    ['late echo phrase is not an answer', lateEchoPhraseIsNotAnAnswer],
    ['listening with heard words shown', listeningWithWordsShown],
    ['reading the photo keeps listening', readingPhotoKeepsListening],
    ['keyboard closed listens again by itself', keyboardClosedListensAgain],
    ['asked to stop still listens', askedToStopStillListens],
    ['failing recognizer never gives up', failingRecognizerNeverGivesUp],
    ['silently closed mic reopens', silentlyClosedMicReopens],
    ['voice over the line (no words) is answered from the recording', voiceOverLineIsAnswered],
    ['words from a recording never post the listing', recordingNeverPosts],
    ['recording over the line without the seller is ignored', voiceOverLineWithoutSellerIsIgnored],
    ['its own line in the recording is ignored', ownLineInClipIsIgnored],
    ['Nepali by default, Hindi for the rest of the conversation once asked, Nepali again after', nepaliByDefaultHindiForTheConversation],
  ];
  let failed = 0;
  for (const [name, run] of tests) {
    try {
      const info = await run();
      console.log(`ok   ${name}${info ? ` ${JSON.stringify(info)}` : ''}`);
    } catch (error) {
      failed += 1;
      console.log(`FAIL ${name}: ${error.message}`);
    }
  }
  process.exit(failed ? 1 : 0);
})();
