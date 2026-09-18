import { useCallback, useState } from 'react';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Image, Modal, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { openItemDetail, ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import EmptyState from '../components/EmptyState';
import { formatPrice } from '../utils/listing';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { useAuth } from '../context/AuthContext';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    backgroundColor: colors.gradientStart,
    paddingTop: 0,
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  moreBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.surface,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  profileInfoWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  name: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.onPrimary,
  },
  verifiedBadge: {
    width: 16,
    height: 16,
  },
  tagline: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statCol: {
    alignItems: 'flex-start',
  },
  statTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statIcon: {
    opacity: 0.9,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  statReviews: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
  },
  statLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
  },
  followBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  followBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gradientStart,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 20,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 14,
    position: 'relative',
    marginRight: 28,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.gradientStart,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: colors.gradientStart,
    borderRadius: 2,
  },
  content: {
    flex: 1,
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
  },
  productCard: {
    width: (SCREEN_WIDTH - 32) / 2,
    margin: 8,
    backgroundColor: colors.iconBackground,
    borderRadius: 12,
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    aspectRatio: 1,
  },
  productInfo: {
    padding: 10,
  },
  productTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
  reviewsList: {
    padding: 16,
  },
  reviewCard: {
    backgroundColor: colors.iconBackground,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.border,
    marginRight: 10,
  },
  reviewAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  reviewName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  reviewRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  reviewStars: {
    flexDirection: 'row',
    marginRight: 4,
  },
  reviewDate: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  reviewText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  aboutSection: {
    padding: 16,
  },
  aboutText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: colors.textSecondary,
  },
});

export default function ShopProfileScreen({ route, navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { shopId: rawShopId } = route.params || {};
  const shopId = rawShopId?._id || rawShopId?.id || rawShopId;
  const { user } = useAuth();

  const [shop, setShop] = useState(null);
  const [listings, setListings] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [activeTab, setActiveTab] = useState('products');
  const [loading, setLoading] = useState(true);

  const tabs = [
    { id: 'products', label: 'Products', icon: 'grid-outline' },
    { id: 'reviews', label: 'Reviews', icon: 'star-outline' },
    { id: 'about', label: 'About', icon: 'information-circle-outline' },
  ];

  const loadShopData = useCallback(async ({ silent } = {}) => {
    try {
      if (!silent) setLoading(true);
      
      const [shopRes, listingsRes, reviewsRes] = await Promise.all([
        api.getShopById(shopId),
        api.getShopListings(shopId),
        api.getShopReviews(shopId),
      ]);

      if (shopRes.data?.shop) {
        setShop(shopRes.data.shop);
      }
      if (listingsRes.data?.listings) {
        setListings(listingsRes.data.listings);
      }
      if (reviewsRes.data?.reviews) {
        setReviews(reviewsRes.data.reviews);
      }
    } catch (error) {
      console.error('Error loading shop data:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [shopId]);

  const { refreshing, onRefresh } = usePullRefresh(() => loadShopData({ silent: true }));

  useFocusEffect(
    useCallback(() => {
      loadShopData();
    }, [loadShopData])
  );

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  const renderStars = (rating) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Ionicons
          key={i}
          name={i <= rating ? 'star' : 'star-outline'}
          size={12}
          color={colors.warningYellow}
        />
      );
    }
    return stars;
  };

  if (loading) {
    return (
      <View style={styles.root}>
        <ThemeStatusBar variant="header" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading shop...</Text>
        </View>
      </View>
    );
  }

  if (!shop) {
    return (
      <View style={styles.root}>
        <ThemeStatusBar variant="header" />
        <EmptyState
          icon="storefront-outline"
          title="Shop Not Found"
          message="This shop may have been removed or is no longer available."
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerTop}>
          <Pressable onPress={handleBack} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.onGradient} />
          </Pressable>
          <Pressable
            style={styles.moreBtn}
            onPress={() => {
              const ownerId = shop.owner?._id || shop.owner;
              if (user?.id && String(ownerId) === String(user.id)) {
                navigation.navigate(ROUTES.CREATE_SHOP, { shopId: shop._id || shop.id });
                return;
              }
            }}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.onGradient} />
          </Pressable>
        </View>

        <View style={styles.profileRow}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              {shop.logo ? (
                <Image source={{ uri: shop.logo }} style={styles.avatarImage} />
              ) : (
                <View style={[styles.avatar, { alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="storefront" size={28} color={colors.textSecondary} />
                </View>
              )}
            </View>
          </View>

          <View style={styles.profileInfoWrap}>
            <View style={styles.profileInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {shop.name}
                </Text>
                {shop.isVerified && (
                  <Ionicons name="checkmark-circle" size={16} color={colors.warningYellow} />
                )}
              </View>
              <Text style={styles.tagline}>{shop.category}</Text>
              <View style={styles.statsRow}>
                <View style={styles.statCol}>
                  <View style={styles.statTop}>
                    <Ionicons name="star" size={12} color={colors.warningYellow} style={styles.statIcon} />
                    <Text style={styles.ratingText}>{shop.ratingAverage.toFixed(1)}</Text>
                  </View>
                  <Text style={styles.statReviews}>{shop.reviewCount} reviews</Text>
                </View>
                <View style={styles.statCol}>
                  <View style={styles.statTop}>
                    <Ionicons name="cube-outline" size={12} color={colors.onGradient} style={styles.statIcon} />
                    <Text style={styles.statValue}>{listings.length}</Text>
                  </View>
                  <Text style={styles.statLabel}>Products</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.tabsRow}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.id}
            style={styles.tabItem}
            onPress={() => setActiveTab(tab.id)}
          >
            <Ionicons
              name={tab.icon}
              size={18}
              color={activeTab === tab.id ? colors.gradientStart : colors.textSecondary}
            />
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
              {tab.label}
            </Text>
            {activeTab === tab.id && <View style={styles.tabIndicator} />}
          </Pressable>
        ))}
      </View>

      <ScrollView style={styles.content} refreshControl={refreshControl(colors, refreshing, onRefresh)}>
        {activeTab === 'products' && (
          <View style={styles.productsGrid}>
            {listings.length > 0 ? (
              listings.map((listing) => (
                <Pressable
                  key={listing._id}
                  style={styles.productCard}
                  onPress={() => navigation.navigate(ROUTES.ITEM_DETAIL, { listingId: listing._id })}
                >
                  <Image
                    source={{ uri: listing.photos?.[0] }}
                    style={styles.productImage}
                    resizeMode="cover"
                  />
                  <View style={styles.productInfo}>
                    <Text style={styles.productTitle} numberOfLines={2}>
                      {listing.title}
                    </Text>
                    <Text style={styles.productPrice}>{formatPrice(listing.price)}</Text>
                  </View>
                </Pressable>
              ))
            ) : (
              <View style={{ width: SCREEN_WIDTH - 32, padding: 40 }}>
                <EmptyState
                  icon="grid-outline"
                  title="No Products Yet"
                  message="This shop hasn't added any products yet."
                />
              </View>
            )}
          </View>
        )}

        {activeTab === 'reviews' && (
          <View style={styles.reviewsList}>
            {reviews.length > 0 ? (
              reviews.map((review) => (
                <View key={review._id} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <View style={styles.reviewAvatar}>
                      {review.reviewer?.avatarUrl ? (
                        <Image
                          source={{ uri: review.reviewer.avatarUrl }}
                          style={styles.reviewAvatarImage}
                        />
                      ) : (
                        <View style={[styles.reviewAvatar, { alignItems: 'center', justifyContent: 'center' }]}>
                          <Ionicons name="person" size={18} color={colors.textSecondary} />
                        </View>
                      )}
                    </View>
                    <View>
                      <Text style={styles.reviewName}>{review.reviewer?.name || 'Anonymous'}</Text>
                      <View style={styles.reviewRating}>
                        <View style={styles.reviewStars}>
                          {renderStars(review.rating)}
                        </View>
                      </View>
                    </View>
                  </View>
                  <Text style={styles.reviewText}>{review.review}</Text>
                </View>
              ))
            ) : (
              <EmptyState
                icon="star-outline"
                title="No Reviews Yet"
                message="Be the first to review this shop!"
              />
            )}
          </View>
        )}

        {activeTab === 'about' && (
          <View style={styles.aboutSection}>
            <Text style={styles.aboutText}>{shop.description || 'No description provided.'}</Text>
            
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons name="location" size={16} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.infoLabel}>Location</Text>
                <Text style={styles.infoValue}>{shop.location || 'Not specified'}</Text>
              </View>
            </View>

            {shop.phone && (
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Ionicons name="call" size={16} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.infoLabel}>Phone</Text>
                  <Text style={styles.infoValue}>{shop.phone}</Text>
                </View>
              </View>
            )}

            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons name="time" size={16} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.infoLabel}>Opening Hours</Text>
                <Text style={styles.infoValue}>{shop.openingHours}</Text>
              </View>
            </View>

            {shop.address && (
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Ionicons name="home" size={16} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.infoLabel}>Address</Text>
                  <Text style={styles.infoValue}>{shop.address}</Text>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}