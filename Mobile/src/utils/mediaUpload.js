import { api } from '../services/api';

function guessNameAndType(uri, fallbackName = 'upload.jpg') {
  const clean = String(uri || '').split('?')[0];
  const base = clean.split('/').pop() || fallbackName;
  const lower = base.toLowerCase();

  if (/\.(mp4|mov|m4v|webm)$/.test(lower)) {
    return {
      name: lower.endsWith('.mov') ? base : base.replace(/\.\w+$/, '') + '.mp4',
      type: lower.endsWith('.webm') ? 'video/webm' : 'video/mp4',
    };
  }

  if (lower.endsWith('.png')) return { name: base, type: 'image/png' };
  if (lower.endsWith('.webp')) return { name: base, type: 'image/webp' };
  if (lower.endsWith('.gif')) return { name: base, type: 'image/gif' };
  return {
    name: /\.(jpe?g)$/.test(lower) ? base : `${base.replace(/\.\w+$/, '') || 'photo'}.jpg`,
    type: 'image/jpeg',
  };
}

/** Already stored on API (or remote CDN / data URL) — do not re-upload. */
export function isRemoteMediaUrl(uri) {
  if (!uri || typeof uri !== 'string') return false;
  const u = uri.trim();
  if (!u) return false;
  if (u.startsWith('data:')) return true;
  if (u.startsWith('/uploads/')) return true;
  if (/^https?:\/\//i.test(u)) return true;
  return false;
}

/**
 * Upload a local image/video URI to the API. Returns a durable `/uploads/...` path.
 */
export async function uploadMediaUri(uri, folder = 'misc') {
  if (!uri) return { url: '', error: 'Missing file' };
  if (isRemoteMediaUrl(uri)) {
    return { url: uri, error: null };
  }

  const { name, type } = guessNameAndType(uri);
  const form = new FormData();
  form.append('file', {
    uri,
    name,
    type,
  });

  const { data, error } = await api.uploadMedia(form, folder);
  if (error || !data?.url) {
    return { url: '', error: error || 'Upload failed' };
  }
  return { url: data.url, error: null };
}

export async function uploadMediaUris(uris, folder = 'listings') {
  const out = [];
  for (const uri of uris || []) {
    if (!uri) continue;
    const { url, error } = await uploadMediaUri(uri, folder);
    if (error || !url) {
      return { urls: [], error: error || 'Upload failed' };
    }
    out.push(url);
  }
  return { urls: out, error: null };
}
