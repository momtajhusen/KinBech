const fs = require('fs');
const {
  isEnabled: nsfwEnabled,
  isImageUpload,
  classifyImageBuffer,
  classifyImageFile,
  warmupNsfwModel,
} = require('./nsfwImageCheck');

/**
 * Full image safety gate:
 *  - NSFW (porn / sexy / hentai)
 *  - Stock / watermark / fake catalog photos (OCR + light heuristics)
 *  - Weapon-related text burned into images (OCR)
 *
 * Env:
 *   IMAGE_SAFETY_ENABLED=true
 *   IMAGE_OCR_ENABLED=true
 *   IMAGE_SAFETY_FAIL_OPEN=true
 */

const STOCK_WATERMARK_PATTERNS = [
  /shutter\s*stock/i,
  /getty\s*images?/i,
  /\bistock\b/i,
  /adobe\s*stock/i,
  /dreamstime/i,
  /\balamy\b/i,
  /deposit\s*photos?/i,
  /\b123rf\b/i,
  /stock\s*photo/i,
  /stock\s*image/i,
  /royalty\s*free/i,
  /watermark/i,
  /sample\s*image/i,
  /for\s*illustration/i,
  /preview\s*only/i,
  /not\s*actual\s*product/i,
  /image\s*for\s*reference/i,
  /demo\s*image/i,
  /placeholder/i,
  /unsplash/i,
  /pexels\.com/i,
  /pixabay/i,
];

const WEAPON_OCR_PATTERNS = [
  /\b(gun|guns|pistol|pistols|rifle|rifles|shotgun|firearm|firearms)\b/i,
  /\b(ammunition|ammo|bullets?|revolver|carbine)\b/i,
  /\b(ak[-\s]?47|ar[-\s]?15|glock|beretta|uzi)\b/i,
  /\b(air\s*gun|airgun|bb\s*gun|pellet\s*gun)\b/i,
  /\b(hand\s*grenade|explosive|bomb\s*making)\b/i,
  /(बन्दुक|हतियार|गोली)/,
];

const ADULT_OCR_PATTERNS = [
  /\b(porn|porno|xxx|onlyfans|nsfw|nude|nudes|sex\s*tape)\b/i,
  /\b(escort\s*service|call\s*girl)\b/i,
];

const FRAUD_OCR_PATTERNS = [
  /\b(fake\s*certificate|cloned\s*imei|blacklisted\s*imei)\b/i,
  /\b(scam\s*alert|not\s*responsible\s*after\s*sale)\b/i,
];

let ocrWorkerPromise = null;

function envFlag(name, defaultTrue = true) {
  const raw = String(process.env[name] ?? (defaultTrue ? 'true' : 'false')).toLowerCase();
  if (defaultTrue) return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== 'no';
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

function safetyEnabled() {
  return envFlag('IMAGE_SAFETY_ENABLED', true);
}

function ocrEnabled() {
  return envFlag('IMAGE_OCR_ENABLED', true);
}

function failOpen() {
  return envFlag('IMAGE_SAFETY_FAIL_OPEN', true);
}

function shouldDeepScan(folder) {
  const f = String(folder || 'misc').toLowerCase();
  // Listings & misc product shots — full scan. Avatars/shops docs — NSFW only.
  return f === 'listings' || f === 'misc';
}

async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const { createWorker } = require('tesseract.js');
      const worker = await createWorker('eng');
      console.log('[image-safety] OCR worker ready');
      return worker;
    })().catch((err) => {
      ocrWorkerPromise = null;
      throw err;
    });
  }
  return ocrWorkerPromise;
}

async function prepareOcrBuffer(buffer) {
  const sharp = require('sharp');
  return sharp(buffer)
    .rotate()
    .resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true })
    .greyscale()
    .normalize()
    .sharpen()
    .jpeg({ quality: 85 })
    .toBuffer();
}

/**
 * Soft heuristic: large semi-transparent overlays / repeating diagonal bands
 * often appear on stock previews. Not definitive alone — used with OCR.
 */
async function watermarkHeuristicScore(buffer) {
  try {
    const sharp = require('sharp');
    const { data, info } = await sharp(buffer)
      .rotate()
      .resize(160, 160, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = info.width;
    const h = info.height;
    // Sample diagonal bands for mid-gray repeating streaks (classic watermark look)
    let midGray = 0;
    let samples = 0;
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        const v = data[y * w + x];
        if (v > 90 && v < 180) midGray += 1;
        samples += 1;
      }
    }
    const midRatio = samples ? midGray / samples : 0;

    // Edge density in center vs corners — watermarks often sit center/diagonal
    let edge = 0;
    for (let y = 1; y < h - 1; y += 3) {
      for (let x = 1; x < w - 1; x += 3) {
        const c = data[y * w + x];
        const r = data[y * w + x + 1];
        if (Math.abs(c - r) > 28) edge += 1;
      }
    }
    const edgeRatio = edge / Math.max(1, Math.floor((h * w) / 9));

    // High mid-gray + moderate edges → suspicious watermark veil
    let score = 0;
    if (midRatio > 0.42 && edgeRatio > 0.08 && edgeRatio < 0.35) score = 0.55;
    if (midRatio > 0.55 && edgeRatio > 0.1) score = 0.75;
    return { score, midRatio, edgeRatio };
  } catch {
    return { score: 0, midRatio: 0, edgeRatio: 0 };
  }
}

function matchPatterns(text, patterns) {
  const hits = [];
  for (const re of patterns) {
    const m = String(text || '').match(re);
    if (m) hits.push(m[0]);
  }
  return [...new Set(hits.map((h) => h.toLowerCase()))];
}

async function runOcrScan(buffer) {
  if (!ocrEnabled()) {
    return { text: '', skipped: true };
  }
  try {
    const prepared = await prepareOcrBuffer(buffer);
    const worker = await getOcrWorker();
    const {
      data: { text },
    } = await worker.recognize(prepared);
    return { text: String(text || ''), skipped: false };
  } catch (error) {
    console.warn('[image-safety] OCR failed:', error.message || error);
    if (failOpen()) return { text: '', skipped: true, error: error.message };
    throw error;
  }
}

/**
 * Deep safety scan for listing photos.
 */
async function analyzeImageBuffer(buffer, { folder } = {}) {
  const issues = [];
  const detail = {};

  // 1) NSFW
  if (nsfwEnabled()) {
    const nsfw = await classifyImageBuffer(buffer);
    detail.nsfw = nsfw.scores || null;
    if (!nsfw.safe && !nsfw.skipped) {
      issues.push({
        code: 'NSFW_BLOCKED',
        message:
          'This image looks sexual or inappropriate and was blocked. Upload a clear product photo.',
        reasons: nsfw.reasons || [],
      });
    }
  }

  const deep = shouldDeepScan(folder);
  if (!deep) {
    return { safe: issues.length === 0, issues, detail };
  }

  // 2) Watermark heuristic
  const heuristic = await watermarkHeuristicScore(buffer);
  detail.watermarkHeuristic = heuristic;

  // 3) OCR for stock / weapons / adult / fraud text in image
  const ocr = await runOcrScan(buffer);
  detail.ocrSkipped = Boolean(ocr.skipped);
  const text = ocr.text || '';

  const stockHits = matchPatterns(text, STOCK_WATERMARK_PATTERNS);
  const weaponHits = matchPatterns(text, WEAPON_OCR_PATTERNS);
  const adultHits = matchPatterns(text, ADULT_OCR_PATTERNS);
  const fraudHits = matchPatterns(text, FRAUD_OCR_PATTERNS);

  detail.ocrHits = { stockHits, weaponHits, adultHits, fraudHits };

  if (stockHits.length || (heuristic.score >= 0.75 && stockHits.length === 0 && text.length < 8)) {
    // Strong heuristic alone is soft — only block if OCR also finds stock OR score very high with long diagonal veil
    if (stockHits.length) {
      issues.push({
        code: 'STOCK_OR_WATERMARK',
        message:
          'This looks like a stock / watermarked photo. Upload a real photo of your own item to avoid scams.',
        reasons: stockHits,
      });
    } else if (heuristic.score >= 0.75) {
      issues.push({
        code: 'SUSPECT_WATERMARK',
        message:
          'This photo may be watermarked or fake. Please upload a clear original photo of the actual item.',
        reasons: [`watermark_score ${Math.round(heuristic.score * 100)}%`],
      });
    }
  }

  if (weaponHits.length) {
    issues.push({
      code: 'WEAPON_IMAGE',
      message:
        'Weapons and firearms cannot be listed on KinBech. This image was blocked.',
      reasons: weaponHits,
    });
  }

  if (adultHits.length) {
    issues.push({
      code: 'ADULT_IMAGE_TEXT',
      message: 'Adult or sexual content is not allowed. Image blocked.',
      reasons: adultHits,
    });
  }

  if (fraudHits.length) {
    issues.push({
      code: 'FRAUD_IMAGE_TEXT',
      message: 'This image has text that looks fraudulent or misleading. Upload a honest product photo.',
      reasons: fraudHits,
    });
  }

  return { safe: issues.length === 0, issues, detail };
}

async function analyzeImageFile(filePath, opts) {
  const buffer = await fs.promises.readFile(filePath);
  return analyzeImageBuffer(buffer, opts);
}

/**
 * Gate used by /media upload routes.
 */
async function gateImageUpload({ buffer, filePath, mimeType, filename, folder }) {
  if (!isImageUpload({ mimeType, filename, filePath })) {
    return { ok: true, skipped: true };
  }
  if (!safetyEnabled()) {
    return { ok: true, skipped: true };
  }

  try {
    const result = buffer
      ? await analyzeImageBuffer(buffer, { folder })
      : await analyzeImageFile(filePath, { folder });

    if (result.safe) {
      return { ok: true, safety: result };
    }

    if (filePath) {
      try {
        await fs.promises.unlink(filePath);
      } catch {
        /* ignore */
      }
    }

    const primary = result.issues[0];
    return {
      ok: false,
      status: 422,
      body: {
        message: primary?.message || 'This image was blocked by safety checks.',
        code: primary?.code || 'IMAGE_BLOCKED',
        detail: (primary?.reasons || []).join(', '),
        issues: result.issues.map((i) => ({
          code: i.code,
          message: i.message,
          reasons: i.reasons,
        })),
        folder: folder || undefined,
      },
    };
  } catch (error) {
    console.error('[image-safety] gate error:', error.message || error);
    if (failOpen()) {
      return { ok: true, skipped: true, error: error.message };
    }
    return {
      ok: false,
      status: 503,
      body: {
        message: 'Image safety check is temporarily unavailable. Please try again.',
        code: 'IMAGE_SAFETY_UNAVAILABLE',
      },
    };
  }
}

function warmupImageSafety() {
  warmupNsfwModel();
  if (!ocrEnabled() || !safetyEnabled()) return;
  setTimeout(() => {
    getOcrWorker().catch((err) => {
      console.warn('[image-safety] OCR warmup failed:', err.message || err);
    });
  }, 4000);
}

module.exports = {
  gateImageUpload,
  analyzeImageBuffer,
  analyzeImageFile,
  warmupImageSafety,
  shouldDeepScan,
  isImageUpload,
};
