import { useState, memo, useCallback, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Dimensions, Image, Pressable, Text, View, useWindowDimensions, Animated, Platform } from 'react-native';
import { useSharedTransition } from '../context/SharedTransitionContext';
import { useWishlist } from '../context/WishlistContext';
import { useTheme, useThemedStyles } from '../theme';

export const CARD_ROW_PADDING = 16;
export const CARD_GAP = 10;
export const PEEK_VISIBLE = 2.5;
export const COMPACT_IMAGE_RATIO = 0.88;
export const COMPACT_BODY_HEIGHT = 118;

export function compactCardLayout(width) {
  const cardWidth = Number(width) || 0;
  const imageHeight = Math.round(cardWidth * COMPACT_IMAGE_RATIO);
  return {
    width: cardWidth,
    imageHeight,
    bodyHeight: COMPACT_BODY_HEIGHT,
    height: imageHeight + COMPACT_BODY_HEIGHT,
  };
}

/** Width so `visibleCount` cards (e.g. 3.5) fit in one screen row. */
export function peekCardWidth(screenWidth, visibleCount = PEEK_VISIBLE) {
  const width = screenWidth ?? Dimensions.get('window').width;
  const gapsInView = Math.floor(visibleCount);
  return (width - CARD_ROW_PADDING - CARD_GAP * gapsInView) / visibleCount;
}

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

const createStyles = (colors) => ({
  cardWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.primary,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  image: {
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  imageFill: {
    width: '100%',
    height: '100%',
  },
  heartWrap: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 6,
  },
  heart: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
  },
  conditionTag: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    zIndex: 2,
  },
  conditionTagGood: {
    backgroundColor: '#047857',
  },
  conditionTagFair: {
    backgroundColor: '#F59E0B',
  },
  conditionTagNew: {
    backgroundColor: '#3B82F6',
  },
  conditionTagLikeNew: {
    backgroundColor: '#8B5CF6',
  },
  conditionTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  featuredBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(37, 99, 235, 0.92)',
    zIndex: 2,
  },
  featuredBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(13, 110, 253, 0.9)',
  },
  distanceText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  body: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    overflow: 'hidden',
  },
  title: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 16,
  },
  priceRow: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  price: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '800',
    color: '#10B981',
    lineHeight: 20,
  },
  awayRow: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    maxWidth: '48%',
  },
  away: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  detailRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  conditionChip: {
    flexShrink: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  conditionChipText: {
    fontSize: 10,
    fontWeight: '800',
  },
  agoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  agoText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  metaRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    lineHeight: 14,
  },
  verifyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    maxWidth: '100%',
  },
  verifyChipPhone: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  verifyChipBusiness: {
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
  },
  verifyChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.success || colors.primary,
  },
  verifyChipTextBusiness: {
    color: colors.primary,
  },
});

const CONDITION_TONES = {
  New: 'success',
  'Like New': 'info',
  Good: 'primary',
  Fair: 'warning',
};

function shortAgo(dateValue) {
  const then = new Date(dateValue).getTime();
  if (!Number.isFinite(then)) return '';
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 60) return `${Math.round(days / 7)}w ago`;
  return `${Math.round(days / 30)}mo ago`;
}

function cityOnly(location) {
  const text = String(location || '').trim();
  if (!text) return 'Location';
  const city = text.split(',')[0].trim();
  return city || 'Location';
}

const ProductCard = memo(function ProductCard({
  id,
  title,
  price,
  location,
  icon = 'cube-outline',
  imageColor,
  photo,
  compact = false,
  width,
  saved: savedProp,
  onToggleSave,
  onPress,
  views,
  distanceLabel,
  sharedId,
  sellerType,
  shopId,
  sellerName,
  verificationKind,
  verificationLabel,
  isFeatured,
  condition,
  postedAt,
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { width: screenWidth } = useWindowDimensions();
  const { tryBeginNavigation } = useSharedTransition();
  const { isSaved, toggle } = useWishlist();
  const listingId = String(id || sharedId || '');
  const [savedLocal, setSavedLocal] = useState(false);
  const saved = listingId ? isSaved(listingId) : (savedProp ?? savedLocal);
  const bgColor = resolveColor(imageColor, colors) ?? colors.iconBackground;
  const cardWidth = width ?? (compact ? peekCardWidth(screenWidth) : undefined);
  const frameWidth = cardWidth || (compact ? peekCardWidth(screenWidth) : 0);
  const layout = compact && frameWidth ? compactCardLayout(frameWidth) : null;
  const imageHeight = layout?.imageHeight ?? 140;
  const iconSize = compact ? 28 : 42;

  // Micro-animations
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const heartScaleAnim = useRef(new Animated.Value(1)).current;

  const photoTag = Platform.OS === 'ios' && sharedId ? `item.${sharedId}.photo` : undefined;
  const titleTag = Platform.OS === 'ios' && sharedId ? `item.${sharedId}.title` : undefined;
  const priceTag = Platform.OS === 'ios' && sharedId ? `item.${sharedId}.price` : undefined;

  const handlePress = useCallback(() => {
    if (!onPress) return;
    tryBeginNavigation(sharedId, onPress);
  }, [onPress, sharedId, tryBeginNavigation]);

  const handleToggleSave = useCallback(() => {
    Animated.sequence([
      Animated.timing(heartScaleAnim, {
        toValue: 1.25,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(heartScaleAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();

    if (listingId) {
      toggle(listingId);
      return;
    }
    if (onToggleSave) {
      onToggleSave();
      return;
    }
    setSavedLocal((value) => !value);
  }, [listingId, toggle, onToggleSave, heartScaleAnim]);

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  }, [scaleAnim]);

  const conditionTone = colors[CONDITION_TONES[condition]] || colors.primary;

  return (
    <Animated.View
      style={[
        styles.cardWrapper,
        cardWidth ? { width: cardWidth } : null,
        layout ? { height: layout.height } : null,
        { transform: [{ scale: scaleAnim }] },
      ]}
    >
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        unstable_pressDelay={90}
        style={[styles.card, layout ? { flex: 1 } : null]}
      >
        <View style={[styles.image, { backgroundColor: bgColor, height: imageHeight }]}>
          {photo ? (
            <Image
              source={{ uri: photo }}
              style={styles.imageFill}
              resizeMode="cover"
              resizeMethod="resize"
              sharedTransitionTag={photoTag}
            />
          ) : (
            <Ionicons
              name={icon}
              size={iconSize}
              color={colors.link}
              sharedTransitionTag={photoTag}
            />
          )}

          {isFeatured ? (
            <View style={styles.featuredBadge}>
              <Ionicons name="sparkles" size={10} color="#fff" />
              <Text style={styles.featuredBadgeText}>Featured</Text>
            </View>
          ) : null}

          <Animated.View
            pointerEvents="box-none"
            style={[styles.heartWrap, { transform: [{ scale: heartScaleAnim }] }]}
          >
            <Pressable
              onPress={handleToggleSave}
              style={styles.heart}
              hitSlop={10}
            >
              <Ionicons
                name={saved ? 'heart' : 'heart-outline'}
                size={15}
                color={saved ? colors.favorite : colors.textMuted}
              />
            </Pressable>
          </Animated.View>
        </View>
        <View style={[styles.body, layout ? { height: layout.bodyHeight } : null]}>
          <Text numberOfLines={1} style={styles.title} sharedTransitionTag={titleTag}>
            {title}
          </Text>
          <View style={styles.priceRow}>
            <Text numberOfLines={1} style={styles.price} sharedTransitionTag={priceTag}>{price}</Text>
            {distanceLabel ? (
              <View style={styles.awayRow}>
                <Ionicons name="location-outline" size={12} color={colors.textMuted} />
                <Text style={styles.away} numberOfLines={1}>{distanceLabel}</Text>
              </View>
            ) : null}
          </View>

          {condition || postedAt ? (
            <View style={styles.detailRow}>
              {condition ? (
                <View style={[styles.conditionChip, { backgroundColor: `${conditionTone}22` }]}>
                  <Text style={[styles.conditionChipText, { color: conditionTone }]} numberOfLines={1}>
                    {condition}
                  </Text>
                </View>
              ) : <View />}
              {postedAt ? (
                <View style={styles.agoRow}>
                  <Ionicons name="time-outline" size={12} color={colors.textMuted} />
                  <Text style={styles.agoText} numberOfLines={1}>{shortAgo(postedAt)}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {location ? (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={13} color={colors.textMuted} />
              <Text style={styles.metaText} numberOfLines={1}>{cityOnly(location)}</Text>
            </View>
          ) : null}

          {sellerName ? (
            <View style={styles.metaRow}>
              <Ionicons
                name={sellerType === 'shop' ? 'storefront-outline' : 'person-outline'}
                size={13}
                color={colors.textMuted}
              />
              <Text style={styles.metaText} numberOfLines={1}>{sellerName}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </View>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
});

export default ProductCard;
