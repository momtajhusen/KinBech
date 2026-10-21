import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTheme, useThemedStyles } from '../theme';

const createStyles = (colors) => ({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    paddingHorizontal: 16,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  placeholder: {
    flex: 1,
    fontSize: 14,
    color: colors.textMuted,
  },
  filterBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
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
      <Ionicons name="options-outline" size={18} color={colors.textMuted} />
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
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <Text style={styles.placeholder} numberOfLines={1}>{placeholder}</Text>
        {filterButton}
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <Ionicons name="search-outline" size={18} color={colors.textMuted} />
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
