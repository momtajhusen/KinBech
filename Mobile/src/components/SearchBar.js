import Icon from './Icon';
import { forwardRef } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useTheme, useThemedStyles } from '../theme';
import VoiceSearchButton from './VoiceSearchButton';

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
  containerFocused: {
    borderColor: colors.primary,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    paddingVertical: 0,
  },
  placeholder: {
    flex: 1,
    fontSize: 14,
    color: colors.textMuted,
  },
  pressFill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  spinnerBox: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
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
const SearchBar = forwardRef(function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search for things you love...',
  onSubmitEditing,
  onFilterPress,
  onPress,
  onVoiceResult,
  onClear,
  onFocus,
  onBlur,
  loading = false,
  focused = false,
}, ref) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const voiceButton = onVoiceResult ? (
    <VoiceSearchButton color={colors.textMuted} onResult={onVoiceResult} />
  ) : null;

  const filterButton = onFilterPress ? (
    <Pressable onPress={onFilterPress} hitSlop={8} style={styles.filterBtn}>
      <Icon name="options-outline" size={18} color={colors.textMuted} />
    </Pressable>
  ) : null;

  if (onPress) {
    return (
      <View style={styles.container}>
        <Pressable
          style={styles.pressFill}
          onPress={onPress}
          accessibilityRole="search"
          accessibilityLabel={placeholder}
        >
          <Icon name="search-outline" size={18} color={colors.textMuted} />
          <Text style={styles.placeholder} numberOfLines={1}>{placeholder}</Text>
        </Pressable>
        {voiceButton}
        {filterButton}
      </View>
    );
  }

  const hasText = Boolean(value && value.length);

  return (
    <View style={[styles.container, focused && styles.containerFocused]} collapsable={false}>
      <Icon name="search-outline" size={18} color={focused ? colors.primary : colors.textMuted} />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        onSubmitEditing={onSubmitEditing}
        returnKeyType="search"
        autoCorrect={false}
        spellCheck={false}
        blurOnSubmit={false}
        style={styles.input}
      />
      {hasText ? (
        <View style={styles.spinnerBox} pointerEvents="none">
          <ActivityIndicator size="small" color={colors.primary} animating={loading} style={{ opacity: loading ? 1 : 0 }} />
        </View>
      ) : null}
      {hasText && onClear ? (
        <Pressable onPress={onClear} hitSlop={8}>
          <Icon name="close-circle" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}
      {voiceButton}
      {filterButton}
    </View>
  );
});

export default SearchBar;
