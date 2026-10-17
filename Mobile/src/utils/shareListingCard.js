import { Alert, Linking, Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
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

export async function shareListingToWhatsApp(cardRef, listing) {
  const uri = await captureListingShareCard(cardRef);
  const message = buildShareMessage(listing);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'image/png',
      dialogTitle: 'Share to WhatsApp Status or chat',
      UTI: 'public.png',
    });
    return;
  }

  const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
  const canOpen = await Linking.canOpenURL(whatsappUrl);
  if (canOpen) {
    await Linking.openURL(whatsappUrl);
    return;
  }

  Alert.alert(
    'WhatsApp not available',
    'Install WhatsApp or use Share image to pick another app.',
  );
}

export async function shareListingLink(listing) {
  const message = buildShareMessage(listing);
  await Share.share({
    message,
    title: listing?.title || 'KinBech listing',
  });
}

async function tryOpen(url) {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

export async function redirectListingPost(platform, listing) {
  const message = buildShareMessage(listing);
  const pageUrl = buildListingShareUrl(listing?.id);
  await Clipboard.setStringAsync(message);

  if (platform === 'facebook') {
    const sharer = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}&quote=${encodeURIComponent(message)}`;
    if (await tryOpen(`fb://facewebmodal/f?href=${encodeURIComponent(sharer)}`)) return;
    await Linking.openURL(sharer);
    return;
  }

  if (platform === 'instagram') {
    if (await tryOpen('instagram://camera')) return;
    if (await tryOpen('instagram://app')) return;
    await Linking.openURL('https://www.instagram.com/');
    return;
  }

  if (platform === 'tiktok') {
    if (await tryOpen('snssdk1233://')) return;
    if (await tryOpen('tiktok://')) return;
    await Linking.openURL('https://www.tiktok.com/tiktokstudio/upload');
  }
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
