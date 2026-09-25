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

const SAFETY_CODES = new Set([
  'NSFW_BLOCKED',
  'ADULT_IMAGE_TEXT',
  'WEAPON_IMAGE',
  'STOCK_OR_WATERMARK',
  'SUSPECT_WATERMARK',
  'FRAUD_IMAGE_TEXT',
  'IMAGE_BLOCKED',
  'IMAGE_SAFETY_UNAVAILABLE',
]);

function uploadFailure(error, data) {
  const code = data?.code || '';
  const message = data?.message || error || 'Upload failed';
  return {
    url: '',
    error: message,
    errorCode: code,
    errorTitle: data?.title || null,
    issues: data?.issues || null,
    isSafetyBlock: SAFETY_CODES.has(code),
  };
}

/**
 * Upload local media as JSON base64 (Expo-safe; avoids FormDataPart errors).
 * Returns durable `/uploads/...` path.
 */
export async function uploadMediaUri(uri, folder = 'misc') {
  if (!uri) return uploadFailure('Missing file');

  // Already a data URL — send as-is payload
  if (String(uri).startsWith('data:')) {
    const match = String(uri).match(/^data:([^;]+);base64,(.+)$/i);
    const mimeType = match?.[1] || 'image/jpeg';
    const data = match?.[2] || '';
    if (!data) return uploadFailure('Invalid image data');
    const result = await api.uploadMediaBase64({
      folder,
      mimeType,
      data,
      filename: guessNameAndType(uri).name,
    });
    if (result.error || !result.data?.url) {
      return uploadFailure(result.error || 'Upload failed', result.data);
    }
    return { url: result.data.url, error: null, errorCode: null, isSafetyBlock: false };
  }

  if (isRemoteMediaUrl(uri)) {
    return { url: uri, error: null, errorCode: null, isSafetyBlock: false };
  }

  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info?.exists) {
      return uploadFailure('Local photo file not found. Please pick the image again.');
    }

    const { name, type } = guessNameAndType(uri);
    const data = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (!data) {
      return uploadFailure('Could not read photo file');
    }

    const result = await api.uploadMediaBase64({
      folder,
      mimeType: type,
      data,
      filename: name,
    });

    if (result.error || !result.data?.url) {
      return uploadFailure(result.error || 'Upload failed', result.data);
    }
    return { url: result.data.url, error: null, errorCode: null, isSafetyBlock: false };
  } catch (err) {
    return uploadFailure(err?.message || 'Upload failed');
  }
}

export async function uploadMediaUris(uris, folder = 'listings') {
  const out = [];
  for (const uri of uris || []) {
    if (!uri) continue;
    const result = await uploadMediaUri(uri, folder);
    if (result.error || !result.url) {
      return {
        urls: [],
        error: result.error || 'Upload failed',
        errorCode: result.errorCode || null,
        issues: result.issues || null,
        isSafetyBlock: Boolean(result.isSafetyBlock),
      };
    }
    out.push(result.url);
  }
  return { urls: out, error: null, errorCode: null, isSafetyBlock: false };
}
