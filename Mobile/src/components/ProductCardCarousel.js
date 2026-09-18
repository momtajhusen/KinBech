import { ScrollView, useWindowDimensions } from 'react-native';
import ProductCard, {
  CARD_GAP,
  CARD_ROW_PADDING,
  peekCardWidth,
} from './ProductCard';

export default function ProductCardCarousel({ items, onPressItem, contentWidth }) {
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
      decelerationRate="fast"
      snapToInterval={cardWidth + CARD_GAP}
      snapToAlignment="start"
      disableIntervalMomentum
    >
      {safeItems.map((item, index) => (
        <ProductCard
          key={item.id || `${item.title}-${index}`}
          compact
          {...item}
          width={cardWidth}
          sharedId={item.id}
          onPress={() => onPressItem?.(item)}
          onToggleSave={item.onToggleSave}
        />
      ))}
    </ScrollView>
  );
}
