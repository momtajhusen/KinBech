import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View, Animated, Image } from 'react-native';
import { useRef } from 'react';
import { useTheme, useThemedStyles } from '../theme';

const createStyles = (colors) => ({
  wrap: {
    width: 64,
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: 56,
    height: 56,
  },
  emoji: {
    fontSize: 22,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
});

export default function CategoryIcon({
  label,
  emoji = '📦',
  icon,
  imageUrl,
  color,
  onPress,
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const iconBackground = color ?? colors.primary ?? '#5B39C6';
  const onPrimaryColor = colors.onPrimary ?? colors.white ?? '#FFFFFF';
  
  // Micro-animations
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.9,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable 
        onPress={onPress} 
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.wrap}
      >
        <View style={[styles.icon, { backgroundColor: iconBackground }]}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.image} />
          ) : icon ? (
            <Ionicons name={icon} size={22} color={onPrimaryColor} />
          ) : (
            <Text style={styles.emoji}>{emoji}</Text>
          )}
        </View>
        <Text numberOfLines={1} style={styles.label}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
