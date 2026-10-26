import { memo, useCallback } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import ProductCard, {
  CARD_GAP,
  CARD_ROW_PADDING,
  peekCardWidth,
} from './ProductCard';

const CarouselCard = memo(function CarouselCard({ item, width, onPressItem }) {
  const handlePress = useCallback(() => onPressItem?.(item), [item, onPressItem]);
  return (
    <ProductCard
      compact
      {...item}
      width={width}
      sharedId={item.id}
      onPress={handlePress}
      onToggleSave={item.onToggleSave}
    />
  );
});

function ProductCardCarousel({ items, onPressItem, contentWidth }) {
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = peekCardWidth(contentWidth || screenWidth);
  const safeItems = items || [];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingLeft: CARD_ROW_PADDING,
        paddingRight: CARD_ROW_PADDING - CARD_GAP,
      }}
      overScrollMode="never"
    >
      {safeItems.map((item, index) => (
        <View
          key={item.id || `${item.title}-${index}`}
          collapsable={false}
          style={{ width: cardWidth, marginRight: CARD_GAP, flexShrink: 0 }}
        >
          <CarouselCard
            item={item}
            width={cardWidth}
            onPressItem={onPressItem}
          />
        </View>
      ))}
    </ScrollView>
  );
}

export default memo(ProductCardCarousel);
