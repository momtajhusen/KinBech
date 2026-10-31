import { useState, useEffect, memo, useCallback, useRef } from 'react';
import Icon from './Icon';
import { Image, Pressable, Text, View, Animated, Dimensions } from 'react-native';
import { useTheme, useThemedStyles } from '../theme';
import { resolveMediaUrl, formatDistanceLabel, thumbUrl } from '../utils/listing';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(200, SCREEN_WIDTH / 2.0);
export const INDIVIDUAL_GRADIENT = ['#1E3A8A', '#2563EB'];

const createStyles = (colors) => ({
  card: {
    width: CARD_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: 16,
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
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logoGroup: {
    gap: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logoWrap: {
    borderWidth: 1.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoShop: {
    backgroundColor: colors.pastelGreen,
    borderColor: colors.primary,
  },
  logoPerson: {
    backgroundColor: colors.pastelBlue,
    borderColor: colors.menuBlue,
  },
  individualCard: {
    borderColor: 'rgba(37, 99, 235, 0.22)',
  },
  storeCard: {
    borderColor: 'rgba(16, 185, 129, 0.22)',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  topRightActions: {
    position: 'absolute',
    top: 8,
    right: 8,
    alignItems: 'flex-end',
    gap: 8,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  pinButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 6,
  },
  ratingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1.5,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
  },
  ratingText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.warning,
  },
  body: {
    flex: 1,
    paddingHorizontal: 11,
    paddingTop: 11,
    paddingBottom: 10,
    justifyContent: 'space-between',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  name: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 18,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  subtitle: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    lineHeight: 14,
    letterSpacing: 0.2,
  },
  metaStack: {
    gap: 4,
  },
  statLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
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
    gap: 7,
  },
  locationIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    lineHeight: 14,
  },
  viewProfileBtn: {
    marginTop: 4,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.2,
  },
  viewProfileBtnStore: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  viewProfileBtnIndividual: {
    backgroundColor: 'transparent',
    borderColor: colors.menuBlue,
  },
  viewProfileBtnText: {
    fontSize: 11.5,
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
    flex: 1,
    justifyContent: 'space-between',
  },
  compactTop: {
    gap: 6,
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
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    zIndex: 5,
  },
  compactName: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 15,
    marginTop: 4,
  },
  compactTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    marginTop: 2,
    paddingHorizontal: 6,
    paddingVertical: 1,
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
    marginTop: 4,
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
  width,
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
  const category =
    seller?.category && seller.category !== 'Other' && seller.category !== 'General'
      ? seller.category
      : '';

  const rawDistance = distance ?? seller?.distance;
  const km = rawDistance == null || rawDistance === '' ? null : Number(rawDistance);
  const distanceLabel = formatDistanceLabel(Number.isFinite(km) ? km : null);

  const itemsLabel = `${displayListings} ${displayListings === 1 ? 'item' : 'items'}`;
  const cardWidth = width || CARD_WIDTH;

  // Banner-free card: fixed height keeps the grid tidy and content readable.
  const SELLER_CARD_HEIGHT = 190;
  const layout = { width: cardWidth, height: SELLER_CARD_HEIGHT };

  const logoSize = Math.min(46, Math.round(cardWidth * 0.32));

  const accent = isShop ? colors.primary : colors.menuBlue;
  const accentSoft = isShop ? colors.pastelGreen : colors.pastelBlue;
  const typeIcon = isShop ? 'storefront' : 'person';

  const pinIcon = (size, color) => (
    <Icon name={pinned ? 'bookmark' : 'bookmark-outline'} size={size} color={color} />
  );

  if (compact) {
    return (
      <Animated.View style={[styles.compactCard, { transform: [{ scale: scaleAnim }] }]}>
        <Pressable onPress={handlePress} onPressIn={handlePressIn} onPressOut={handlePressOut} style={styles.fill}>
          <View style={[styles.compactStrip, { backgroundColor: accent }]} />
          
          <Animated.View style={[styles.compactPin, { transform: [{ scale: pinScaleAnim }] }]}>
            <Pressable onPress={handlePinToggle} hitSlop={8} style={styles.fill}>
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                {pinIcon(12, pinned ? colors.primary : colors.textMuted)}
              </View>
            </Pressable>
          </Animated.View>

          <View style={styles.compactBody}>
            <View>
              <View style={styles.compactTop}>
                <View
                  style={[
                    styles.compactAvatar,
                    { borderRadius: isShop ? 10 : 19, borderColor: accent, backgroundColor: accentSoft },
                  ]}
                >
                  {displayAvatar ? (
                    <Image source={{ uri: thumbUrl(displayAvatar, 200) }} resizeMethod="resize" style={styles.avatarImage} />
                  ) : (
                    <Icon name={typeIcon} size={18} color={accent} />
                  )}
                </View>
                
                <View style={[styles.compactTag, { backgroundColor: accentSoft }]}>
                  <Icon name={typeIcon} size={8} color={accent} />
                  <Text style={[styles.compactTagText, { color: accent }]} numberOfLines={1}>
                    {isShop ? 'STORE' : 'INDIVIDUAL'}
                  </Text>
                </View>
              </View>

              <Text style={styles.compactName} numberOfLines={1}>
                {displayName}
              </Text>
            </View>

            <View style={styles.compactStats}>
              {hasRating ? (
                <View style={styles.statItem}>
                  <Icon name="star" size={10} color={colors.warning} />
                  <Text style={styles.statText}>{displayRating}</Text>
                </View>
              ) : (
                <View style={styles.statItem}>
                  <Icon name="cube-outline" size={10} color={colors.textSecondary} />
                  <Text style={styles.statText}>{displayListings}</Text>
                </View>
              )}
              {distanceLabel ? (
                <View style={styles.statItem}>
                  <Icon name="navigate-outline" size={10} color={colors.textSecondary} />
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

  return (
    <Animated.View
      style={[
        styles.card,
        isShop ? styles.storeCard : styles.individualCard,
        { width: layout.width, height: layout.height, transform: [{ scale: scaleAnim }] },
      ]}
    >
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.fill}
      >
        <View style={styles.body}>
          <View style={styles.topRightActions}>
            <View style={[styles.typeBadge, { backgroundColor: accentSoft }]}>
              <Icon name={typeIcon} size={9} color={accent} />
              <Text style={[styles.typeBadgeText, { color: accent }]}>
                {isShop ? 'STORE' : 'INDIVIDUAL'}
              </Text>
            </View>
            <Animated.View style={{ transform: [{ scale: pinScaleAnim }] }}>
              <Pressable onPress={handlePinToggle} hitSlop={8} style={styles.pinButton}>
                {pinIcon(13, pinned ? colors.primary : colors.textMuted)}
              </Pressable>
            </Animated.View>
          </View>

          <View>
            <View style={styles.logoRow}>
              <View style={styles.logoGroup}>
                <View
                  style={[
                    styles.logoWrap,
                    isShop ? styles.logoShop : styles.logoPerson,
                    {
                      width: logoSize,
                      height: logoSize,
                      borderRadius: isShop ? 14 : logoSize / 2,
                    },
                  ]}
                >
                  {displayAvatar ? (
                    <Image source={{ uri: thumbUrl(displayAvatar, 200) }} resizeMethod="resize" style={styles.avatarImage} />
                  ) : (
                    <Icon name={typeIcon} size={22} color={accent} />
                  )}
                </View>
                
                {hasRating ? (
                  <View style={styles.ratingChip}>
                    <Icon name="star" size={10} color={colors.warning} />
                    <Text style={styles.ratingText}>{displayRating}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {displayName}
              </Text>
              {isVerified ? (
                <Icon
                  name={isShop ? 'shield-checkmark' : 'checkmark-circle'}
                  size={14}
                  color={colors.primary}
                />
              ) : null}
            </View>
            <View style={styles.subtitleRow}>
              <Text style={[styles.subtitle, { color: accent }]} numberOfLines={1}>
                {category || (isShop ? 'Local Store' : 'Individual Seller')}
              </Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.metaStack}>
              <View style={styles.locationRow}>
                <View style={styles.locationIcon}>
                  <Icon name="location-outline" size={11} color={colors.textSecondary} />
                </View>
                <Text style={styles.locationText} numberOfLines={1}>
                  {displayLocation}
                </Text>
              </View>
              <View style={styles.statLine}>
                <View style={styles.statItem}>
                  <Icon name="cube-outline" size={12} color={colors.textSecondary} />
                  <Text style={styles.statText} numberOfLines={1}>
                    {itemsLabel}
                  </Text>
                </View>
                {distanceLabel ? (
                  <View style={styles.statItem}>
                    <Icon name="navigate-outline" size={12} color={colors.textSecondary} />
                    <Text style={styles.statText} numberOfLines={1}>
                      {distanceLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          <View
            style={[
              styles.viewProfileBtn,
              isShop ? styles.viewProfileBtnStore : styles.viewProfileBtnIndividual,
            ]}
          >
            <Text
              style={[
                styles.viewProfileBtnText,
                { color: isShop ? colors.onPrimary || '#fff' : colors.menuBlue },
              ]}
            >
              View Profile
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
});

export default SellerProfileCard;
