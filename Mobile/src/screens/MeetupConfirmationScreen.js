import { useState } from 'react';
import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../components/Button';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { useThemedStyles, ThemeStatusBar } from '../theme';

const createStyles = (colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  body: {
    fontSize: 15,
    color: colors.textMuted,
  },
});

export default function MeetupConfirmationScreen({ navigation, route }) {
  const styles = useThemedStyles(createStyles);
  const seller = route?.params?.seller;
  const listing = route?.params?.listing;
  const chatId = route?.params?.chatId;
  const [saving, setSaving] = useState(false);

  const listingId = listing?.id || listing?._id;
  const shopId = listing?.shopId?._id || listing?.shopId?.id || listing?.shopId;
  const isShopListing = listing?.sellerType === 'shop' && Boolean(shopId);

  const confirm = async () => {
    if (!chatId) return;
    setSaving(true);
    await api.confirmMeetup(chatId, { place: listing?.meetupOption || 'Public place' });
    setSaving(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ThemeStatusBar />
      <Text style={styles.title}>Meetup confirmed</Text>
      <Text style={styles.body}>Meet in a public place and keep the chat in the app for safety.</Text>
      <Button title={saving ? 'Saving…' : 'Save meetup'} onPress={confirm} disabled={saving || !chatId} />
      {isShopListing ? (
        <Button
          title="Rate Shop"
          onPress={async () => {
            await confirm();
            navigation.navigate(ROUTES.RATE_REVIEW, {
              seller: { name: seller?.name || 'Seller', id: seller?.id },
              shop: { id: shopId, _id: shopId },
              listing: {
                ...listing,
                id: listingId,
                shopId,
                sellerType: 'shop',
                title: listing?.title || 'Listing',
                subtitle: listing?.condition || '',
                price: listing?.price,
                imageUrl: listing?.photos?.[0] || listing?.imageUrl,
              },
            });
          }}
        />
      ) : null}
      <Button title="Done" variant="outline" onPress={() => navigation.goBack()} />
    </SafeAreaView>
  );
}
