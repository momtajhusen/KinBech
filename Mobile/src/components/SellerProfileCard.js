import { useState, useEffect, memo, useCallback, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, Text, View, Animated, Dimensions } from 'react-native';
import { useTheme, useThemedStyles } from '../theme';
import { resolveMediaUrl, formatDistanceLabel } from '../utils/listing';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(200, SCREEN_WIDTH / 2.0);
const COVER_HEIGHT = 74;
const LOGO_SIZE = 54;
export const INDIVIDUAL_GRADIENT = ['#1E3A8A', '#2563EB'];

const createStyles = (colors) => ({
  card: {
    width: CARD_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  fill: {
    flex: 1,
  },
  cover: {
    height: COVER_HEIGHT,
    overflow: 'hidden',
  },
  coverGradient: {
    width: '100%',
    height: '100%',
  },
  coverWatermark: {
    position: 'absolute',
    right: -10,
    bottom: -14,
  },
  coverTag: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  coverTagText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
    color: '#fff',
  },
  coverPin: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  coverPinButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  logo: {
    position: 'absolute',
    top: COVER_HEIGHT - LOGO_SIZE / 2,
    left: 12,
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderWidth: 3,
    borderColor: colors.surface,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoShop: {
    borderRadius: 14,
    backgroundColor: colors.pastelGreen,
  },
  logoPerson: {
    borderRadius: LOGO_SIZE / 2,
    backgroundColor: colors.pastelBlue,
  },
  ratingBadge: {
    position: 'absolute',
    top: COVER_HEIGHT + 6,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: colors.pastelOrange,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.text,
  },
  ratingCount: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
  },
  body: {
    flex: 1,
    paddingTop: LOGO_SIZE / 2 + 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  name: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  statLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  locationText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
  },
  thumbRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    marginBottom: 10,
  },
  thumb: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconBackground,
  },
  moreOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  moreText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
  spacer: {
    flex: 1,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    borderRadius: 10,
  },
  buttonShop: {
    backgroundColor: colors.primary,
  },
  buttonPerson: {
    borderWidth: 1.5,
    borderColor: colors.menuBlue,
    backgroundColor: colors.pastelBlue,
  },
  buttonText: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  // Compact (pinned)
  compactCard: {
    width: SCREEN_WIDTH / 3.4,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  compactStrip: {
    height: 3,
  },
  compactBody: {
    padding: 10,
  },
  compactTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  compactAvatar: {
    width: 38,
    height: 38,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  compactPin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconBackground,
  },
  compactName: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
  },
  compactTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  compactTagText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  compactStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    minHeight: 14,
  },
});

const SellerProfileCard = memo(function SellerProfileCard({
  seller,
  avatar,
  sellerName,
  storeName,
  verified,
  rating,
  reviewCount,
  distance,
  listingCount,
  location,
  isPinned = false,
  productGallery,
  compact = false,
  sellerType,
  onPress,
  onPinToggle,
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [pinned, setPinned] = useState(isPinned);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pinScaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setPinned(isPinned);
  }, [isPinned]);

  const handlePress = useCallback(() => {
    if (onPress) onPress();
  }, [onPress]);

  const handlePinToggle = useCallback(() => {
    Animated.sequence([
      Animated.timing(pinScaleAnim, { toValue: 1.3, duration: 100, useNativeDriver: true }),
      Animated.timing(pinScaleAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
    setPinned((prev) => !prev);
    if (onPinToggle) onPinToggle(!pinned);
  }, [onPinToggle, pinned, pinScaleAnim]);

  const springTo = useCallback(
    (toValue) => {
      Animated.spring(scaleAnim, { toValue, useNativeDriver: true, tension: 300, friction: 10 }).start();
    },
    [scaleAnim]
  );
  const handlePressIn = useCallback(() => springTo(0.97), [springTo]);
  const handlePressOut = useCallback(() => springTo(1), [springTo]);

  const resolvedType =
    sellerType ||
    seller?.sellerType ||
    (seller?.shopId && seller?.sellerType !== 'individual' ? 'shop' : 'individual');
  const isShop = resolvedType === 'shop';
  const displayName = storeName || sellerName || seller?.name || (isShop ? 'Store' : 'Seller');
  const rawRating = rating ?? seller?.ratingAverage ?? seller?.rating;
  const displayRating =
    rawRating != null && rawRating !== ''
      ? typeof rawRating === 'number'
        ? rawRating.toFixed(1)
        : String(rawRating)
      : '0.0';
  const displayReviews = Number(reviewCount ?? seller?.reviewsCount ?? seller?.reviewCount ?? 0);
  const hasRating = isShop && displayReviews > 0;
  const displayListings = listingCount || seller?.listingCount || 0;
  const displayLocation = location || seller?.location || 'Unknown location';
  const displayAvatar = resolveMediaUrl(avatar || seller?.avatarUrl || '');
  const isVerified = verified ?? Boolean(seller?.verified);
  const coverPhoto = isShop && seller?.coverImage ? resolveMediaUrl(seller.coverImage) : '';
  const category =
    seller?.category && seller.category !== 'Other' && seller.category !== 'General'
      ? seller.category
      : '';

  const rawDistance = distance ?? seller?.distance;
  const km = rawDistance == null || rawDistance === '' ? null : Number(rawDistance);
  const distanceLabel = formatDistanceLabel(Number.isFinite(km) ? km : null);

  const gallerySource = productGallery?.length ? productGallery : seller?.productGallery || [];
  const thumbs = gallerySource.map((item) => resolveMediaUrl(item)).filter(Boolean);
  const extraThumbs = Math.max(0, thumbs.length - 3);
  const itemsLabel = `${displayListings} ${displayListings === 1 ? 'item' : 'items'}`;

  const accent = isShop ? colors.primary : colors.menuBlue;
  const accentSoft = isShop ? colors.pastelGreen : colors.pastelBlue;
  const typeIcon = isShop ? 'storefront' : 'person';

  const pinIcon = (size, color) => (
    <Ionicons name={pinned ? 'bookmark' : 'bookmark-outline'} size={size} color={color} />
  );

  if (compact) {
    return (
      <Animated.View style={[styles.compactCard, { transform: [{ scale: scaleAnim }] }]}>
        <Pressable onPress={handlePress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
          <View style={[styles.compactStrip, { backgroundColor: accent }]} />
          <View style={styles.compactBody}>
            <View style={styles.compactTop}>
              <View
                style={[
                  styles.compactAvatar,
                  { borderRadius: isShop ? 10 : 19, borderColor: accent, backgroundColor: accentSoft },
                ]}
              >
                {displayAvatar ? (
                  <Image source={{ uri: displayAvatar }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name={typeIcon} size={18} color={accent} />
                )}
              </View>
              <Animated.View style={{ transform: [{ scale: pinScaleAnim }] }}>
                <Pressable onPress={handlePinToggle} hitSlop={8} style={styles.compactPin}>
                  {pinIcon(13, pinned ? colors.primary : colors.textMuted)}
                </Pressable>
              </Animated.View>
            </View>

            <Text style={styles.compactName} numberOfLines={1}>
              {displayName}
            </Text>
            <View style={[styles.compactTag, { backgroundColor: accentSoft }]}>
              <Ionicons name={typeIcon} size={9} color={accent} />
              <Text style={[styles.compactTagText, { color: accent }]}>
                {isShop ? 'Store' : 'Individual'}
              </Text>
            </View>

            <View style={styles.compactStats}>
              {hasRating ? (
                <View style={styles.statItem}>
                  <Ionicons name="star" size={10} color={colors.warning} />
                  <Text style={styles.statText}>{displayRating}</Text>
                </View>
              ) : (
                <View style={styles.statItem}>
                  <Ionicons name="cube-outline" size={10} color={colors.textSecondary} />
                  <Text style={styles.statText}>{displayListings}</Text>
                </View>
              )}
              {distanceLabel ? (
                <View style={styles.statItem}>
                  <Ionicons name="navigate-outline" size={10} color={colors.textSecondary} />
                  <Text style={styles.statText} numberOfLines={1}>
                    {distanceLabel}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  const subtitle = isShop
    ? isVerified
      ? 'Business verified'
      : category || 'Local store'
    : isVerified
      ? 'Phone verified'
      : 'Personal seller';

  return (
    <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.fill}
      >
        <View style={styles.cover}>
          {coverPhoto ? (
            <Image source={{ uri: coverPhoto }} style={styles.coverGradient} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={isShop ? colors.gradient : INDIVIDUAL_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.coverGradient}
            >
              <Ionicons
                name={typeIcon}
                size={72}
                color="rgba(255,255,255,0.12)"
                style={styles.coverWatermark}
              />
            </LinearGradient>
          )}
          <View style={styles.coverTag}>
            <Ionicons name={typeIcon} size={10} color="#fff" />
            <Text style={styles.coverTagText}>{isShop ? 'STORE' : 'INDIVIDUAL'}</Text>
          </View>
          <Animated.View style={[styles.coverPin, { transform: [{ scale: pinScaleAnim }] }]}>
            <Pressable onPress={handlePinToggle} hitSlop={8} style={styles.coverPinButton}>
              {pinIcon(15, '#fff')}
            </Pressable>
          </Animated.View>
        </View>

        <View style={[styles.logo, isShop ? styles.logoShop : styles.logoPerson]}>
          {displayAvatar ? (
            <Image source={{ uri: displayAvatar }} style={styles.avatarImage} />
          ) : (
            <Ionicons name={typeIcon} size={24} color={accent} />
          )}
        </View>

        {hasRating ? (
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={11} color={colors.warning} />
            <Text style={styles.ratingText}>{displayRating}</Text>
            <Text style={styles.ratingCount}>({displayReviews})</Text>
          </View>
        ) : null}

        <View style={styles.body}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {displayName}
            </Text>
            {isVerified ? (
              <Ionicons
                name={isShop ? 'shield-checkmark' : 'checkmark-circle'}
                size={13}
                color={colors.primary}
              />
            ) : null}
          </View>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>

          <View style={styles.statLine}>
            <View style={styles.statItem}>
              <Ionicons name="cube-outline" size={12} color={accent} />
              <Text style={styles.statText}>{itemsLabel}</Text>
            </View>
            {distanceLabel ? (
              <View style={styles.statItem}>
                <Ionicons name="navigate-outline" size={12} color={accent} />
                <Text style={styles.statText}>{distanceLabel}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={12} color={colors.textMuted} />
            <Text style={styles.locationText} numberOfLines={1}>
              {displayLocation}
            </Text>
          </View>

          <View style={styles.thumbRow}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.thumb}>
                {thumbs[i] ? (
                  <Image source={{ uri: thumbs[i] }} style={styles.avatarImage} resizeMode="cover" />
                ) : (
                  <Ionicons name="image-outline" size={14} color={colors.textMuted} />
                )}
                {i === 2 && extraThumbs > 0 ? (
                  <View style={styles.moreOverlay}>
                    <Text style={styles.moreText}>+{extraThumbs}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>

          <View style={styles.spacer} />

          <Pressable
            style={[styles.button, isShop ? styles.buttonShop : styles.buttonPerson]}
            onPress={handlePress}
          >
            <Ionicons
              name={isShop ? 'storefront-outline' : 'person-outline'}
              size={14}
              color={isShop ? colors.onPrimary : colors.menuBlue}
            />
            <Text style={[styles.buttonText, { color: isShop ? colors.onPrimary : colors.menuBlue }]}>
              {isShop ? 'View Store' : 'View Profile'}
            </Text>
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
});

export default SellerProfileCard;
