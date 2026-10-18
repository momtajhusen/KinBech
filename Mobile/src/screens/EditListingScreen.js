import { useEffect, useState } from 'react';
import { View } from 'react-native';
import ScreenLoader from '../components/ScreenLoader';
import EmptyState from '../components/EmptyState';
import { api } from '../services/api';
import { useTheme, ThemeStatusBar } from '../theme';
import IndividualPostListingScreen from './IndividualPostListingScreen';
import ShopPostListingScreen from './ShopPostListingScreen';

/** Loads the listing, then opens the same form used to post it, in edit mode. */
export default function EditListingScreen({ navigation, route }) {
  const { colors } = useTheme();
  const listingId = route?.params?.listingId;
  const [listing, setListing] = useState(null);
  const [notFound, setNotFound] = useState(!listingId);

  useEffect(() => {
    if (!listingId) return undefined;
    let active = true;
    (async () => {
      const { data, error } = await api.getListing(listingId);
      if (!active) return;
      if (error || !data?.listing) {
        setNotFound(true);
        return;
      }
      setListing({ ...data.listing, id: data.listing.id || data.listing._id || listingId });
    })();
    return () => {
      active = false;
    };
  }, [listingId]);

  if (notFound) {
    return (
      <View style={{ flex: 1, backgroundColor: colors?.background }}>
        <ThemeStatusBar variant="header" />
        <EmptyState
          compact
          icon="alert-circle-outline"
          title="Listing not found"
          body="This listing may have been removed or is no longer available."
          buttonLabel="Go back"
          onButtonPress={() => navigation.goBack()}
        />
      </View>
    );
  }

  if (!listing) return <ScreenLoader label="Loading listing" />;

  return listing.sellerType === 'shop' ? (
    <ShopPostListingScreen navigation={navigation} editListing={listing} />
  ) : (
    <IndividualPostListingScreen navigation={navigation} editListing={listing} />
  );
}
