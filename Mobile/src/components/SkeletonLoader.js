import { Animated, View, Dimensions, useWindowDimensions } from 'react-native';
import { useRef, useEffect } from 'react';
import { useTheme } from '../theme';
import { compactCardLayout, peekCardWidth, CARD_GAP, CARD_ROW_PADDING } from './ProductCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function Skeleton({
  style,
  width,
  height,
  borderRadius,
  margin,
  marginHorizontal,
  marginVertical,
  marginTop,
  marginBottom,
  marginLeft,
  marginRight,
  marginStart,
  marginEnd,
}) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          backgroundColor: colors.iconBackground,
          borderRadius: borderRadius ?? 8,
          width,
          height,
          opacity,
          margin,
          marginHorizontal,
          marginVertical,
          marginTop,
          marginBottom,
          marginLeft,
          marginRight,
          marginStart,
          marginEnd,
        },
        style,
      ]}
    />
  );
}

export function ProductCardSkeleton({ width, compact = true }) {
  const { colors } = useTheme();
  const layout = compact && width ? compactCardLayout(width) : null;
  const imageHeight = layout?.imageHeight ?? 140;

  return (
    <View
      style={{
        width,
        backgroundColor: colors.surface,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View>
        <Skeleton width={width} height={imageHeight} borderRadius={0} />
        <View style={{ position: 'absolute', top: 8, right: 8 }}>
          <Skeleton width={32} height={32} borderRadius={16} />
        </View>
      </View>
      <View style={{ padding: 10, gap: 4 }}>
        <Skeleton width={width * 0.85} height={14} borderRadius={4} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <Skeleton width={width * 0.42} height={15} borderRadius={4} />
          <Skeleton width={width * 0.32} height={11} borderRadius={4} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <Skeleton width={40} height={16} borderRadius={8} />
          <Skeleton width={width * 0.28} height={10} borderRadius={4} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <Skeleton width={12} height={12} borderRadius={6} />
          <Skeleton width={width * 0.5} height={12} borderRadius={4} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <Skeleton width={12} height={12} borderRadius={6} />
          <Skeleton width={width * 0.4} height={12} borderRadius={4} />
        </View>
      </View>
    </View>
  );
}

/** A section title and one row of cards, sized like ProductCardCarousel. */
export function ProductCarouselSkeleton({ count = 3 }) {
  const { width } = useWindowDimensions();
  const cardWidth = peekCardWidth(width);
  return (
    <View style={{ marginTop: 18 }}>
      <View style={{ paddingHorizontal: CARD_ROW_PADDING, marginBottom: 10 }}>
        <Skeleton width={150} height={16} borderRadius={6} />
      </View>
      <View style={{ flexDirection: 'row', paddingLeft: CARD_ROW_PADDING, gap: CARD_GAP, overflow: 'hidden' }}>
        {Array.from({ length: count }, (_, i) => <ProductCardSkeleton key={i} width={cardWidth} />)}
      </View>
    </View>
  );
}

export function CategorySkeleton() {
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Skeleton width={48} height={48} borderRadius={12} />
      <Skeleton width={40} height={10} borderRadius={4} />
    </View>
  );
}

export function ChatItemSkeleton() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12 }}>
      <Skeleton width={44} height={44} borderRadius={22} />
      <View style={{ flex: 1, gap: 4 }}>
        <Skeleton width={120} height={14} borderRadius={4} />
        <Skeleton width={180} height={12} borderRadius={4} />
      </View>
    </View>
  );
}

export function BannerSkeleton() {
  return (
    <View style={{ borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, gap: 4 }}>
        <Skeleton width={120} height={16} borderRadius={4} />
        <Skeleton width={160} height={12} borderRadius={4} />
      </View>
      <Skeleton width={80} height={36} borderRadius={12} />
    </View>
  );
}

export function SellerProfileCardSkeleton({ width = 200 }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width,
        height: 190,
        backgroundColor: colors.surface,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
        padding: 11,
        justifyContent: 'space-between',
      }}
    >
      <View style={{ position: 'absolute', top: 8, right: 8, alignItems: 'flex-end', gap: 8 }}>
        <Skeleton width={60} height={14} borderRadius={8} />
        <Skeleton width={24} height={24} borderRadius={12} />
      </View>
      <View>
        <View style={{ gap: 6 }}>
          <Skeleton width={46} height={46} borderRadius={14} />
        </View>
        <Skeleton width="85%" height={13} borderRadius={4} style={{ marginTop: 8 }} />
        <Skeleton width="60%" height={11} borderRadius={4} style={{ marginTop: 6 }} />
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 6 }} />
        <Skeleton width="70%" height={11} borderRadius={4} />
        <Skeleton width="45%" height={11} borderRadius={4} style={{ marginTop: 4 }} />
      </View>
      <Skeleton width="100%" height={30} borderRadius={9} />
    </View>
  );
}

export function CompactSellerCardSkeleton({ width = SCREEN_WIDTH / 3.5 }) {
  return (
    <View style={{ width, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: '#e5e7eb' }}>
      <Skeleton width={40} height={40} borderRadius={20} marginBottom={6} />
      <Skeleton width={width * 0.8} height={12} borderRadius={4} marginBottom={4} />
      <View style={{ flexDirection: 'column', gap: 2 }}>
        <Skeleton width={40} height={10} borderRadius={4} />
        <Skeleton width={35} height={10} borderRadius={4} />
      </View>
    </View>
  );
}