import { memo, useCallback } from 'react';
import { ScrollView, useWindowDimensions } from 'react-native';
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
        paddingRight: CARD_ROW_PADDING,
        gap: CARD_GAP,
      }}
      overScrollMode="never"
    >
      {safeItems.map((item, index) => (
        <CarouselCard
          key={item.id || `${item.title}-${index}`}
          item={item}
          width={cardWidth}
          onPressItem={onPressItem}
        />
      ))}
    </ScrollView>
  );
}

export default memo(ProductCardCarousel);
