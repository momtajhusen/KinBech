import { Alert, Linking, Platform, Share } from 'react-native';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import {
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
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
