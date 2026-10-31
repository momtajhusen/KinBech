import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import {
  Alert,
  Dimensions,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView, ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import { useIsFocused } from '@react-navigation/native';
import ZoomableImage from '../components/ZoomableImage';
import { useAuth } from '../context/AuthContext';
import { useWishlist } from '../context/WishlistContext';
import { useRequireLogin } from '../components/LoginPrompt';
import { INFO_COPY, ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import EmptyState from '../components/EmptyState';
import ProductCard from '../components/ProductCard';
import VariantPicker from '../components/VariantPicker';
import { useDisplayCurrency } from '../utils/currency';
import {
  cardPrice,
  categoryIcon,
  attachDistanceToCard,
  resolveListingCoords,
  resolveMediaUrl,
  toCardItem,
  toDetailItem,
} from '../utils/listing';
import { getDefaultVariantSelection } from '../utils/listingVariants';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';
import { rememberViewedListing } from '../utils/recentlyViewed';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const RELATED_GUTTER = 8;
const RELATED_CARD_WIDTH = (SCREEN_WIDTH - 32 - RELATED_GUTTER) / 2;
const THUMB_SIZE = 36;
const THUMB_GAP = 6;
const THUMB_PAD = 8;
const IMAGE_HEIGHT = 340;
const AUTO_SLIDE_MS = 2500;
const HERO_WIDTH = SCREEN_WIDTH - 32;

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
  const requireLogin = useRequireLogin();
  useDisplayCurrency();
  const { isSaved, toggle } = useWishlist();
  const [activeIndex, setActiveIndex] = useState(0);
  const [descOpen, setDescOpen] = useState(true);
  const [listing, setListing] = useState(route?.params?.item || null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerZoomed, setViewerZoomed] = useState(false);
  const [ptrReady, setPtrReady] = useState(false);
  const [variantSelection, setVariantSelection] = useState({});
  const [distanceLabel, setDistanceLabel] = useState(null);
  const [relatedItems, setRelatedItems] = useState([]);
  const pagerRef = useRef(null);
  const thumbsRef = useRef(null);
  const photoCountRef = useRef(0);
  const thumbStripWidthRef = useRef(0);
  const [autoPaused, setAutoPaused] = useState(false);
  const isFocused = useIsFocused();
  const viewerRef = useRef(null);
  const viewerThumbsRef = useRef(null);
  const viewerThumbWidthRef = useRef(0);
  const listingId = route?.params?.listingId || listing?.id || listing?._id;
  const searchQuery = route?.params?.searchQuery || '';

  const loadListing = useCallback(async () => {
    if (!listingId) return;
    const { data, error } = await api.getListing(listingId);
    if (error) {
      console.error('Failed to load listing:', error);
    } else if (data?.listing) {
      setListing(data.listing);
      rememberViewedListing(data.listing);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted' || cancelled) return;
        let point = await Location.getLastKnownPositionAsync();
        if (!point?.coords) {
          point = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
        }
        if (cancelled || !point?.coords) return;
        const measured = attachDistanceToCard(
          { listing },
          { lat: point.coords.latitude, lng: point.coords.longitude },
        );
        if (!cancelled) setDistanceLabel(measured?.distanceLabel || null);
      } catch {
        if (!cancelled) setDistanceLabel(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listing]);

  useEffect(() => {
    const title = listing?.title;
    if (!title || !listingId) {
      setRelatedItems([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      let coords = null;
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status === 'granted') {
          const point = await Location.getLastKnownPositionAsync();
          if (point?.coords) {
            coords = { lat: point.coords.latitude, lng: point.coords.longitude };
          }
        }
      } catch {
        coords = null;
      }
      const { data, error } = await api.getRelatedListings({
        title,
        exclude: listingId,
        category: listing?.category || '',
        q: searchQuery,
        limit: 8,
      });
      if (cancelled || error || !data?.listings) return;
      const cards = data.listings
        .map(toCardItem)
        .filter((card) => card && String(card.id) !== String(listingId))
        .map((card) => (coords ? attachDistanceToCard(card, coords) : card));
      if (!cancelled) setRelatedItems(cards);
    })();
    return () => {
      cancelled = true;
    };
  }, [listing?.title, listing?.category, listingId, searchQuery]);

  useEffect(() => {
    if (photoCountRef.current < 2) return;
    const step = THUMB_SIZE + THUMB_GAP;
    const stripWidth = thumbStripWidthRef.current || HERO_WIDTH - 32;
    const x = Math.max(0, THUMB_PAD + activeIndex * step - (stripWidth - THUMB_SIZE) / 2);
    thumbsRef.current?.scrollTo({ x, animated: true });
    const viewerWidth = viewerThumbWidthRef.current || SCREEN_WIDTH - 32;
    const viewerX = Math.max(0, THUMB_PAD + activeIndex * step - (viewerWidth - THUMB_SIZE) / 2);
    viewerThumbsRef.current?.scrollTo({ x: viewerX, animated: true });
  }, [activeIndex]);

  useEffect(() => {
    const count = photoCountRef.current;
    if (!listing || count < 2 || autoPaused || viewerOpen || !isFocused) return undefined;
    const timer = setTimeout(() => {
      const next = (activeIndex + 1) % count;
      setActiveIndex(next);
      pagerRef.current?.scrollTo({ x: next * HERO_WIDTH, animated: true });
    }, AUTO_SLIDE_MS);
    return () => clearTimeout(timer);
  }, [activeIndex, autoPaused, viewerOpen, isFocused, listing]);

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

  const sellerPhone = String(item.sellerData?.phone || '').trim();
  const shopPhone = String(listing.shopId?.phone || '').trim();
  const signals = item.sellerData?.signals;
  const sellerTrustLine = signals
    ? [
        signals.badge,
        signals.replyText,
        signals.dealsCompleted ? `${signals.dealsCompleted} deal${signals.dealsCompleted === 1 ? '' : 's'}` : '',
        signals.reviewCount ? `★ ${Number(signals.ratingAverage).toFixed(1)} (${signals.reviewCount})` : '',
      ].filter(Boolean).join(' · ')
    : '';
  const stockLine = { low_stock: 'Only a few left', out_of_stock: 'Out of stock' }[listing.stockState] || '';
  const shopOpenLine = listing.shopId?.openNow === true ? 'Open now' : listing.shopId?.openNow === false ? 'Closed now' : '';
  const shopTrustLine = [shopOpenLine, stockLine].filter(Boolean).join(' · ');

  const handleOpenMap = async () => {
    const coords = resolveListingCoords(listing);
    const query = coords
      ? `${coords.lat},${coords.lng}`
      : String(listing.location || item.mapAddress || '').trim();
    if (!query) {
      Alert.alert('Location not available', 'This listing has no location set.');
      return;
    }
    try {
      await Linking.openURL(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
      );
    } catch {
      Alert.alert('Map failed', 'Could not open a map app on this device.');
    }
  };

  const media = collectMedia(listing, item);
  const resolvedPhotos = media.length
    ? media.map((entry) => ({
        ...entry,
        icon: categoryIcon(listing?.category),
      }))
    : [{ icon: categoryIcon(listing?.category), bg: colors.photoDark1, type: 'image' }];
  const hasThumbs = resolvedPhotos.length > 1;
  const heroWidth = HERO_WIDTH;
  photoCountRef.current = resolvedPhotos.length;

  const selectMedia = (index) => {
    setActiveIndex(index);
    pagerRef.current?.scrollTo({ x: index * heroWidth, animated: true });
  };

  const onPagerEnd = (event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.max(
      0,
      Math.min(Math.round(offsetX / heroWidth), resolvedPhotos.length - 1),
    );
    if (index !== activeIndex) setActiveIndex(index);
  };

  const onViewerEnd = (event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.max(
      0,
      Math.min(Math.round(offsetX / SCREEN_WIDTH), resolvedPhotos.length - 1),
    );
    if (index !== activeIndex) setActiveIndex(index);
  };

  const showMedia = (index) => {
    setViewerZoomed(false);
    setActiveIndex(index);
    viewerRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
  };

  const renderThumb = (photo, index, onSelect) => (
    <Pressable
      key={`${photo.uri || 'empty'}-${index}`}
      onPress={() => onSelect(index)}
      style={[styles.thumb, index === activeIndex && styles.thumbActive]}
    >
      {photo.uri && photo.type !== 'video' ? (
        <Image source={{ uri: photo.uri }} style={styles.thumbImage} />
      ) : (
        <View style={[styles.thumbFallback, { backgroundColor: photo.bg || colors.photoDark1 }]}>
          <Icon
            name={photo.type === 'video' ? 'videocam' : photo.icon || 'cube-outline'}
            size={12}
            color="#fff"
          />
        </View>
      )}
      {photo.type === 'video' ? (
        <View style={styles.thumbPlay}>
          <Icon name="play" size={8} color="#fff" />
        </View>
      ) : null}
    </Pressable>
  );

  const closeViewer = () => {
    setViewerOpen(false);
    setViewerZoomed(false);
    requestAnimationFrame(() => {
      pagerRef.current?.scrollTo({ x: activeIndex * heroWidth, animated: false });
    });
  };

  const startChat = () => requireLogin('chat', async () => {
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
      name: data.chat.otherUser?.shop?.name || data.chat.otherUser?.name || item.seller,
      listing: listing,
      otherUserId: data.chat.otherUser?.id || sellerId,
      image: resolveMediaUrl(data.chat.otherUser?.shop?.logo || data.chat.otherUser?.avatarUrl || ''),
    });
  });

  const openSellerPage = () => {
    if (listing.sellerType === 'shop' && listing.shopId) {
      navigation.navigate(ROUTES.SHOP_PROFILE, { shopId: listing.shopId._id || listing.shopId.id || listing.shopId });
    } else {
      navigation.navigate(ROUTES.SELLER_PROFILE, { seller: item.sellerData });
    }
  };

  const openRelated = (card) =>
    navigation.push(ROUTES.ITEM_DETAIL, {
      listingId: card.id,
      item: card.listing || card,
      sharedId: card.id,
      searchQuery,
    });

  const renderContactActions = () => (
    <View style={styles.priceActions}>
      <Pressable style={styles.viewMapBtn} onPress={() => requireLogin('map', handleOpenMap)}>
        <Icon name="map-outline" size={14} color={colors.link} />
        <Text style={styles.viewMapText}>View map</Text>
      </Pressable>
      <Pressable
        style={styles.chatBtnWrap}
        onPress={startChat}
      >
        <LinearGradient
          colors={colors.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.chatBtn}
        >
          <Icon name="chatbubble-ellipses" size={15} color={colors.onGradient} />
          <Text style={styles.chatText}>Chat Now</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top }}
        refreshControl={ptrReady ? refreshControl(colors, refreshing, onRefresh) : undefined}
      >
        <View style={styles.imageWrap}>
          <View style={styles.heroArea}>
            <ScrollView
              ref={pagerRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScrollBeginDrag={() => setAutoPaused(true)}
              onMomentumScrollEnd={(event) => {
                onPagerEnd(event);
                setAutoPaused(false);
              }}
              style={styles.heroPager}
            >
              {resolvedPhotos.map((photo, index) => (
                <Pressable
                  key={`hero-${photo.uri || 'empty'}-${index}`}
                  style={[styles.heroPress, { width: heroWidth }]}
                  onPress={() => setViewerOpen(true)}
                >
                  {photo.uri && photo.type !== 'video' ? (
                    <Image
                      source={{ uri: photo.uri }}
                      style={styles.heroImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.heroFallback, { backgroundColor: photo.bg || colors.photoDark1 }]}>
                      <Icon
                        name={photo.type === 'video' ? 'videocam' : photo.icon || 'cube-outline'}
                        size={64}
                        color="rgba(255,255,255,0.9)"
                      />
                      {photo.type === 'video' ? (
                        <Text style={styles.heroHint}>Tap to view video</Text>
                      ) : null}
                    </View>
                  )}
                  {photo.type === 'video' && photo.uri ? (
                    <View style={styles.heroPlay} pointerEvents="none">
                      <View style={styles.heroPlayBtn}>
                        <Icon name="play" size={22} color="#fff" />
                      </View>
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.imageActions} pointerEvents="box-none">
              <Pressable style={styles.headerBtn} onPress={() => navigation.goBack()} hitSlop={10}>
                <Icon name="chevron-back" size={22} color="#fff" />
              </Pressable>
              <Pressable
                style={styles.headerBtn}
                onPress={() => listingId && toggle(listingId)}
                hitSlop={10}
              >
                <Icon
                  name={isSaved(listingId) ? 'heart' : 'heart-outline'}
                  size={20}
                  color={isSaved(listingId) ? colors.danger : '#fff'}
                />
              </Pressable>
            </View>

            {hasThumbs ? (
              <View style={styles.thumbOverlay} pointerEvents="box-none">
                <ScrollView
                  ref={thumbsRef}
                  horizontal
                  nestedScrollEnabled
                  showsHorizontalScrollIndicator={false}
                  style={styles.thumbStrip}
                  contentContainerStyle={styles.thumbStripContent}
                  onLayout={(event) => {
                    thumbStripWidthRef.current = event.nativeEvent.layout.width;
                  }}
                  onScrollBeginDrag={() => setAutoPaused(true)}
                  onMomentumScrollEnd={() => setAutoPaused(false)}
                >
                  {resolvedPhotos.map((photo, index) => renderThumb(photo, index, selectMedia))}
                </ScrollView>
                <View style={styles.counterPill}>
                  <Text style={styles.counterText}>
                    {Math.min(activeIndex + 1, resolvedPhotos.length)} / {resolvedPhotos.length}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.content}>
          <View
            style={styles.titleRow}

          >
            <Text style={styles.title}>{item.title}</Text>
            <View style={styles.conditionPill}>
              <Text style={styles.conditionText}>{item.condition}</Text>
            </View>
          </View>

          {!listing.hasVariants ? (
            <View style={styles.priceRow}>
              <Text style={styles.price} numberOfLines={1}>
                {cardPrice(item)}
              </Text>
              {renderContactActions()}
            </View>
          ) : null}

          {listing.hasVariants ? (
            <VariantPicker
              listing={listing}
              selection={variantSelection}
              onChangeSelection={setVariantSelection}
              colors={colors}
              styles={styles}
              trailing={renderContactActions()}
            />
          ) : null}

          <View style={styles.metaRow}>
            <View style={styles.metaPlace}>
              <Icon name="location" size={15} color={colors.primary} />
              <Text style={styles.metaText} numberOfLines={1}>
                {String(item.location || '').split(',')[0].trim() || 'Location'}
              </Text>
              {distanceLabel ? (
                <Text style={styles.metaDistance}>{distanceLabel}</Text>
              ) : null}
            </View>
            <Text style={styles.metaTime}>{item.posted}</Text>
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
                    <Icon name="person" size={26} color={colors.onGradient} />
                  )}
                </View>
                <View style={styles.sellerInfo}>
                  <Text style={styles.sellerName}>{item.seller}</Text>
                  {sellerPhone ? (
                    <View style={styles.sellerMetaRow}>
                      <Icon name="call" size={14} color={colors.success} />
                      <Text style={styles.sellerMetaText} numberOfLines={1}>
                        {sellerPhone}
                      </Text>
                    </View>
                  ) : null}
                  {sellerTrustLine ? (
                    <Text style={styles.sellerTrustText} numberOfLines={1}>{sellerTrustLine}</Text>
                  ) : null}
                </View>
                <View style={styles.shopSide}>
                  <View style={styles.shopTag}>
                    <Text style={styles.shopTagText}>INDIVIDUAL</Text>
                  </View>
                  <View style={styles.viewProfileRow}>
                    <Text style={styles.viewProfile}>View Profile</Text>
                    <Icon name="chevron-forward" size={16} color={colors.link} />
                  </View>
                </View>
              </Pressable>
            )}

            {/* Shop Seller Card */}
            {listing.sellerType === 'shop' && listing.shopId && (
              <Pressable
                style={styles.shopCard}
                onPress={() => navigation.navigate(ROUTES.SHOP_PROFILE, { shopId: listing.shopId._id || listing.shopId.id || listing.shopId })}
              >
                <View style={styles.shopLogo}>
                  {listing.shopId?.logo ? (
                    <Image source={{ uri: resolveMediaUrl(listing.shopId.logo) }} style={styles.sellerAvatarImage} />
                  ) : (
                    <Icon name="storefront" size={22} color={colors.primary} />
                  )}
                </View>
                <View style={styles.sellerInfo}>
                  <Text style={styles.sellerName} numberOfLines={1}>{listing.shopId?.name || 'Shop'}</Text>
                  {listing.shopId?.tagline ? (
                    <Text style={styles.shopTagline} numberOfLines={1}>
                      {listing.shopId.tagline}
                    </Text>
                  ) : null}
                  {shopPhone ? (
                    <View style={styles.sellerMetaRow}>
                      <Icon name="call" size={13} color={colors.success} />
                      <Text style={styles.sellerMetaText} numberOfLines={1}>
                        {shopPhone}
                      </Text>
                    </View>
                  ) : null}
                  {shopTrustLine ? (
                    <Text style={[styles.sellerTrustText, listing.stockState === 'out_of_stock' && { color: colors.deleteRed }]} numberOfLines={1}>
                      {shopTrustLine}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.shopSide}>
                  <View style={styles.shopTag}>
                    <Text style={styles.shopTagText}>STORE</Text>
                  </View>
                  <View style={styles.viewProfileRow}>
                    <Text style={styles.viewProfile}>View Store</Text>
                    <Icon name="chevron-forward" size={16} color={colors.link} />
                  </View>
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
                    <Icon name="person" size={26} color={colors.onGradient} />
                  )}
                </View>
                <View style={styles.sellerInfo}>
                  <Text style={styles.sellerName}>{item.seller}</Text>
                  {sellerPhone ? (
                    <View style={styles.sellerMetaRow}>
                      <Icon name="call" size={14} color={colors.success} />
                      <Text style={styles.sellerMetaText} numberOfLines={1}>
                        {sellerPhone}
                      </Text>
                    </View>
                  ) : null}
                  {sellerTrustLine ? (
                    <Text style={styles.sellerTrustText} numberOfLines={1}>{sellerTrustLine}</Text>
                  ) : null}
                </View>
                <View style={styles.shopSide}>
                  <View style={styles.shopTag}>
                    <Text style={styles.shopTagText}>INDIVIDUAL</Text>
                  </View>
                  <View style={styles.viewProfileRow}>
                    <Text style={styles.viewProfile}>View Profile</Text>
                    <Icon name="chevron-forward" size={16} color={colors.link} />
                  </View>
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
                <Icon name="document-text-outline" size={18} color={colors.text} />
                <Text style={styles.sectionTitle}>Description</Text>
              </View>
              <Icon
                name={descOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.primary}
              />
            </Pressable>
            {descOpen && <Text style={styles.description}>{item.description}</Text>}
          </View>

          <View

          >
            <Pressable style={styles.safetyBanner} onPress={() => navigation.navigate(ROUTES.INFO, INFO_COPY.SafetyTips)}>
              <View style={styles.safetyIcon}>
                <Icon name="shield-checkmark" size={22} color={colors.onGradient} />
              </View>
              <View style={styles.safetyText}>
                <Text style={styles.safetyTitle}>Stay Safe with Each Other</Text>
                <Text style={styles.safetySubtitle}>
                  Meet in public places and check the item before making payment.
                </Text>
              </View>
              <Icon name="chevron-forward" size={18} color={colors.link} />
            </Pressable>
          </View>

          {relatedItems.length > 0 ? (
            <View style={styles.relatedSection}>
              <Text style={styles.sectionTitle}>Related items</Text>
              <View style={styles.relatedGrid}>
                {relatedItems.map((card) => (
                  <ProductCard
                    key={card.id}
                    {...card}
                    compact
                    width={RELATED_CARD_WIDTH}
                    sharedId={card.id}
                    onPress={() => openRelated(card)}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <Modal
        visible={viewerOpen}
        animationType="fade"
        onRequestClose={closeViewer}
        onShow={() => {
          viewerRef.current?.scrollTo({ x: activeIndex * SCREEN_WIDTH, animated: false });
          const width = viewerThumbWidthRef.current || SCREEN_WIDTH - 32;
          const x = Math.max(0, THUMB_PAD + activeIndex * (THUMB_SIZE + THUMB_GAP) - (width - THUMB_SIZE) / 2);
          viewerThumbsRef.current?.scrollTo({ x, animated: false });
        }}
      >
        <GestureHandlerRootView style={styles.viewer}>
          <Pressable style={[styles.viewerClose, { top: insets.top + 8 }]} onPress={closeViewer}>
            <Icon name="close" size={24} color="#fff" />
          </Pressable>
          <GestureScrollView
            ref={viewerRef}
            horizontal
            pagingEnabled
            scrollEnabled={!viewerZoomed}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onViewerEnd}
            style={styles.viewerBody}
          >
            {resolvedPhotos.map((photo, index) =>
              photo.uri && photo.type !== 'video' ? (
                <View key={`viewer-${photo.uri}-${index}`} style={styles.viewerSlide}>
                  <ZoomableImage
                    uri={photo.uri}
                    style={styles.viewerImage}
                    active={index === activeIndex}
                    zoomed={viewerZoomed && index === activeIndex}
                    onZoomChange={setViewerZoomed}
                    onTap={closeViewer}
                  />
                </View>
              ) : (
                <Pressable
                  key={`viewer-${photo.uri || 'empty'}-${index}`}
                  style={styles.viewerSlide}
                  onPress={closeViewer}
                >
                  <View style={styles.viewerFallback}>
                    <Icon
                      name={photo.type === 'video' ? 'videocam' : 'image-outline'}
                      size={64}
                      color="#fff"
                    />
                    <Text style={styles.heroHint}>
                      {photo.type === 'video' ? 'Video preview' : 'No preview'}
                    </Text>
                  </View>
                </Pressable>
              )
            )}
          </GestureScrollView>
          <View style={[styles.viewerBar, { paddingBottom: insets.bottom + 16 }]}>
            {hasThumbs ? (
              <ScrollView
                ref={viewerThumbsRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.viewerThumbStrip}
                contentContainerStyle={styles.thumbStripContent}
                onLayout={(event) => {
                  viewerThumbWidthRef.current = event.nativeEvent.layout.width;
                }}
              >
                {resolvedPhotos.map((photo, index) => renderThumb(photo, index, showMedia))}
              </ScrollView>
            ) : null}
            <View style={styles.viewerNavRow}>
              <Pressable
                style={styles.viewerNav}
                onPress={() => showMedia(activeIndex === 0 ? resolvedPhotos.length - 1 : activeIndex - 1)}
              >
                <Icon name="chevron-back" size={22} color="#fff" />
              </Pressable>
              <View style={[styles.counterPill, styles.viewerCounter]}>
                <Text style={styles.counterText}>
                  {Math.min(activeIndex + 1, resolvedPhotos.length)} / {resolvedPhotos.length}
                </Text>
              </View>
              <Pressable
                style={styles.viewerNav}
                onPress={() => showMedia((activeIndex + 1) % resolvedPhotos.length)}
              >
                <Icon name="chevron-forward" size={22} color="#fff" />
              </Pressable>
            </View>
          </View>
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  imageActions: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  imageWrap: {
    height: IMAGE_HEIGHT,
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    marginHorizontal: 16,
  },
  thumbOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 8,
    alignItems: 'center',
    zIndex: 2,
  },
  thumbStrip: {
    flexGrow: 0,
    maxWidth: HERO_WIDTH - 32,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  thumbStripContent: {
    alignItems: 'center',
    gap: THUMB_GAP,
    paddingHorizontal: THUMB_PAD,
    paddingVertical: 6,
  },
  heroArea: {
    flex: 1,
    position: 'relative',
    backgroundColor: colors.photoDark1,
  },
  heroPager: {
    flex: 1,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.iconBackground,
  },
  thumbActive: {
    borderColor: colors.primary,
    transform: [{ scale: 1.08 }],
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
  },
  viewerSlide: {
    width: SCREEN_WIDTH,
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
    alignItems: 'center',
    gap: 10,
  },
  viewerThumbStrip: {
    flexGrow: 0,
    maxWidth: SCREEN_WIDTH - 32,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  viewerCounter: {
    marginTop: 0,
  },
  viewerNavRow: {
    alignSelf: 'stretch',
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
  counterPill: {
    marginTop: 6,
    alignSelf: 'center',
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
    paddingBottom: 28,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 24,
  },
  conditionPill: {
    backgroundColor: colors.conditionColor,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  conditionText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  priceRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  price: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: colors.price,
  },
  priceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 8,
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
  variantPickerPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  variantPickerPrice: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
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
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 12,
  },
  metaText: {
    flexShrink: 1,
    fontSize: 13,
    color: colors.textSecondary,
  },
  metaPlace: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.link,
  },
  viewMapText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.link,
  },
  metaTime: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  metaDistance: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    padding: 14,
    gap: 12,
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
  sellerTrustText: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  sellerAvatarImage: {
    width: '100%',
    height: '100%',
  },
  shopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 12,
  },
  shopSide: {
    alignSelf: 'stretch',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  shopTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.primarySoft || `${colors.primary}18`,
  },
  shopTagText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: colors.primary,
  },
  shopLogo: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.pastelGreen,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  shopTagline: {
    marginTop: 1,
    fontSize: 12,
    color: colors.textMuted,
  },
  sellerInfo: {
    flex: 1,
    minWidth: 0,
  },
  sellerName: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '700',
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
  sellerReviewCount: {
    fontSize: 12,
    color: colors.textMuted,
  },
  sellerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  sellerMetaText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  viewProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    flexShrink: 0,
    gap: 2,
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
  relatedSection: {
    marginTop: 22,
  },
  relatedHint: {
    marginTop: 2,
    marginBottom: 12,
    fontSize: 13,
    color: colors.textSecondary,
  },
  relatedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: RELATED_GUTTER,
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
  chatBtnWrap: {},
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  chatText: {
    fontSize: 12,
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
