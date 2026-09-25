import { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSharedTransition } from '../context/SharedTransitionContext';
import EmptyState from '../components/EmptyState';
import { navigateToTab, openItemDetail, TABS } from '../navigation/helpers';
import { api } from '../services/api';
import { categoryIcon, formatPrice, resolveMediaUrl } from '../utils/listing';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

/**
 * Resolve color references (e.g., 'colors.iconBackground') to actual color values
 * @param {string} colorRef - Color reference string or direct color value
 * @param {object} colors - Theme colors object
 * @returns {string} Resolved color value
 */
function resolveColor(colorRef, colors) {
  if (typeof colorRef === 'string' && colorRef.startsWith('colors.')) {
    const colorKey = colorRef.replace('colors.', '');
    return colors[colorKey] || colorRef;
  }
  return colorRef;
}

export default function WishlistScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { tryBeginNavigation } = useSharedTransition();
  const [items, setItems] = useState([]);

  const loadWishlist = useCallback(async () => {
    const { data, error } = await api.getWishlist();
    if (error) {
      console.error('Failed to load wishlist:', error);
      setItems([]);
    } else {
      setItems(
        (data?.listings || []).map((listing) => ({
          id: listing.id,
          title: listing.title,
          subtitle: listing.condition,
          price: formatPrice(listing.price),
          location: listing.location,
          distance: listing.category,
          icon: categoryIcon(listing.category),
          photo: resolveMediaUrl(listing.photos?.[0] || ''),
          bg: 'iconBackground',
          priceDropped: false,
          listing,
        }))
      );
    }
  }, []);

  const { refreshing, onRefresh } = usePullRefresh(loadWishlist);

  useFocusEffect(
    useCallback(() => {
      loadWishlist();
    }, [loadWishlist])
  );

  const removeItem = async (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    await api.toggleWishlist(id);
  };

  // Guard against undefined colors
  if (!colors) {
    return null;
  }

  // Resolve item colors dynamically
  const resolvedItems = (items || []).map(item => ({
    ...item,
    bg: resolveColor(`colors.${item.bg}`, colors)
  }));

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <LinearGradient
        colors={colors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={colors.onGradient} />
        </Pressable>
        <View>
          <Text style={styles.headerTitle}>Saved Items</Text>
          <Text style={styles.headerSubtitle}>{items.length} items saved</Text>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        {resolvedItems.length > 0 && (
          <View style={styles.grid}>
            {resolvedItems.map((item) => (
              <Pressable
                key={item.id}
                style={styles.card}
                onPress={() =>
                  tryBeginNavigation(item.id, () =>
                    openItemDetail(navigation, { listingId: item.id, item: item.listing, sharedId: item.id })
                  )
                }
              >
                <View style={[styles.thumb, { backgroundColor: item.bg }]}>
                  {item.photo ? (
                    <Image
                      source={{ uri: item.photo }}
                      style={styles.thumbImage}
                      resizeMode="cover"
                      sharedTransitionTag={`item.${item.id}.photo`}
                    />
                  ) : (
                    <Ionicons name={item.icon} size={40} color={colors.primary} sharedTransitionTag={`item.${item.id}.photo`} />
                  )}

                  <Pressable
                    style={styles.heartBtn}
                    hitSlop={8}
                    onPress={() => removeItem(item.id)}
                  >
                    <Ionicons name="heart" size={18} color={colors.danger} />
                  </Pressable>

                  {item.priceDropped && (
                    <View style={styles.dropTag}>
                      <Text style={styles.dropTagText}>Price Dropped</Text>
                    </View>
                  )}
                </View>

                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={1} sharedTransitionTag={`item.${item.id}.title`}>{item.title}</Text>
                  <Text style={styles.cardSubtitle} numberOfLines={1}>{item.subtitle}</Text>
                  <Text style={styles.cardPrice} sharedTransitionTag={`item.${item.id}.price`}>{item.price}</Text>
                  <View style={styles.locationRow}>
                    <Ionicons name="location-outline" size={12} color={colors.textMuted} />
                    <Text style={styles.locationText} numberOfLines={1}>{item.location}</Text>
                    <Text style={styles.distanceText}>{item.distance}</Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {items.length === 0 ? (
          <EmptyState
            compact
            icon="heart-outline"
            title="No saved items yet"
            body="Tap the heart on a listing to keep it here."
            buttonLabel="Explore items"
            onButtonPress={() => navigateToTab(navigation, TABS.HOME)}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
  back: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.onPrimary,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: {
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  heartBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  dropTag: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: colors.notificationSaved,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dropTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  cardBody: {
    padding: 10,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  cardSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textSecondary,
  },
  cardPrice: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '800',
    color: colors.price,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 3,
  },
  locationText: {
    fontSize: 10,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  distanceText: {
    marginLeft: 'auto',
    fontSize: 10,
    color: colors.textSecondary,
  },
  emptyCardFull: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 28,
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 16,
  },
  emptyHeartWrap: {
    width: 90,
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkle: {
    position: 'absolute',
    fontSize: 13,
    color: colors.primary,
    opacity: 0.5,
  },
  emptyTextCol: {
    flex: 1,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginTop: 4,
  },
  emptySubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textMuted,
  },
  exploreBtn: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignSelf: 'flex-start',
  },
  exploreText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.onPrimary,
  },
});
