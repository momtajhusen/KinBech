import { Alert, Linking, Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import {
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  buildListingShareUrl,
  buildShareMessage,
} from './listingShare';

export async function captureListingShareCard(cardRef) {
  if (!cardRef?.current) {
    throw new Error('Share card is not ready yet');
  }

  const uri = await captureRef(cardRef, {
    format: 'png',
    quality: 1,
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    result: 'tmpfile',
  });

  return uri;
}

export async function shareListingImage(cardRef, listing, dialogTitle = 'Share listing card') {
  const uri = await captureListingShareCard(cardRef);
  const message = buildShareMessage(listing);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'image/png',
      dialogTitle,
      UTI: 'public.png',
    });
    return uri;
  }

  await Share.share({
    message,
    url: Platform.OS === 'ios' ? uri : undefined,
    title: listing?.title || 'KinBech listing',
  });
  return uri;
}

async function tryOpen(url) {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

async function openFirst(urls) {
  for (const url of urls) {
    if (await tryOpen(url)) return true;
  }
  return false;
}

async function copyShareCard(fileUri, message) {
  await Clipboard.setStringAsync(message);
  try {
    const base64 = await new File(fileUri).base64();
    if (base64) await Clipboard.setImageAsync(base64);
  } catch {
    // The caption is already copied. The image copy is optional.
  }
}

async function shareImageFile(uri, dialogTitle) {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'image/png',
      dialogTitle,
      UTI: 'public.png',
    });
    return true;
  }
  return false;
}

export async function shareListingToWhatsApp(cardRef, listing) {
  return shareListingToApp('whatsapp', cardRef, listing);
}

export async function shareListingLink(listing) {
  const message = buildShareMessage(listing);
  await Share.share({
    message,
    title: listing?.title || 'KinBech listing',
  });
}

export async function redirectListingPost(platform, listing, cardRef) {
  return shareListingToApp(platform, cardRef, listing);
}

export async function shareListingToApp(platform, cardRef, listing) {
  const uri = await captureListingShareCard(cardRef);
  const message = buildShareMessage(listing);
  const pageUrl = buildListingShareUrl(listing?.id);
  await copyShareCard(uri, message);

  if (platform === 'whatsapp') {
    const text = encodeURIComponent(message);
    const opened = await openFirst([
      `whatsapp://send?text=${text}`,
      `https://wa.me/?text=${text}`,
    ]);
    if (opened) return uri;
    if (await shareImageFile(uri, 'Share to WhatsApp')) return uri;
    Alert.alert('WhatsApp not available', 'Install WhatsApp, or use Share to pick another app.');
    return uri;
  }

  if (platform === 'facebook') {
    const sharer = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}&quote=${encodeURIComponent(message)}`;
    const opened = await openFirst([sharer]);
    if (opened) return uri;
    if (await shareImageFile(uri, 'Share to Facebook')) return uri;
    Alert.alert('Facebook not available', 'Install Facebook, or use Share to pick another app.');
    return uri;
  }

  if (platform === 'instagram' || platform === 'tiktok') {
    const title = platform === 'instagram' ? 'Post on Instagram' : 'Post on TikTok';
    if (await shareImageFile(uri, title)) return uri;
    const opened = platform === 'instagram'
      ? await openFirst(['instagram://app', 'https://www.instagram.com/'])
      : await openFirst(['snssdk1233://', 'tiktok://', 'https://www.tiktok.com/']);
    if (opened) return uri;
    Alert.alert(
      platform === 'instagram' ? 'Instagram not available' : 'TikTok not available',
      'Install the app, or use Share to pick another app.',
    );
    return uri;
  }

  await shareImageFile(uri, 'Share listing card');
  return uri;
}

export async function saveListingShareCard(cardRef) {
  const uri = await captureListingShareCard(cardRef);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'image/png',
      dialogTitle: 'Save share card — choose Photos or Files',
      UTI: 'public.png',
    });
    return uri;
  }

  throw new Error('Sharing is not available on this device');
}
