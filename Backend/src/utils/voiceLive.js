const crypto = require('crypto');
const WebSocket = require('ws');
const { candidateAccounts, getAiSettings, recordUsage } = require('./aiSettings');

// Gemini Live starts talking ~0.7 s after the text arrives and streams the rest in real time,
// where the speech (TTS) models only answer after the whole clip is made (4-5 s).
const LIVE_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const LIVE_MODELS = ['gemini-3.1-flash-live-preview', 'gemini-2.5-flash-native-audio-latest'];
const LIVE_VOICE = 'Kore';
const LIVE_RATE = 24000;
const READER = 'You are only a voice for the KinBech app, never a chat partner. Speak the user message exactly, '
  + 'word for word, in a warm, friendly, natural voice, then stop. Never answer it, never ask anything of your own, '
  + 'and never add or change a word.';
const SETUP_MS = 5000;
const FIRST_AUDIO_MS = 5000;
const MAX_SPEECH_MS = 30 * 1000;
const JOB_TTL_MS = 2 * 60 * 1000;

const jobs = new Map();

function quietSamples(pcm) {
  let sum = 0;
  const count = Math.floor(pcm.length / 2);
  for (let i = 0; i < count; i += 1) sum += Math.abs(pcm.readInt16LE(i * 2));
  return count && sum / count < QUIET_LEVEL ? count : 0;
}

const letters = (value) => String(value || '').replace(/[^\p{L}\p{M}\p{N}]/gu, '');

// Live sometimes keeps talking after the text (its own follow-up question). The spoken transcript
// shows when the text is done: about as long as the text and at a sentence end, or clearly longer.
// The transcript can run ahead of the audio, so speech then ends at the next pause, not at once.
const PAUSE_SAMPLES = LIVE_RATE * 0.2;
const QUIET_LEVEL = 400;
const TAIL_MS = 2500;

function spokeEverything(job, fragment) {
  const want = letters(job.text).length;
  if (!want) return false;
  const have = letters(job.said).length;
  return (have >= want * 0.92 && /[।?!.]\s*$/.test(fragment)) || have >= want * 1.15;
}

function notify(job) {
  job.listeners.forEach((listener) => listener());
}

function settleReady(job, ok) {
  if (job.ready !== null) return;
  job.ready = ok;
  job.readyWaiters.splice(0).forEach((resolve) => resolve(ok));
}

function finish(job, failed) {
  if (job.done) return;
  job.done = true;
  job.failed = failed;
  clearTimeout(job.timer);
  clearTimeout(job.firstTimer);
  clearTimeout(job.tailTimer);
  settleReady(job, !failed && job.chunks.length > 0);
  try {
    job.ws?.close();
  } catch {
    /* already closed */
  }
  notify(job);
}

function closeText(code, reason) {
  return String(reason || '').trim() || `closed (${code})`;
}

/** Opens a Live session and waits for it to be ready for text. Audio parts go into `job`. */
function connectModel(job, account, model) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    let ready = false;
    const ws = new WebSocket(`${LIVE_URL}?key=${encodeURIComponent(account.apiKey)}`);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('Live setup timed out'));
    }, SETUP_MS);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        setup: {
          model: `models/${model}`,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: LIVE_VOICE } } },
          },
          systemInstruction: { parts: [{ text: READER }] },
          outputAudioTranscription: {},
        },
      }));
    });
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.setupComplete) {
        ready = true;
        clearTimeout(timer);
        resolve(ws);
        return;
      }
      const said = msg.serverContent?.outputTranscription?.text;
      if (said) job.said += said;
      if (said && job.text && !job.ending && spokeEverything(job, said)) {
        job.ending = true;
        job.quiet = 0;
        job.tailTimer = setTimeout(() => finish(job, job.chunks.length === 0), TAIL_MS);
      }
      const parts = msg.serverContent?.modelTurn?.parts || [];
      let added = false;
      parts.forEach((part) => {
        if (!part?.inlineData?.data || job.done) return;
        const pcm = Buffer.from(part.inlineData.data, 'base64');
        job.chunks.push(pcm);
        added = true;
        if (!job.ending) return;
        const quiet = quietSamples(pcm);
        job.quiet = quiet ? job.quiet + quiet : 0;
        if (job.quiet >= PAUSE_SAMPLES) finish(job, false);
      });
      if (added) {
        settleReady(job, true);
        notify(job);
      }
      if (msg.serverContent?.turnComplete) {
        recordUsage(model, {
          ok: true,
          account,
          purpose: 'voice-tts',
          userId: job.userId,
          status: 200,
          ms: Date.now() - (job.saidAt || started),
        });
        finish(job, job.chunks.length === 0);
      }
    });
    ws.on('close', (code, reason) => {
      clearTimeout(timer);
      if (!ready) {
        reject(new Error(closeText(code, reason)));
        return;
      }
      finish(job, job.chunks.length === 0);
    });
    ws.on('error', (error) => {
      clearTimeout(timer);
      if (!ready) reject(error);
    });
  });
}

async function connect(job) {
  const accounts = candidateAccounts(await getAiSettings());
  for (const account of accounts.slice(0, 2)) {
    for (const model of LIVE_MODELS) {
      if (job.done) return false;
      try {
        job.ws = await connectModel(job, account, model);
        job.model = model;
        return true;
      } catch (error) {
        const message = String(error.message || error);
        recordUsage(model, {
          ok: false,
          quota: /quota|exhaust|limit/i.test(message),
          account,
          purpose: 'voice-tts',
          userId: job.userId,
          errorType: /quota|exhaust|limit/i.test(message) ? 'quota_day' : 'server_error',
          error: message,
        });
        console.warn(`[ai] live voice ${account.label} / ${model}: ${message}`);
      }
    }
  }
  return false;
}

/**
 * Starts a Live voice session now (while the answer is still being made) and returns
 * `say(text)`, which gives an id the app plays from `/ai/voice-audio/:id`, and `cancel()`.
 */
function openLiveSpeech({ userId = '' } = {}) {
  const job = {
    id: crypto.randomUUID(),
    userId,
    chunks: [],
    listeners: new Set(),
    readyWaiters: [],
    ready: null,
    done: false,
    failed: false,
    ws: null,
    timer: null,
    firstTimer: null,
    saidAt: 0,
    text: '',
    said: '',
    ending: false,
    quiet: 0,
    tailTimer: null,
  };
  jobs.set(job.id, job);
  setTimeout(() => {
    finish(job, true);
    jobs.delete(job.id);
  }, JOB_TTL_MS).unref?.();
  const connected = connect(job).catch(() => false);

  return {
    say(text) {
      connected.then((ok) => {
        if (!ok || job.done || job.ws?.readyState !== WebSocket.OPEN) {
          finish(job, true);
          return;
        }
        job.saidAt = Date.now();
        job.text = text;
        const turn = /^gemini-[3-9]/.test(job.model)
          ? { realtimeInput: { text } }
          : { clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } };
        job.ws.send(JSON.stringify(turn));
        job.firstTimer = setTimeout(() => {
          if (!job.chunks.length) finish(job, true);
        }, FIRST_AUDIO_MS);
        job.timer = setTimeout(() => finish(job, job.chunks.length === 0), MAX_SPEECH_MS);
      });
      return job.id;
    },
    cancel() {
      finish(job, true);
      jobs.delete(job.id);
    },
  };
}

/** True once the first audio of `id` has arrived; false when it failed or never came. */
function waitSpeechReady(id, timeoutMs = 8000) {
  const job = jobs.get(String(id || ''));
  if (!job) return Promise.resolve(false);
  if (job.ready !== null) return Promise.resolve(job.ready);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    job.readyWaiters.push((ok) => {
      clearTimeout(timer);
      resolve(ok);
    });
  });
}

// While streaming the length is unknown, so the header claims the most; players stop at the end of the stream.
function wavHeader(size = 0x7fffffff - 44) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(size + 36, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(LIVE_RATE, 24);
  header.writeUInt32LE(LIVE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(size, 40);
  return header;
}

function sendWhole(job, res) {
  if (!job.chunks.length) {
    res.status(503).end();
    return;
  }
  const pcm = Buffer.concat(job.chunks);
  res.writeHead(200, { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store', 'Content-Length': pcm.length + 44 });
  res.end(Buffer.concat([wavHeader(pcm.length), pcm]));
}

/**
 * Streams the speech for `id` as WAV while it is still being spoken, or with `full` sends it
 * once complete. False when there is no such speech.
 */
function pipeSpeech(id, res, { full = false } = {}) {
  const job = jobs.get(String(id || ''));
  if (!job || (job.done && !job.chunks.length)) return false;
  if (full) {
    if (job.done) {
      sendWhole(job, res);
      return true;
    }
    const wait = () => {
      if (!job.done) return;
      job.listeners.delete(wait);
      sendWhole(job, res);
    };
    job.listeners.add(wait);
    res.on('close', () => job.listeners.delete(wait));
    return true;
  }
  res.writeHead(200, { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
  res.write(wavHeader());
  let sent = 0;
  const stop = () => job.listeners.delete(flush);
  function flush() {
    while (sent < job.chunks.length) {
      res.write(job.chunks[sent]);
      sent += 1;
    }
    if (job.done) {
      stop();
      res.end();
    }
  }
  job.listeners.add(flush);
  res.on('close', stop);
  flush();
  return true;
}

function speechJob(id) {
  return jobs.get(String(id || '')) || null;
}

module.exports = { openLiveSpeech, pipeSpeech, speechJob, waitSpeechReady };
