import { useState, memo, useCallback, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, ScrollView, Text, View, Animated, Dimensions } from 'react-native';
import { useTheme, useThemedStyles } from '../theme';
import { resolveMediaUrl } from '../utils/listing';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(200, SCREEN_WIDTH / 2.0); // Better width for content

const createStyles = (colors) => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    width: CARD_WIDTH,
  },
  coverImage: {
    width: '100%',
    height: 80,
    backgroundColor: colors.iconBackground,
  },
  coverImageContent: {
    width: '100%',
    height: '100%',
  },
  avatarContainer: {
    position: 'absolute',
    top: 55,
    left: 12,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.surface,
    overflow: 'hidden',
    shadowColor: colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconBackground,
  },
  content: {
    paddingTop: 35,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  sellerInfo: {
    flex: 1,
    marginLeft: 8,
  },
  sellerName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: colors.pastelGreen,
  },
  verifiedText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  pinButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.iconBackground,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    maxWidth: '100%',
  },
  metaChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 12,
  },
  locationText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    flex: 1,
  },
  viewStoreButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  viewStoreText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  gallerySection: {
    marginTop: 4,
  },
  galleryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 8,
  },
  gallery: {
    flexDirection: 'row',
    gap: 6,
  },
  galleryItem: {
    width: 70,
    height: 70,
    borderRadius: 10,
    backgroundColor: colors.iconBackground,
    overflow: 'hidden',
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
  moreOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  moreText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  compactCard: {
    width: SCREEN_WIDTH / 3.5,
    backgroundColor: colors.surface,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
  },
  compactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  compactName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  compactStats: {
    marginTop: 2,
    gap: 5,
  },
  compactStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactStatIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactStatText: {
    flex: 1,
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  compactPinButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Individual Seller Design
  individualCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    width: CARD_WIDTH,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  individualHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  individualAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 2,
    borderColor: colors.border,
  },
  individualInfo: {
    flex: 1,
  },
  individualName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  individualVerified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  individualVerifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.pastelGreen,
  },
  individualVerifiedText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.primary,
  },
  individualStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  individualStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.iconBackground,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
  },
  individualStatValue: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
  },
  individualLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 12,
  },
  individualLocationText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    flex: 1,
  },
  individualButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  individualButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.onPrimary,
  },
});

const SellerProfileCard = memo(function SellerProfileCard({
  seller,
  avatar,
  coverImage,
  sellerName,
  storeName,
  verified = false,
  rating,
  reviewCount,
  distance,
  listingCount,
  location,
  isPinned = false,
  isFollowing = false,
  productGallery = [],
  compact = false,
  sellerType,
  onPress,
  onPinToggle,
  onFollowToggle,
  onProductPress,
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [pinnedLocal, setPinnedLocal] = useState(isPinned);
  const pinned = pinnedLocal;
  
  // Micro-animations
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pinScaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    if (onPress) onPress();
  }, [onPress]);

  const handlePinToggle = useCallback(() => {
    Animated.sequence([
      Animated.timing(pinScaleAnim, {
        toValue: 1.3,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(pinScaleAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();

    setPinnedLocal((prev) => !prev);
    if (onPinToggle) onPinToggle(!pinned);
  }, [onPinToggle, pinned, pinScaleAnim]);

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

  const resolvedType =
    sellerType || seller?.sellerType || (seller?.shopId && seller?.sellerType !== 'individual' ? 'shop' : 'individual');
  const isShop = resolvedType === 'shop';
  const displayName = storeName || sellerName || seller?.name || (isShop ? 'Store' : 'Seller');
  const rawRating = rating ?? seller?.ratingAverage ?? seller?.rating;
  const displayRating =
    rawRating != null && rawRating !== ''
      ? typeof rawRating === 'number'
        ? rawRating.toFixed(1)
        : String(rawRating)
      : '0.0';
  const displayReviews = reviewCount ?? seller?.reviewsCount ?? seller?.reviewCount ?? 0;
  const displayListings = listingCount || seller?.listingCount || 0;
  const displayDistance = distance || seller?.distance;
  const displayLocation = location || seller?.location || 'Unknown location';
  const displayAvatar = resolveMediaUrl(avatar || seller?.avatarUrl || '');
  const displayCover = resolveMediaUrl(coverImage || seller?.coverImage || '');

  const distanceLabel = displayDistance 
    ? (displayDistance < 1 ? `${Math.round(displayDistance * 1000)} m` : `${displayDistance.toFixed(1)} km`)
    : null;

  const galleryItems = (productGallery || [])
    .map((item) => resolveMediaUrl(item))
    .filter(Boolean)
    .slice(0, 4);
  const remainingCount = Math.max(0, (productGallery?.length || 0) - 4);

  if (compact) {
    return (
      <Animated.View style={[styles.compactCard, { transform: [{ scale: scaleAnim }] }]}>
        <Pressable
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={{ flex: 1 }}
        >
          <Animated.View style={{ transform: [{ scale: pinScaleAnim }] }}>
            <Pressable
              onPress={handlePinToggle}
              hitSlop={8}
              style={styles.compactPinButton}
            >
              <Ionicons
                name={pinned ? 'bookmark' : 'bookmark-outline'}
                size={14}
                color={pinned ? colors.primary : colors.textMuted}
              />
            </Pressable>
          </Animated.View>

          <View style={styles.compactAvatar}>
            {displayAvatar ? (
              <Image source={{ uri: displayAvatar }} style={styles.avatarImage} />
            ) : (
              <Ionicons name={isShop ? 'storefront-outline' : 'person-outline'} size={24} color={colors.textMuted} />
            )}
          </View>

          <Text style={styles.compactName} numberOfLines={1}>{displayName}</Text>

          <View style={styles.compactStats}>
            {isShop ? (
              <View style={styles.compactStat}>
                <View style={styles.compactStatIcon}>
                  <Ionicons name="star" size={9} color={colors.warning} />
                </View>
                <Text style={styles.compactStatText}>{displayRating}</Text>
              </View>
            ) : (
              <View style={styles.compactStat}>
                <View style={styles.compactStatIcon}>
                  <Ionicons name="cube-outline" size={9} color={colors.textSecondary} />
                </View>
                <Text style={styles.compactStatText}>{displayListings} items</Text>
              </View>
            )}
            {distanceLabel ? (
              <View style={styles.compactStat}>
                <View style={styles.compactStatIcon}>
                  <Ionicons name="location-outline" size={9} color={colors.textSecondary} />
                </View>
                <Text style={styles.compactStatText} numberOfLines={1}>{distanceLabel}</Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  // Individual Seller Design (simpler, no banner, no ratings)
  if (!isShop) {
    return (
      <Animated.View style={[styles.individualCard, { transform: [{ scale: scaleAnim }] }]}>
        <Pressable
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          <View style={styles.individualHeader}>
            <View style={styles.individualAvatar}>
              {displayAvatar ? (
                <Image source={{ uri: displayAvatar }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person-outline" size={28} color={colors.textMuted} />
              )}
            </View>
            <View style={styles.individualInfo}>
              <Text style={styles.individualName} numberOfLines={1}>{displayName}</Text>
              {verified && (
                <View style={styles.individualVerified}>
                  <View style={styles.individualVerifiedBadge}>
                    <Ionicons name="checkmark-circle" size={8} color={colors.primary} />
                    <Text style={styles.individualVerifiedText}>Phone Verified</Text>
                  </View>
                </View>
              )}
            </View>
            <Animated.View style={{ transform: [{ scale: pinScaleAnim }] }}>
              <Pressable
                onPress={handlePinToggle}
                hitSlop={8}
                style={styles.pinButton}
              >
                <Ionicons
                  name={pinned ? 'bookmark' : 'bookmark-outline'}
                  size={16}
                  color={pinned ? colors.primary : colors.textMuted}
                />
              </Pressable>
            </Animated.View>
          </View>

          <View style={styles.individualStats}>
            <View style={styles.individualStat}>
              <Ionicons name="cube-outline" size={12} color={colors.textSecondary} />
              <Text style={styles.individualStatValue}>{displayListings} items</Text>
            </View>
            {distanceLabel ? (
              <View style={styles.individualStat}>
                <Ionicons name="navigate-outline" size={12} color={colors.textSecondary} />
                <Text style={styles.individualStatValue}>{distanceLabel}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.individualLocation}>
            <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.individualLocationText} numberOfLines={1}>{displayLocation}</Text>
          </View>

          <Pressable style={styles.individualButton} onPress={handlePress}>
            <Text style={styles.individualButtonText}>View Profile</Text>
          </Pressable>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {displayCover ? (
          <Image source={{ uri: displayCover }} style={styles.coverImageContent} resizeMode="cover" />
        ) : (
          <View style={styles.coverImage} />
        )}

        <View style={styles.avatarContainer}>
          {displayAvatar ? (
            <Image source={{ uri: displayAvatar }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="storefront-outline" size={32} color={colors.textMuted} />
            </View>
          )}
        </View>

        <View style={styles.content}>
          <View style={styles.headerRow}>
            <View style={styles.sellerInfo}>
              <Text style={styles.sellerName} numberOfLines={1}>{displayName}</Text>
              {verified && (
                <View style={styles.verifiedRow}>
                  <View style={styles.verifiedBadge}>
                    <Ionicons name="checkmark-circle" size={10} color={colors.primary} />
                    <Text style={styles.verifiedText}>Business Verified</Text>
                  </View>
                </View>
              )}
            </View>
            <View style={styles.actionButtons}>
              <Animated.View style={{ transform: [{ scale: pinScaleAnim }] }}>
                <Pressable
                  onPress={handlePinToggle}
                  hitSlop={8}
                  style={styles.pinButton}
                >
                  <Ionicons
                    name={pinned ? 'bookmark' : 'bookmark-outline'}
                    size={16}
                    color={pinned ? colors.primary : colors.textMuted}
                  />
                </Pressable>
              </Animated.View>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.metaChip}>
              <Ionicons name="star" size={12} color={colors.warning} />
              <Text style={styles.metaChipText}>{displayRating} ({displayReviews})</Text>
            </View>
            <View style={styles.metaChip}>
              <Ionicons name="cube-outline" size={12} color={colors.textSecondary} />
              <Text style={styles.metaChipText}>{displayListings} items</Text>
            </View>
            {distanceLabel ? (
              <View style={styles.metaChip}>
                <Ionicons name="navigate-outline" size={12} color={colors.textSecondary} />
                <Text style={styles.metaChipText}>{distanceLabel}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.locationText} numberOfLines={1}>{displayLocation}</Text>
          </View>

          <Pressable style={styles.viewStoreButton} onPress={handlePress}>
            <Text style={styles.viewStoreText}>View Store</Text>
          </Pressable>

          {galleryItems.length > 0 && (
            <View style={styles.gallerySection}>
              <Text style={styles.galleryLabel}>Product Gallery</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gallery}>
                {galleryItems.map((item, index) => (
                  <Pressable
                    key={index}
                    style={styles.galleryItem}
                    onPress={() => onProductPress?.(item, index)}
                  >
                    {item ? (
                      <Image source={{ uri: item }} style={styles.galleryImage} resizeMode="cover" />
                    ) : (
                      <View style={styles.galleryItem} />
                    )}
                    {index === 3 && remainingCount > 0 && (
                      <View style={styles.moreOverlay}>
                        <Text style={styles.moreText}>+{remainingCount}</Text>
                      </View>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
});

export default SellerProfileCard;