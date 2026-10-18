import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTheme, useThemedStyles } from '../theme';

const createStyles = (colors) => ({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  placeholder: {
    flex: 1,
    fontSize: 15,
    color: colors.textSecondary,
  },
  filterBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${colors.primary}1A`,
  },
});

/**
 * Pass `onPress` to render a tappable bar that opens the search screen
 * instead of an editable input.
 */
export default function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search for things you love...',
  onSubmitEditing,
  onFilterPress,
  onPress,
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const filterButton = onFilterPress ? (
    <Pressable onPress={onFilterPress} hitSlop={8} style={styles.filterBtn}>
      <Ionicons name="options-outline" size={18} color={colors.primary} />
    </Pressable>
  ) : null;

  if (onPress) {
    return (
      <Pressable
        style={styles.container}
        onPress={onPress}
        accessibilityRole="search"
        accessibilityLabel={placeholder}
      >
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <Text style={styles.placeholder} numberOfLines={1}>{placeholder}</Text>
        {filterButton}
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <Ionicons name="search" size={20} color={colors.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        onSubmitEditing={onSubmitEditing}
        returnKeyType="search"
        style={styles.input}
      />
      {filterButton}
    </View>
  );
}
