import { useEffect, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { FadeIn, withSpring, withTiming } from 'react-native-reanimated';
import Icon from './Icon';
import { PressableScale, Reanimated } from './Motion';
import { callHaptic } from '../services/callHaptics';
import { missingDetails } from '../utils/listingDetails';
import { useTheme, useThemedStyles } from '../theme';

function cardIn() {
  'worklet';
  const spring = { damping: 16, stiffness: 170, mass: 0.8 };
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 60 }, { scale: 0.92 }] },
    animations: {
      opacity: withTiming(1, { duration: 200 }),
      transform: [{ translateY: withSpring(0, spring) }, { scale: withSpring(1, spring) }],
    },
  };
}

function Field({ field, value, onChange }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  if (field.options) {
    const options = value && !field.options.includes(value) ? [...field.options, value] : field.options;
    return (
      <View style={styles.chips}>
        {options.map((option) => {
          const on = option === value;
          return (
            <Pressable
              key={option}
              onPress={() => onChange(on ? '' : option)}
              style={[styles.chip, on && styles.chipOn]}
              hitSlop={4}
            >
              {on ? <Icon name="checkmark" size={13} color={colors.onPrimary} /> : null}
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{option}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }
  return (
    <View style={styles.inputWrap}>
      <TextInput
        value={value}
        onChangeText={(text) => onChange(field.numeric ? text.replace(/[^\d.]/g, '') : text)}
        placeholder={field.placeholder || ''}
        placeholderTextColor={colors.textMuted}
        keyboardType={field.numeric ? 'decimal-pad' : 'default'}
        maxLength={40}
        style={styles.input}
      />
      {field.unit ? <Text style={styles.unit}>{field.unit}</Text> : null}
    </View>
  );
}

function DetailsContent({ details, values, onChange, onSave, onSkip, voiceBar }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { height } = useWindowDimensions();
  const [keyboard, setKeyboard] = useState(0);
  const filled = details.fields.length - missingDetails(details, values);

  useEffect(() => {
    callHaptic('toggleOn');
    if (Platform.OS !== 'android') return undefined;
    const show = Keyboard.addListener('keyboardDidShow', (event) => setKeyboard(event.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const set = (key) => (value) => onChange(key, value);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Reanimated.View entering={FadeIn.duration(200)} style={[styles.backdrop, { paddingBottom: 18 + keyboard }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onSkip} />
        <Reanimated.View entering={cardIn} style={[styles.card, { maxHeight: (height - keyboard) * 0.86 }]}>
          <View style={styles.head}>
            <View style={styles.badge}>
              <Icon name="sparkles" size={18} color={colors.onPrimary} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.title}>{details.label} details</Text>
              <Text style={styles.subtitle}>Buyers usually ask these first. Add what you know, skip the rest.</Text>
            </View>
            <Pressable style={styles.close} onPress={onSkip} hitSlop={10}>
              <Icon name="close" size={16} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            {details.fields.map((field) => (
              <View key={field.key} style={styles.field}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>{field.label}</Text>
                  <Text style={styles.optional}>Optional</Text>
                </View>
                <Field field={field} value={values[field.key] || ''} onChange={set(field.key)} />
              </View>
            ))}
          </ScrollView>

          {voiceBar ? <View style={styles.voice}>{voiceBar}</View> : null}

          <View style={styles.actions}>
            <PressableScale style={styles.actionFlex} contentStyle={styles.secondary} onPress={onSkip}>
              <Text style={styles.secondaryText}>Skip</Text>
            </PressableScale>
            <PressableScale
              style={styles.actionWide}
              contentStyle={[styles.primary, !filled && styles.primaryOff]}
              onPress={() => (filled ? onSave(values) : onSkip())}
            >
              <Icon name="checkmark" size={17} color={colors.onPrimary} />
              <Text style={styles.primaryText}>{filled ? `Add ${filled} detail${filled === 1 ? '' : 's'}` : 'Add details'}</Text>
            </PressableScale>
          </View>
        </Reanimated.View>
      </Reanimated.View>
    </KeyboardAvoidingView>
  );
}

/**
 * Item-specific details (RAM and storage for a phone, kilometres for a bike) asked after AI fills
 * the form. Every field is optional. `values` is `{ [field.key]: value }`, changed with `onChange(key, value)`
 * (the voice helper fills them too); `voiceBar` shows above the buttons.
 */
export default function ListingDetailsModal({ visible, details, values, onChange, onSave, onSkip, voiceBar }) {
  const open = !!visible && !!details?.fields?.length;
  return (
    <Modal visible={open} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onSkip}>
      {open ? (
        <DetailsContent
          details={details}
          values={values || {}}
          onChange={onChange}
          onSave={onSave}
          onSkip={onSkip}
          voiceBar={voiceBar}
        />
      ) : null}
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    flex: {
      flex: 1,
    },
    backdrop: {
      flex: 1,
      justifyContent: 'center',
      padding: 18,
      backgroundColor: 'rgba(2,6,23,0.72)',
    },
    card: {
      width: '100%',
      maxWidth: 400,
      alignSelf: 'center',
      borderRadius: 26,
      overflow: 'hidden',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      elevation: 16,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    badge: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    title: {
      fontSize: 17,
      fontWeight: '900',
      color: colors.text,
      letterSpacing: -0.2,
    },
    subtitle: {
      marginTop: 2,
      fontSize: 12,
      lineHeight: 16,
      color: colors.textMuted,
    },
    close: {
      alignSelf: 'flex-start',
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    scroll: {
      flexGrow: 0,
    },
    body: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 4,
      gap: 14,
    },
    field: {
      gap: 7,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    label: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.text,
    },
    optional: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textMuted,
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
      paddingHorizontal: 12,
      height: 34,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    chipOn: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    chipText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.text,
    },
    chipTextOn: {
      color: colors.onPrimary,
    },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 46,
      paddingHorizontal: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    input: {
      flex: 1,
      height: '100%',
      paddingVertical: 0,
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    unit: {
      marginLeft: 8,
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
    },
    voice: {
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
      padding: 16,
      paddingTop: 12,
    },
    actionFlex: {
      flex: 1,
    },
    actionWide: {
      flex: 1.6,
    },
    secondary: {
      height: 50,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    secondaryText: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.text,
    },
    primary: {
      height: 50,
      borderRadius: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      backgroundColor: colors.primary,
    },
    primaryOff: {
      opacity: 0.55,
    },
    primaryText: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.onPrimary,
    },
  });
