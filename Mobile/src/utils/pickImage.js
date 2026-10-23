import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/**
 * Native Android crop (`allowsEditing`) crashes on several OEM cameras
 * (Vivo, Oppo, Xiaomi). Crop in JS after pick instead.
 */
export function imagePickerOptions({ aspect, quality = 1 } = {}) {
  const nativeCrop = Platform.OS === 'ios' && Array.isArray(aspect);
  return {
    mediaTypes: ['images'],
    allowsEditing: Boolean(nativeCrop),
    quality,
    ...(nativeCrop ? { aspect } : {}),
  };
}

export async function cropCenterToAspect(uri, aspect, maxWidth = 1600) {
  if (!uri) return uri;
  try {
    const measured = await ImageManipulator.manipulateAsync(uri, []);
    const width = measured.width || 0;
    const height = measured.height || 0;
    const ops = [];

    if (Array.isArray(aspect) && width > 0 && height > 0) {
      const target = aspect[0] / aspect[1];
      const current = width / height;
      if (Math.abs(current - target) > 0.03) {
        if (current > target) {
          const cropW = Math.max(1, Math.round(height * target));
          ops.push({
            crop: {
              originX: Math.max(0, Math.round((width - cropW) / 2)),
              originY: 0,
              width: cropW,
              height,
            },
          });
        } else {
          const cropH = Math.max(1, Math.round(width / target));
          ops.push({
            crop: {
              originX: 0,
              originY: Math.max(0, Math.round((height - cropH) / 2)),
              width,
              height: cropH,
            },
          });
        }
      }
    }

    if (maxWidth && width > maxWidth) {
      ops.push({ resize: { width: maxWidth } });
    }

    if (!ops.length) return uri;
    const out = await ImageManipulator.manipulateAsync(uri, ops, {
      compress: 0.85,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return out?.uri || uri;
  } catch (error) {
    console.error('Error in cropCenterToAspect:', error);
    return uri;
  }
}

export async function pickFromLibrary({ aspect, quality = 0.85, maxWidth = 1600 } = {}) {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return { error: 'permission' };

  const result = await ImagePicker.launchImageLibraryAsync(imagePickerOptions({ aspect, quality: 1 }));
  if (result.canceled || !result.assets?.[0]?.uri) return { uri: null };

  const uri = await cropCenterToAspect(result.assets[0].uri, aspect, maxWidth);
  return { uri };
}
