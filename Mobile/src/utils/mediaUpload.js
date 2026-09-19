import * as FileSystem from 'expo-file-system/legacy';
import { api } from '../services/api';

function guessNameAndType(uri, fallbackName = 'upload.jpg') {
  const clean = String(uri || '').split('?')[0];
  const base = clean.split('/').pop() || fallbackName;
  const lower = decodeURIComponent(base).toLowerCase();

  if (/\.(mp4|mov|m4v|webm)$/.test(lower)) {
    return {
      name: lower.endsWith('.mov') ? base : `${base.replace(/\.\w+$/, '') || 'video'}.mp4`,
      type: lower.endsWith('.webm') ? 'video/webm' : 'video/mp4',
    };
  }

  if (lower.endsWith('.png')) return { name: 'photo.png', type: 'image/png' };
  if (lower.endsWith('.webp')) return { name: 'photo.webp', type: 'image/webp' };
  if (lower.endsWith('.gif')) return { name: 'photo.gif', type: 'image/gif' };
  return { name: 'photo.jpg', type: 'image/jpeg' };
}

/** Already stored on API (or remote CDN) — do not re-upload. */
export function isRemoteMediaUrl(uri) {
  if (!uri || typeof uri !== 'string') return false;
  const u = uri.trim();
  if (!u) return false;
  if (u.startsWith('/uploads/')) return true;
  if (/^https?:\/\//i.test(u) && !u.includes('/ImagePicker/') && !u.includes('/Caches/')) {
    return true;
  }
  return false;
}

/**
 * Upload local media as JSON base64 (Expo-safe; avoids FormDataPart errors).
 * Returns durable `/uploads/...` path.
 */
export async function uploadMediaUri(uri, folder = 'misc') {
  if (!uri) return { url: '', error: 'Missing file' };

  // Already a data URL — send as-is payload
  if (String(uri).startsWith('data:')) {
    const match = String(uri).match(/^data:([^;]+);base64,(.+)$/i);
    const mimeType = match?.[1] || 'image/jpeg';
    const data = match?.[2] || '';
    if (!data) return { url: '', error: 'Invalid image data' };
    const { data: res, error } = await api.uploadMediaBase64({
      folder,
      mimeType,
      data,
      filename: guessNameAndType(uri).name,
    });
    if (error || !res?.url) return { url: '', error: error || 'Upload failed' };
    return { url: res.url, error: null };
  }

  if (isRemoteMediaUrl(uri)) {
    return { url: uri, error: null };
  }

  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info?.exists) {
      return { url: '', error: 'Local photo file not found. Please pick the image again.' };
    }

    const { name, type } = guessNameAndType(uri);
    const data = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (!data) {
      return { url: '', error: 'Could not read photo file' };
    }

    const { data: res, error } = await api.uploadMediaBase64({
      folder,
      mimeType: type,
      data,
      filename: name,
    });

    if (error || !res?.url) {
      return { url: '', error: error || 'Upload failed' };
    }
    return { url: res.url, error: null };
  } catch (err) {
    return { url: '', error: err?.message || 'Upload failed' };
  }
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
