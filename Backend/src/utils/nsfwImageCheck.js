const fs = require('fs');

/**
 * NSFW auto-detection for uploaded images (nsfwjs + sharp + TF.js WASM).
 *
 * Env:
 *   NSFW_ENABLED=false          — disable checks
 *   NSFW_FAIL_OPEN=false        — block uploads if the model fails (default: allow)
 *   NSFW_PORN_THRESHOLD=0.55
 *   NSFW_HENTAI_THRESHOLD=0.55
 *   NSFW_SEXY_THRESHOLD=0.78
 */

const IMAGE_MIME_RE = /^image\//i;
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|bmp)$/i;

let modelPromise = null;

function envFloat(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

function isEnabled() {
  const raw = String(process.env.NSFW_ENABLED || 'true').toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== 'no';
}

function failOpen() {
  const raw = String(process.env.NSFW_FAIL_OPEN || 'true').toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== 'no';
}

function thresholds() {
  return {
    porn: envFloat('NSFW_PORN_THRESHOLD', 0.55),
    hentai: envFloat('NSFW_HENTAI_THRESHOLD', 0.55),
    sexy: envFloat('NSFW_SEXY_THRESHOLD', 0.78),
  };
}

function isImageUpload({ mimeType, filename, filePath }) {
  if (mimeType && IMAGE_MIME_RE.test(mimeType)) return true;
  const name = filename || filePath || '';
  return IMAGE_EXT_RE.test(String(name));
}

async function ensureModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const tf = require('@tensorflow/tfjs');
      require('@tensorflow/tfjs-backend-wasm');
      // Prefer WASM — no native TF C++ build required on VPS
      await tf.setBackend('wasm');
      await tf.ready();

      const nsfwjs = require('nsfwjs');
      // MobileNetV2 mid — good accuracy / size tradeoff; caches after first download
      const model = await nsfwjs.load('MobileNetV2Mid');
      console.log('[nsfw] model ready (backend=%s)', tf.getBackend());
      return { tf, model };
    })().catch((err) => {
      modelPromise = null;
      throw err;
    });
  }
  return modelPromise;
}

function scoresFromPredictions(predictions) {
  const map = {
    Drawing: 0,
    Hentai: 0,
    Neutral: 0,
    Porn: 0,
    Sexy: 0,
  };
  (predictions || []).forEach((p) => {
    if (p && map[p.className] !== undefined) {
      map[p.className] = Number(p.probability) || 0;
    }
  });
  return map;
}

function decide(scores) {
  const t = thresholds();
  const reasons = [];
  if (scores.Porn >= t.porn) reasons.push(`porn ${Math.round(scores.Porn * 100)}%`);
  if (scores.Hentai >= t.hentai) reasons.push(`hentai ${Math.round(scores.Hentai * 100)}%`);
  if (scores.Sexy >= t.sexy) reasons.push(`sexy ${Math.round(scores.Sexy * 100)}%`);
  // Combined adult signal
  if (scores.Porn + scores.Hentai >= 0.7) {
    if (!reasons.length) {
      reasons.push(`adult ${Math.round((scores.Porn + scores.Hentai) * 100)}%`);
    }
  }
  return {
    safe: reasons.length === 0,
    reasons,
    scores,
  };
}

/**
 * Classify image bytes. Returns { safe, skipped?, error?, scores?, reasons? }.
 */
async function classifyImageBuffer(buffer) {
  if (!isEnabled()) {
    return { safe: true, skipped: true, reason: 'disabled' };
  }
  if (!buffer || !buffer.length) {
    return { safe: false, reasons: ['empty'], scores: null };
  }

  try {
    const sharp = require('sharp');
    const { tf, model } = await ensureModel();

    const { data, info } = await sharp(buffer)
      .rotate() // honor EXIF orientation
      .toColourspace('srgb')
      .resize(224, 224, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (info.channels !== 3) {
      return { safe: true, skipped: true, reason: 'unsupported_channels' };
    }

    const image = tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], 'int32');
    let predictions;
    try {
      predictions = await model.classify(image);
    } finally {
      image.dispose();
    }

    const scores = scoresFromPredictions(predictions);
    const verdict = decide(scores);
    return {
      safe: verdict.safe,
      scores,
      reasons: verdict.reasons,
      predictions,
    };
  } catch (error) {
    console.error('[nsfw] classify failed:', error.message || error);
    if (failOpen()) {
      return { safe: true, skipped: true, error: error.message || String(error) };
    }
    return {
      safe: false,
      error: error.message || String(error),
      reasons: ['scanner_unavailable'],
    };
  }
}

async function classifyImageFile(filePath) {
  const buffer = await fs.promises.readFile(filePath);
  return classifyImageBuffer(buffer);
}

/**
 * Run NSFW gate for an upload. Deletes filePath on reject when provided.
 * @returns {{ ok: true } | { ok: false, status: number, body: object }}
 */
async function gateImageUpload({ buffer, filePath, mimeType, filename, folder }) {
  if (!isImageUpload({ mimeType, filename, filePath })) {
    return { ok: true, skipped: true };
  }

  // Verification docs / category admin icons rarely need NSFW; still scan listings & avatars always
  const result = buffer
    ? await classifyImageBuffer(buffer)
    : await classifyImageFile(filePath);

  if (result.safe) {
    return { ok: true, nsfw: result };
  }

  if (filePath) {
    try {
      await fs.promises.unlink(filePath);
    } catch {
      /* ignore */
    }
  }

  const detail = (result.reasons || []).join(', ') || 'inappropriate content';
  return {
    ok: false,
    status: 422,
    body: {
      message:
        'This image looks inappropriate and was blocked. Please upload a clear product or profile photo.',
      code: 'NSFW_BLOCKED',
      detail,
      folder: folder || undefined,
      scores: result.scores
        ? {
            porn: Math.round(scoresPct(result.scores.Porn)),
            hentai: Math.round(scoresPct(result.scores.Hentai)),
            sexy: Math.round(scoresPct(result.scores.Sexy)),
            neutral: Math.round(scoresPct(result.scores.Neutral)),
          }
        : undefined,
    },
  };
}

function scoresPct(n) {
  return (Number(n) || 0) * 100;
}

/** Warm model in background after server boot (non-blocking). */
function warmupNsfwModel() {
  if (!isEnabled()) return;
  setTimeout(() => {
    ensureModel().catch((err) => {
      console.warn('[nsfw] warmup failed:', err.message || err);
    });
  }, 2500);
}

module.exports = {
  isEnabled,
  isImageUpload,
  classifyImageBuffer,
  classifyImageFile,
  gateImageUpload,
  warmupNsfwModel,
  ensureModel,
};
