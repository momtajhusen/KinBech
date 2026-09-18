import { Alert, Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export const MAX_LISTING_PHOTOS = 4;
export const EXTRA_PHOTO_SLOTS = 3;
export const MAX_LISTING_VIDEOS = 1;
export const MAX_VIDEO_DURATION_SEC = 30;
export const VIDEO_SLOT_INDEX = EXTRA_PHOTO_SLOTS + 1;
export const MAX_MEDIA_SLOTS = MAX_LISTING_PHOTOS + MAX_LISTING_VIDEOS;

export function isListingVideoUri(uri) {
  if (!uri || typeof uri !== 'string') return false;
  const lower = uri.toLowerCase();
  return /\.(mp4|mov|m4v|webm|avi|3gp)(\?|$)/.test(lower) || lower.includes('/video');
}

export function countListingPhotos(items) {
  return (items || []).filter((item) => item && item.type !== 'video').length;
}

export function countListingVideos(items) {
  return (items || []).filter((item) => item?.type === 'video').length;
}

export function assignVideoSlot(prev, videoItem) {
  const withoutVideo = (prev || []).filter((item) => item?.type !== 'video');
  const next = [...withoutVideo];
  while (next.length < VIDEO_SLOT_INDEX) {
    next.push(null);
  }
  next[VIDEO_SLOT_INDEX] = videoItem;
  return next.slice(0, MAX_MEDIA_SLOTS);
}

export function hydrateMediaSlotsFromUris(uris, { includeVideoSlot = true } = {}) {
  const images = [];
  let videoItem = null;

  (uris || []).filter(Boolean).forEach((uri, index) => {
    if (includeVideoSlot && isListingVideoUri(uri)) {
      if (!videoItem) {
        videoItem = { id: `loaded-v-${index}`, uri, type: 'video' };
      }
      return;
    }
    images.push({ id: `loaded-p-${index}`, uri, type: 'image' });
  });

  const slots = [];
  images.slice(0, MAX_LISTING_PHOTOS).forEach((item, index) => {
    slots[index] = item;
  });

  if (includeVideoSlot && videoItem) {
    while (slots.length < VIDEO_SLOT_INDEX) {
      slots.push(null);
    }
    slots[VIDEO_SLOT_INDEX] = videoItem;
  }

  return slots;
}

export function mediaUrisFromSlots(slots) {
  return (slots || []).filter((item) => item?.uri).map((item) => item.uri);
}

const SPECS = {
  main: { aspect: [1, 1], width: 800 },
  extra: { aspect: [1, 1], width: 720 },
};

function normalizeDurationMs(duration) {
  if (duration == null || Number.isNaN(Number(duration))) return null;
  const value = Number(duration);
  // Android camera apps often report seconds; iOS uses milliseconds.
  if (value > 0 && value < 1000) return Math.round(value * 1000);
  return Math.round(value);
}

async function ensurePhotoPermission() {
  const library = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (library.status !== 'granted') {
    Alert.alert('Photos permission', 'Allow photo access to upload listing images.');
    return false;
  }
  return true;
}

async function ensureCameraPermission() {
  const camera = await ImagePicker.requestCameraPermissionsAsync();
  if (camera.status !== 'granted') {
    Alert.alert('Camera permission', 'Allow camera access to record a listing video.');
    return false;
  }
  return true;
}

async function normalizePhoto(uri, spec) {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: spec.width } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

export async function pickListingPhoto(slotType = 'main') {
  const allowed = await ensurePhotoPermission();
  if (!allowed) {
    return null;
  }

  const spec = SPECS[slotType] || SPECS.extra;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: spec.aspect,
    quality: 1,
  });

  if (result.canceled || !result.assets?.[0]?.uri) {
    return null;
  }

  return normalizePhoto(result.assets[0].uri, spec);
}

/**
 * Record a short listing video from the device camera (gallery pick disabled).
 * Max 30 seconds. Uses camera capture settings for size/quality (Expo Go compatible).
 */
export async function recordListingVideo() {
  const allowed = await ensureCameraPermission();
  if (!allowed) return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['videos'],
    allowsEditing: false,
    videoMaxDuration: MAX_VIDEO_DURATION_SEC,
    cameraType: ImagePicker.CameraType.back,
    ...(Platform.OS === 'ios'
      ? {
          // 720p H.264 — good balance of quality and file size in Expo Go.
          videoQuality: ImagePicker.UIImagePickerControllerQualityType.IFrame1280x720,
        }
      : {
          quality: 0.85,
        }),
  });

  if (result.canceled || !result.assets?.[0]?.uri) {
    return null;
  }

  const asset = result.assets[0];
  const durationMs = normalizeDurationMs(asset.duration);
  if (durationMs != null && durationMs > MAX_VIDEO_DURATION_SEC * 1000) {
    Alert.alert(
      'Video too long',
      `Please record a video of ${MAX_VIDEO_DURATION_SEC} seconds or less.`,
    );
    return null;
  }

  return {
    uri: asset.uri,
    duration: durationMs ?? asset.duration ?? 0,
    type: 'video',
  };
}

/** @deprecated Use recordListingVideo */
export const pickListingVideo = recordListingVideo;
