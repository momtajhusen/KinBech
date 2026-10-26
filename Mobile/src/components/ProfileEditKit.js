import { Children } from 'react';
import Icon from './Icon';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTheme, useThemedStyles, FORM_ERROR_COLOR } from '../theme';

export function EditSection({ icon, title, subtitle, tint, children, right }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const color = tint || colors.primary;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={[styles.sectionIcon, { backgroundColor: `${color}1A` }]}>
          <Icon name={icon} size={15} color={color} />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function EditField({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  multiline,
  maxLength,
  keyboardType,
  autoCapitalize = 'sentences',
  right,
  hint,
  error,
  editable = true,
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View>
      {label ? (
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          {maxLength && multiline ? (
            <Text style={styles.counter}>
              {String(value || '').length}/{maxLength}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View
        style={[
          styles.inputRow,
          multiline && styles.inputRowMultiline,
          !editable && styles.inputRowLocked,
          error && styles.inputRowError,
        ]}
      >
        {icon ? (
          <Icon
            name={icon}
            size={16}
            color={colors.textMuted}
            style={multiline ? styles.iconTop : null}
          />
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          multiline={multiline}
          maxLength={maxLength}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          editable={editable}
          style={[styles.input, multiline && styles.inputMultiline, !editable && styles.inputLocked]}
        />
        {right}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function ChipSelect({ options, selected, onToggle, icons }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.chips}>
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <Pressable
            key={option}
            onPress={() => onToggle(option)}
            style={[styles.chip, active && styles.chipActive]}
          >
            {active ? (
              <Icon name="checkmark" size={12} color={colors.onPrimary} />
            ) : icons?.[option] ? (
              <Icon name={icons[option]} size={12} color={colors.textSecondary} />
            ) : null}
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function FieldRow({ children }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.fieldRow}>
      {Children.toArray(children).map((child, i) => (
        <View key={i} style={styles.flex1}>
          {child}
        </View>
      ))}
    </View>
  );
}

const createStyles = (colors) => ({
  flex1: {
    flex: 1,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  sectionSub: {
    marginTop: 1,
    fontSize: 11.5,
    color: colors.textMuted,
  },
  sectionBody: {
    padding: 14,
    gap: 12,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  counter: {
    fontSize: 11,
    color: colors.textTertiary,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  inputRowMultiline: {
    alignItems: 'flex-start',
    paddingVertical: 10,
  },
  inputRowLocked: {
    backgroundColor: colors.iconBackground,
  },
  inputRowError: {
    borderColor: FORM_ERROR_COLOR,
  },
  iconTop: {
    marginTop: 1,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    paddingVertical: 0,
  },
  inputMultiline: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  inputLocked: {
    color: colors.textSecondary,
  },
  hint: {
    marginTop: 4,
    fontSize: 11,
    color: colors.textMuted,
  },
  error: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: FORM_ERROR_COLOR,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.onPrimary,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 10,
  },
});
