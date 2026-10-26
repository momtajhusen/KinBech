/**
 * Real file type from magic bytes. The client-sent MIME type and file name are never trusted.
 * Returns { mime, ext, kind } with kind image | video | audio | pdf, or null when unknown.
 */
function detectFileType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const b = buffer;
  const ascii = (start, end) => b.toString('latin1', start, end);

  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: '.jpg', kind: 'image' };
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return { mime: 'image/png', ext: '.png', kind: 'image' };
  if (ascii(0, 4) === 'GIF8') return { mime: 'image/gif', ext: '.gif', kind: 'image' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { mime: 'image/webp', ext: '.webp', kind: 'image' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return { mime: 'audio/wav', ext: '.wav', kind: 'audio' };
  if (ascii(0, 5) === '%PDF-') return { mime: 'application/pdf', ext: '.pdf', kind: 'pdf' };
  if (ascii(0, 5) === '#!AMR') return { mime: 'audio/amr', ext: '.amr', kind: 'audio' };
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { mime: 'video/webm', ext: '.webm', kind: 'video' };
  if (ascii(0, 3) === 'ID3') return { mime: 'audio/mpeg', ext: '.mp3', kind: 'audio' };
  // MPEG audio frame sync (mp3) and ADTS (aac).
  if (b[0] === 0xff && (b[1] & 0xf6) === 0xf0) return { mime: 'audio/aac', ext: '.aac', kind: 'audio' };
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return { mime: 'audio/mpeg', ext: '.mp3', kind: 'audio' };

  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12).toLowerCase();
    if (brand.startsWith('3gp') || brand.startsWith('3g2')) return { mime: 'audio/3gpp', ext: '.3gp', kind: 'audio' };
    if (brand === 'm4a ' || brand === 'm4b ' || brand === 'f4a ') return { mime: 'audio/mp4', ext: '.m4a', kind: 'audio' };
    if (brand === 'qt  ') return { mime: 'video/quicktime', ext: '.mov', kind: 'video' };
    if (['heic', 'heix', 'mif1', 'msf1', 'avif'].includes(brand)) return null;
    return { mime: 'video/mp4', ext: '.mp4', kind: 'video' };
  }
  return null;
}

function declaredKind(mimeType) {
  const mime = String(mimeType || '').toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  const top = mime.split('/')[0];
  return ['image', 'video', 'audio'].includes(top) ? top : '';
}

/**
 * Voice notes recorded as .m4a / .3gp share the mp4 container with video,
 * so audio <-> video is allowed when the declared type says audio.
 */
function kindsMatch(declared, detected) {
  if (!declared || !detected) return false;
  if (declared === detected.kind) return true;
  return declared === 'audio' && detected.kind === 'video';
}

module.exports = { detectFileType, declaredKind, kindsMatch };
