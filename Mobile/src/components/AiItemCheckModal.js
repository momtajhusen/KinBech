import { useEffect } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { FadeIn, withSpring, withTiming } from 'react-native-reanimated';
import Icon from './Icon';
import { PressableScale, Reanimated } from './Motion';
import { callHaptic } from '../services/callHaptics';
import { formatNpr } from '../utils/currency';
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

const REASONS = {
  blurry: { icon: 'aperture-outline', text: 'The photo looks blurry.' },
  too_dark: { icon: 'moon-outline', text: 'The photo is too dark to see clearly.' },
  unclear: { icon: 'help-circle-outline', text: 'It is hard to tell which item is for sale.' },
  blank: { icon: 'square-outline', text: 'The photo looks empty.' },
};
const LOW_CONFIDENCE = { icon: 'help-circle-outline', text: 'This could be a few different things.' };

function CheckContent({ photo, suggestion, onChoose, voiceBar }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { height } = useWindowDimensions();
  const reason = REASONS[suggestion.photoIssue] || LOW_CONFIDENCE;
  const guess = suggestion.title ? suggestion : null;
  const alternatives = Array.isArray(suggestion.alternatives) ? suggestion.alternatives : [];
  const confidence = Number.isFinite(suggestion.confidence) ? suggestion.confidence : null;
  const price = Number(suggestion.price) || 0;
  const unsure = () => onChoose('unsure');

  useEffect(() => {
    callHaptic('toggleOn');
  }, []);

  return (
    <Reanimated.View entering={FadeIn.duration(200)} style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={unsure} />
      <Reanimated.View entering={cardIn} style={[styles.card, { maxHeight: height * 0.88 }]}>
        <View style={styles.head}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbEmpty]}>
              <Icon name="image-outline" size={20} color={colors.textMuted} />
            </View>
          )}
          <View style={styles.flex}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Is this right?</Text>
              {confidence != null ? (
                <View style={styles.confidence}>
                  <Icon name="sparkles" size={11} color={colors.warning} />
                  <Text style={styles.confidenceText}>{confidence}% sure</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.reasonRow}>
              <Icon name={reason.icon} size={13} color={colors.textMuted} />
              <Text style={styles.reason} numberOfLines={2}>
                {suggestion.photoIssueNote || reason.text}
              </Text>
            </View>
          </View>
          <Pressable style={styles.close} onPress={unsure} hitSlop={10}>
            <Icon name="close" size={16} color={colors.textMuted} />
          </Pressable>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.body} bounces={false}>
          {guess ? (
            <>
              <Text style={styles.label}>AI thinks this is</Text>
              <PressableScale scaleTo={0.98} contentStyle={[styles.option, styles.optionMain]} onPress={() => onChoose('main')}>
                <View style={[styles.optionIcon, styles.optionIconMain]}>
                  <Icon name="sparkles" size={15} color={colors.onPrimary} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.optionTitle} numberOfLines={2}>{guess.title}</Text>
                  <Text style={styles.optionSub} numberOfLines={1}>
                    {[guess.category, guess.condition, price > 0 ? formatNpr(price) : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Icon name="checkmark-circle" size={20} color={colors.primary} />
              </PressableScale>
            </>
          ) : (
            <Text style={styles.empty}>AI could not tell what this item is.</Text>
          )}

          {alternatives.length ? (
            <>
              <Text style={[styles.label, styles.labelGap]}>{guess ? 'Or is it one of these?' : 'Is it one of these?'}</Text>
              <View style={styles.list}>
                {alternatives.map((alt) => (
                  <PressableScale key={alt.title} scaleTo={0.98} contentStyle={styles.option} onPress={() => onChoose(alt)}>
                    <View style={styles.optionIcon}>
                      <Icon name="pricetag-outline" size={14} color={colors.primary} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.optionTitle} numberOfLines={1}>{alt.title}</Text>
                      {alt.category ? <Text style={styles.optionSub} numberOfLines={1}>{alt.category}</Text> : null}
                    </View>
                    <Icon name="chevron-forward" size={16} color={colors.textMuted} />
                  </PressableScale>
                ))}
              </View>
            </>
          ) : null}

          <Pressable style={styles.retake} onPress={() => onChoose('retake')} hitSlop={6}>
            <Icon name="camera-outline" size={15} color={colors.primary} />
            <Text style={styles.retakeText}>Take a clearer photo</Text>
          </Pressable>
        </ScrollView>

        {voiceBar ? <View style={styles.voice}>{voiceBar}</View> : null}

        <View style={styles.actions}>
          <PressableScale style={styles.actionFlex} contentStyle={styles.secondary} onPress={unsure}>
            <Text style={styles.secondaryText}>{"I'm not sure"}</Text>
          </PressableScale>
          {guess ? (
            <PressableScale style={styles.actionWide} contentStyle={styles.primary} onPress={() => onChoose('main')}>
              <Icon name="checkmark" size={17} color={colors.onPrimary} />
              <Text style={styles.primaryText}>Yes, fill it</Text>
            </PressableScale>
          ) : null}
        </View>
      </Reanimated.View>
    </Reanimated.View>
  );
}

/**
 * Shown only when the AI is unsure what the cover photo shows: the seller confirms its guess,
 * picks another item, says they are not sure, or retakes the photo.
 * `onChoose` gets 'main', an alternative `{ title, category }`, 'unsure' or 'retake'. `voiceBar` shows above the buttons.
 */
export default function AiItemCheckModal({ visible, photo, suggestion, onChoose, voiceBar }) {
  return (
    <Modal visible={!!visible && !!suggestion} transparent animationType="none" statusBarTranslucent onRequestClose={() => onChoose('unsure')}>
      {visible && suggestion ? <CheckContent photo={photo} suggestion={suggestion} onChoose={onChoose} voiceBar={voiceBar} /> : null}
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
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
    flex: {
      flex: 1,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    thumb: {
      width: 58,
      height: 58,
      borderRadius: 14,
      backgroundColor: colors.background,
    },
    thumbEmpty: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    title: {
      fontSize: 17,
      fontWeight: '900',
      color: colors.text,
      letterSpacing: -0.2,
    },
    confidence: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: `${colors.warning}1F`,
    },
    confidenceText: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.warning,
    },
    reasonRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 5,
      marginTop: 4,
    },
    reason: {
      flex: 1,
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
      paddingTop: 14,
      paddingBottom: 4,
    },
    label: {
      marginBottom: 6,
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
    },
    labelGap: {
      marginTop: 12,
    },
    empty: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text,
    },
    list: {
      gap: 8,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    optionMain: {
      borderColor: `${colors.primary}66`,
      backgroundColor: `${colors.primary}12`,
    },
    optionIcon: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${colors.primary}1A`,
    },
    optionIconMain: {
      backgroundColor: colors.primary,
    },
    optionTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text,
    },
    optionSub: {
      marginTop: 1,
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.textMuted,
    },
    retake: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      marginTop: 12,
    },
    retakeText: {
      fontSize: 12.5,
      fontWeight: '800',
      color: colors.primary,
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
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
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
    primaryText: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.onPrimary,
    },
  });
