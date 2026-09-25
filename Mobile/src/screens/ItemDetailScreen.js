import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { INFO_COPY, ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import EmptyState from '../components/EmptyState';
import VariantPicker from '../components/VariantPicker';
import { categoryIcon, toDetailItem } from '../utils/listing';
import { getDefaultVariantSelection } from '../utils/listingVariants';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { useSharedTransition } from '../context/SharedTransitionContext';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_HEIGHT = 340;
const THUMB_SIZE = 56;

function isVideoUri(uri) {
  const value = String(uri || '').toLowerCase();
  return (
    value.startsWith('video:') ||
    /\.(mp4|mov|m4v|webm|avi|3gp)(\?|$)/i.test(value) ||
    value.includes('/video')
  );
}

function collectMedia(listing, detail) {
  const items = [];
  const push = (uri, type) => {
    if (!uri || items.some((m) => m.uri === uri)) return;
    items.push({
      uri,
      type: type || (isVideoUri(uri) ? 'video' : 'image'),
    });
  };
  (detail?.photos || listing?.photos || []).forEach((photo) => {
    if (typeof photo === 'string') push(photo);
    else if (photo?.uri) push(photo.uri, photo.type);
  });
  (listing?.videos || []).forEach((video) => {
    const uri = typeof video === 'string' ? video : video?.uri;
    push(uri, 'video');
  });
  return items;
}

export default function ItemDetailScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isIOS } = useSharedTransition();
  const [activeIndex, setActiveIndex] = useState(0);
  const [favorited, setFavorited] = useState(false);
  const [descOpen, setDescOpen] = useState(true);
  const [listing, setListing] = useState(route?.params?.item || null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [ptrReady, setPtrReady] = useState(false);
  const [variantSelection, setVariantSelection] = useState({});
  const thumbScale = useRef(new Animated.Value(1)).current;
  const listingId = route?.params?.listingId || listing?.id || listing?._id;
  const sharedId = route?.params?.sharedId || listingId;
  const photoTag = isIOS && sharedId ? `item.${sharedId}.photo` : undefined;
  const titleTag = isIOS && sharedId ? `item.${sharedId}.title` : undefined;
  const priceTag = isIOS && sharedId ? `item.${sharedId}.price` : undefined;

  const loadListing = useCallback(async () => {
    if (!listingId) return;
    const { data, error } = await api.getListing(listingId);
    if (error) {
      console.error('Failed to load listing:', error);
    } else if (data?.listing) {
      setListing(data.listing);
      if (data.listing.hasVariants) {
        setVariantSelection(getDefaultVariantSelection(data.listing));
      }
    }
  }, [listingId]);

  const { refreshing, onRefresh } = usePullRefresh(loadListing);

  useEffect(() => {
    const t = setTimeout(() => setPtrReady(true), 600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    loadListing();
  }, [loadListing]);

  if (!listing) {
    return (
      <View style={styles.root}>
        <ThemeStatusBar variant="header" />
        <EmptyState
          compact
          icon="cube-outline"
          title="Item not found"
          body="This item may have been removed or is no longer available."
          buttonLabel="Go back"
          onButtonPress={() => navigation.goBack()}
        />
      </View>
    );
  }

  const item = toDetailItem(listing) || {
    title: 'Listing',
    price: '',
    condition: 'Good',
    location: '',
    posted: '',
    seller: 'Seller',
    rating: '',
    description: '',
    mapAddress: '',
    photos: [],
    listing: null,
  };

  const media = collectMedia(listing, item);
  const resolvedPhotos = media.length
    ? media.map((entry) => ({
        ...entry,
        icon: categoryIcon(listing?.category),
      }))
    : [{ icon: categoryIcon(listing?.category), bg: colors.photoDark1, type: 'image' }];
  const activeMedia = resolvedPhotos[Math.min(activeIndex, resolvedPhotos.length - 1)] || resolvedPhotos[0];

  const selectMedia = (index) => {
    setActiveIndex(index);
    thumbScale.setValue(0.92);
    Animated.spring(thumbScale, {
      toValue: 1,
      tension: 320,
      friction: 12,
      useNativeDriver: true,
    }).start();
  };

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={ptrReady ? refreshControl(colors, refreshing, onRefresh) : undefined}
      >
        <View style={styles.imageWrap}>
          <Animated.View style={[styles.hero, { transform: [{ scale: thumbScale }] }]}>
            <Pressable style={styles.heroPress} onPress={() => setViewerOpen(true)}>
              {activeMedia?.uri && activeMedia.type !== 'video' ? (
                <Image
                  source={{ uri: activeMedia.uri }}
                  style={styles.heroImage}
                  resizeMode="cover"
                  sharedTransitionTag={photoTag}
                />
              ) : (
                <View style={[styles.heroFallback, { backgroundColor: activeMedia?.bg || colors.photoDark1 }]}>
                  <Ionicons
                    name={activeMedia?.type === 'video' ? 'videocam' : activeMedia?.icon || 'cube-outline'}
                    size={64}
                    color="rgba(255,255,255,0.9)"
                    sharedTransitionTag={photoTag}
                  />
                  {activeMedia?.type === 'video' ? (
                    <Text style={styles.heroHint}>Tap to view video</Text>
                  ) : null}
                </View>
              )}
              {activeMedia?.type === 'video' && activeMedia?.uri ? (
                <View style={styles.heroPlay} pointerEvents="none">
                  <View style={styles.heroPlayBtn}>
                    <Ionicons name="play" size={22} color="#fff" />
                  </View>
                </View>
              ) : null}
            </Pressable>
            <View style={styles.counterPill}>
              <Text style={styles.counterText}>
                {Math.min(activeIndex + 1, resolvedPhotos.length)} / {resolvedPhotos.length}
              </Text>
            </View>
          </Animated.View>

          <View style={[styles.galleryTop, { paddingTop: insets.top + 8 }]}>
            <Pressable
              style={styles.roundBtn}
              onPress={() => navigation.goBack()}
              hitSlop={10}
            >
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </Pressable>
            <Pressable
              style={styles.roundBtn}
              onPress={async () => {
                if (!listingId) return;
                const { error } = await api.toggleWishlist(listingId);
                if (!error) setFavorited((v) => !v);
              }}
              hitSlop={10}
            >
              <Ionicons
                name={favorited ? 'heart' : 'heart-outline'}
                size={22}
                color={colors.danger}
              />
            </Pressable>
          </View>

          {resolvedPhotos.length > 1 ? (
            <ScrollView
              nestedScrollEnabled
              style={[styles.thumbRail, { top: insets.top + 56 }]}
              contentContainerStyle={styles.thumbRailContent}
              showsVerticalScrollIndicator={false}
            >
              {resolvedPhotos.map((photo, index) => {
                const selected = index === activeIndex;
                return (
                  <Pressable
                    key={`${photo.uri || 'empty'}-${index}`}
                    onPress={() => selectMedia(index)}
                    style={[
                      styles.thumb,
                      selected && styles.thumbActive,
                      { borderColor: selected ? colors.primary : 'rgba(255,255,255,0.45)' },
                    ]}
                  >
                    {photo.uri && photo.type !== 'video' ? (
                      <Image source={{ uri: photo.uri }} style={styles.thumbImage} />
                    ) : (
                      <View style={[styles.thumbFallback, { backgroundColor: photo.bg || colors.photoDark1 }]}>
                        <Ionicons
                          name={photo.type === 'video' ? 'videocam' : photo.icon || 'cube-outline'}
                          size={18}
                          color="#fff"
                        />
                      </View>
                    )}
                    {photo.type === 'video' ? (
                      <View style={styles.thumbPlay}>
                        <Ionicons name="play" size={10} color="#fff" />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
        </View>

        <View style={styles.content}>
          <View
            style={styles.titleRow}

          >
            <Text style={styles.title} sharedTransitionTag={titleTag}>{item.title}</Text>
            <View style={styles.conditionPill}>
              <Text style={styles.conditionText}>{item.condition}</Text>
            </View>
          </View>

          {!listing.hasVariants ? (
            <Text
              style={styles.price}
              sharedTransitionTag={priceTag}
            >
              {item.price}
            </Text>
          ) : null}

          {listing.hasVariants ? (
            <VariantPicker
              listing={listing}
              selection={variantSelection}
              onChangeSelection={setVariantSelection}
              colors={colors}
              styles={styles}
            />
          ) : null}

          <View
            style={styles.metaRow}

          >
            <Ionicons name="location-outline" size={15} color={colors.textSecondary} />
            <Text style={styles.metaText}>{item.location}</Text>
            <View style={styles.metaDivider} />
            <Ionicons name="time-outline" size={15} color={colors.textSecondary} />
            <Text style={styles.metaText}>{item.posted}</Text>
          </View>

          <View

          >
            {/* Individual Seller Card */}
            {listing.sellerType === 'individual' && (
              <Pressable
                style={styles.sellerCard}
                onPress={() => navigation.navigate(ROUTES.SELLER_PROFILE, { seller: item.sellerData })}
              >
                <View style={styles.sellerAvatar}>
                  {item.sellerData?.avatarUrl ? (
                    <Image source={{ uri: item.sellerData.avatarUrl }} style={styles.sellerAvatarImage} />
                  ) : (
                    <Ionicons name="person" size={26} color={colors.onGradient} />
                  )}
                </View>
                <View style={styles.sellerInfo}>
                  <Text style={styles.sellerName}>{item.seller}</Text>
                  <View style={styles.sellerMetaRow}>
                    <Ionicons name="call" size={14} color={colors.success} />
                    <Text style={styles.sellerMetaText}>
                      {listing.verificationLabel || 'Phone Verified'}
                    </Text>
                  </View>
                </View>
                <View style={styles.viewProfileRow}>
                  <Text style={styles.viewProfile}>View Profile</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.link} />
                </View>
              </Pressable>
            )}

            {/* Shop Seller Card */}
            {listing.sellerType === 'shop' && listing.shopId && (
              <Pressable
                style={styles.sellerCard}
                onPress={() => navigation.navigate(ROUTES.SHOP_PROFILE, { shopId: listing.shopId._id || listing.shopId.id || listing.shopId })}
              >
                <View style={styles.sellerAvatar}>
                  {listing.shopId?.logo ? (
                    <Image source={{ uri: listing.shopId.logo }} style={styles.sellerAvatarImage} />
                  ) : (
                    <Ionicons name="storefront" size={26} color={colors.onGradient} />
                  )}
                </View>
                <View style={styles.sellerInfo}>
                  <Text style={styles.sellerName}>{listing.shopId?.name || 'Shop'}</Text>
                  <View style={styles.sellerRatingRow}>
                    <Ionicons name="star" size={14} color={colors.rating} />
                    <Text style={styles.sellerRating}>{listing.shopId?.ratingAverage?.toFixed(1) || '0.0'}</Text>
                    <Text style={styles.sellerReviewCount}>({listing.shopId?.reviewCount || 0})</Text>
                  </View>
                  {(listing.shopId?.isVerified || listing.verificationKind === 'business') && (
                    <View style={styles.sellerMetaRow}>
                      <Ionicons name="shield-checkmark" size={12} color={colors.primary} />
                      <Text style={styles.sellerMetaText}>
                        {listing.verificationLabel || 'Business Verified'}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.viewProfileRow}>
                  <Text style={styles.viewProfile}>View Shop</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.link} />
                </View>
              </Pressable>
            )}

            {/* Fallback for old listings without sellerType */}
            {!listing.sellerType && (
              <Pressable
                style={styles.sellerCard}
                onPress={() => navigation.navigate(ROUTES.SELLER_PROFILE, { seller: item.sellerData })}
              >
                <View style={styles.sellerAvatar}>
                  {item.sellerData?.avatarUrl ? (
                    <Image source={{ uri: item.sellerData.avatarUrl }} style={styles.sellerAvatarImage} />
                  ) : (
                    <Ionicons name="person" size={26} color={colors.onGradient} />
                  )}
                </View>
                <View style={styles.sellerInfo}>
                  <Text style={styles.sellerName}>{item.seller}</Text>
                  <View style={styles.sellerMetaRow}>
                    <Ionicons name="call" size={14} color={colors.success} />
                    <Text style={styles.sellerMetaText}>
                      {listing.verificationLabel || 'Phone Verified'}
                    </Text>
                  </View>
                </View>
                <View style={styles.viewProfileRow}>
                  <Text style={styles.viewProfile}>View Profile</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.link} />
                </View>
              </Pressable>
            )}
          </View>

          <View
            style={styles.divider}

          />

          <View

          >
            <Pressable style={styles.sectionHeaderRow} onPress={() => setDescOpen((v) => !v)}>
              <View style={styles.sectionHeaderLeft}>
                <Ionicons name="document-text-outline" size={18} color={colors.text} />
                <Text style={styles.sectionTitle}>Description</Text>
              </View>
              <Ionicons
                name={descOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.primary}
              />
            </Pressable>
            {descOpen && <Text style={styles.description}>{item.description}</Text>}
          </View>

          <View

          >
            <View style={styles.mapCard}>
              <View style={styles.mapPreview}>
                <View style={styles.mapGridLine1} />
                <View style={styles.mapGridLine2} />
                <Ionicons name="location" size={30} color={colors.primary} />
              </View>
              <View style={styles.mapInfo}>
                <Text style={styles.mapLabel}>Location</Text>
                <Text style={styles.mapAddress}>{item.mapAddress}</Text>
                <Pressable onPress={() => navigation.navigate(ROUTES.INFO, INFO_COPY.MapView)}>
                  <Text style={styles.viewOnMap}>View on Map</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View

          >
            <Pressable style={styles.safetyBanner} onPress={() => navigation.navigate(ROUTES.INFO, INFO_COPY.SafetyTips)}>
              <View style={styles.safetyIcon}>
                <Ionicons name="shield-checkmark" size={22} color={colors.onGradient} />
              </View>
              <View style={styles.safetyText}>
                <Text style={styles.safetyTitle}>Stay Safe with Each Other</Text>
                <Text style={styles.safetySubtitle}>
                  Meet in public places and check the item before making payment.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.link} />
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <View
        style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 16) }]}

      >
        <Pressable style={styles.callBtn} onPress={() => {}}>
          <Ionicons name="call" size={18} color={colors.link} />
          <Text style={styles.callText}>Call</Text>
        </Pressable>
        <Pressable
          style={styles.chatBtnWrap}
          onPress={async () => {
            const sellerId = item.sellerId;
            if (!sellerId) {
              navigation.navigate(ROUTES.CHAT, { name: item.seller });
              return;
            }
            if (user?.id && String(user.id) === String(sellerId)) {
              Alert.alert('Your listing', 'You cannot chat with yourself on this item.');
              return;
            }
            const { data, error } = await api.createChat({
              listingId,
              userId: sellerId,
            });
            if (error) {
              Alert.alert('Chat failed', error);
              return;
            }
            navigation.navigate(ROUTES.CHAT, {
              chatId: data.chat.id,
              name: data.chat.otherUser?.name || item.seller,
              listing: listing,
              otherUserId: data.chat.otherUser?.id || sellerId,
            });
          }}
        >
          <LinearGradient
            colors={colors.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.chatBtn}
          >
            <Ionicons name="chatbubble-ellipses" size={18} color={colors.onGradient} />
            <Text style={styles.chatText}>Chat Now</Text>
          </LinearGradient>
        </Pressable>
      </View>

      <Modal visible={viewerOpen} animationType="fade" onRequestClose={() => setViewerOpen(false)}>
        <View style={styles.viewer}>
          <Pressable style={[styles.viewerClose, { top: insets.top + 8 }]} onPress={() => setViewerOpen(false)}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
          <Pressable style={styles.viewerBody} onPress={() => setViewerOpen(false)}>
            {activeMedia?.uri && activeMedia.type !== 'video' ? (
              <Image source={{ uri: activeMedia.uri }} style={styles.viewerImage} resizeMode="contain" />
            ) : (
              <View style={styles.viewerFallback}>
                <Ionicons name={activeMedia?.type === 'video' ? 'videocam' : 'image-outline'} size={64} color="#fff" />
                <Text style={styles.heroHint}>
                  {activeMedia?.type === 'video' ? 'Video preview' : 'No preview'}
                </Text>
              </View>
            )}
          </Pressable>
          <View style={[styles.viewerBar, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable
              style={styles.viewerNav}
              onPress={() => selectMedia(activeIndex === 0 ? resolvedPhotos.length - 1 : activeIndex - 1)}
            >
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>
            <Text style={styles.counterText}>
              {Math.min(activeIndex + 1, resolvedPhotos.length)} / {resolvedPhotos.length}
            </Text>
            <Pressable
              style={styles.viewerNav}
              onPress={() => selectMedia((activeIndex + 1) % resolvedPhotos.length)}
            >
              <Ionicons name="chevron-forward" size={22} color="#fff" />
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  imageWrap: {
    height: IMAGE_HEIGHT,
    backgroundColor: colors.photoDark1,
    position: 'relative',
  },
  galleryTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  thumbRail: {
    position: 'absolute',
    left: 12,
    bottom: 16,
    zIndex: 2,
    width: THUMB_SIZE + 4,
  },
  thumbRailContent: {
    gap: 8,
    paddingBottom: 8,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    backgroundColor: colors.iconBackground,
  },
  thumbActive: {
    transform: [{ scale: 1.04 }],
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbPlay: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    width: SCREEN_WIDTH,
    height: IMAGE_HEIGHT,
    backgroundColor: colors.photoDark1,
    overflow: 'hidden',
    position: 'relative',
  },
  heroPress: {
    width: '100%',
    height: '100%',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  heroHint: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '700',
    fontSize: 13,
  },
  heroPlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPlayBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewer: {
    flex: 1,
    backgroundColor: '#000',
  },
  viewerClose: {
    position: 'absolute',
    right: 16,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: SCREEN_WIDTH,
    height: '80%',
  },
  viewerFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  viewerNav: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  dotsRow: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  dotActive: {
    width: 18,
    backgroundColor: colors.surface,
  },
  counterPill: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  counterText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  content: {
    padding: 16,
    paddingBottom: 120,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 28,
  },
  conditionPill: {
    backgroundColor: colors.conditionColor,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  conditionText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  price: {
    marginTop: 10,
    fontSize: 26,
    fontWeight: '800',
    color: colors.price,
  },
  variantPickerWrap: {
    marginTop: 12,
    gap: 12,
  },
  variantPickerGroup: {
    gap: 8,
  },
  variantPickerLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  variantPickerOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  variantPickerChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  variantPickerChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft || `${colors.primary}18`,
  },
  variantPickerChipDisabled: {
    opacity: 0.45,
  },
  variantPickerChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  variantPickerChipTextActive: {
    color: colors.primary,
  },
  variantPickerChipTextDisabled: {
    textDecorationLine: 'line-through',
  },
  variantPickerSummary: {
    gap: 4,
  },
  variantPickerPrice: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.price,
  },
  variantPickerStock: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  variantPickerSelected: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  metaDivider: {
    width: 1,
    height: 14,
    backgroundColor: colors.border,
    marginHorizontal: 6,
  },
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sellerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sellerAvatarImage: {
    width: '100%',
    height: '100%',
  },
  sellerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  sellerName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  sellerRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  sellerRating: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  viewProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewProfile: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.link,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  description: {
    marginTop: 10,
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 21,
  },
  mapCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  mapPreview: {
    width: 110,
    height: 100,
    backgroundColor: colors.photoFrame,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mapGridLine1: {
    position: 'absolute',
    width: '150%',
    height: 1,
    backgroundColor: colors.photoLine,
    top: '35%',
    transform: [{ rotate: '12deg' }],
  },
  mapGridLine2: {
    position: 'absolute',
    width: '150%',
    height: 1,
    backgroundColor: colors.photoLine,
    top: '65%',
    transform: [{ rotate: '-8deg' }],
  },
  mapInfo: {
    flex: 1,
    paddingHorizontal: 14,
  },
  mapLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  mapAddress: {
    marginTop: 3,
    fontSize: 13,
    color: colors.textSecondary,
  },
  viewOnMap: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '700',
    color: colors.link,
  },
  safetyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    backgroundColor: colors.photoPlusBackground,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  safetyIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safetyText: {
    flex: 1,
  },
  safetyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.link,
  },
  safetySubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  callBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.link,
  },
  callText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.link,
  },
  chatBtnWrap: {
    flex: 1.4,
  },
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 16,
  },
  chatText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyIconWrap: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkle: {
    position: 'absolute',
    fontSize: 13,
    color: colors.primary,
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginTop: 16,
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.link,
  },
  backBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.link,
  },
});
