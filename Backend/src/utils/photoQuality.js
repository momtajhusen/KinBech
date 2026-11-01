const sharp = require('sharp');

/**
 * Pixel checks for a listing photo that a buyer could not read: almost one flat colour,
 * nearly black, or so blurred there are no edges left. No AI involved, so it works when the
 * AI is busy and costs nothing. Kept strict on purpose: a dim or soft but real photo passes.
 */
const SIZE = 384;
const BLANK_STDEV = 7;
const DARK_MEAN = 22;
const BRIGHT_MEAN = 246;
// Edge strength against contrast, so a dim but sharp photo is not called blurry.
// Real listing photos measured 0.2 and up; a heavy blur drops below 0.04.
const BLUR_EDGE_RATIO = 0.06;
const BLUR_EDGE_MIN = 2.5;

function spread(values) {
  let sum = 0;
  for (const value of values) sum += value;
  const mean = sum / values.length;
  let squares = 0;
  for (const value of values) squares += (value - mean) ** 2;
  return { mean, stdev: Math.sqrt(squares / values.length) };
}

/** Brightness, contrast and edge strength (Laplacian spread) of a small grey copy. */
async function measurePhoto(buffer) {
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize(SIZE, SIZE, { fit: 'inside' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const laplacian = new Float32Array((width - 2) * (height - 2));
  let index = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const at = y * width + x;
      laplacian[index] = data[at - width] + data[at + width] + data[at - 1] + data[at + 1] - 4 * data[at];
      index += 1;
    }
  }
  const tone = spread(data);
  return { mean: tone.mean, stdev: tone.stdev, edges: spread(laplacian).stdev };
}

/** 'blank', 'too_dark', 'blurry' or '' for a photo that looks fine. */
async function photoPixelIssue(buffer) {
  try {
    const { mean, stdev, edges } = await measurePhoto(buffer);
    if (stdev < BLANK_STDEV) return 'blank';
    if (mean < DARK_MEAN) return 'too_dark';
    if (mean > BRIGHT_MEAN && stdev < 18) return 'blank';
    if (edges < BLUR_EDGE_MIN || edges / stdev < BLUR_EDGE_RATIO) return 'blurry';
    return '';
  } catch {
    return '';
  }
}

module.exports = { measurePhoto, photoPixelIssue };
