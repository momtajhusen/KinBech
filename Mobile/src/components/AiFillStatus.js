import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Icon from './Icon';
import { useTheme, useThemedStyles } from '../theme';

/** Sparkle button that asks AI to fill the form from the cover photo. */
export function AiFillButton({ filling, onPress }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      style={styles.button}
      onPress={onPress}
      disabled={filling}
      hitSlop={8}
      accessibilityLabel="Auto-fill details with AI"
    >
      {filling ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Icon name="sparkles" size={14} color={colors.primary} />
      )}
    </Pressable>
  );
}

/** Progress line while AI works, or a short notice when it cannot help. */
export function AiFillNotice({ filling, error }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  if (filling) return <Text style={styles.hint}>AI is reading the photo and filling details…</Text>;
  if (!error) return null;
  return (
    <View style={styles.noticeRow}>
      <Icon name="information-circle" size={14} color={colors.warning || '#F59E0B'} />
      <Text style={styles.noticeText}>{error}</Text>
    </View>
  );
}

const createStyles = (colors) => ({
  button: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconBackground,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  hint: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 8,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
});
