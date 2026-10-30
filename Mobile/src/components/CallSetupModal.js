import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FadeIn, FadeInDown, ZoomIn, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Icon from './Icon';
import { PressableScale, Reanimated, Wiggle } from './Motion';
import { closeCallSetup, openCallSetting, readCallSetupSteps, subscribeCallSetup } from '../services/callReadiness';
import { callHaptic } from '../services/callHaptics';
import { useTheme, useThemedStyles } from '../theme';

function StepRow({ step, index, onAction, styles, colors }) {
  return (
    <Reanimated.View entering={FadeInDown.delay(120 + index * 70).duration(380)} style={[styles.step, step.done && styles.stepDone]}>
      <View style={[styles.stepIcon, step.done && styles.stepIconDone]}>
        {step.done ? (
          <Reanimated.View entering={ZoomIn.springify().damping(12)}>
            <Icon name="checkmark" size={20} color={colors.onPrimary} />
          </Reanimated.View>
        ) : (
          <Icon name={step.icon} size={20} color={colors.primary} />
        )}
      </View>
      <View style={styles.stepCopy}>
        <Text style={styles.stepTitle}>{step.title}</Text>
        <Text style={styles.stepHint}>{step.done ? 'Done' : step.hint}</Text>
      </View>
      {step.done ? null : (
        <PressableScale contentStyle={styles.stepBtn} onPress={() => onAction(step)}>
          <Text style={styles.stepBtnText}>{step.cta}</Text>
        </PressableScale>
      )}
    </Reanimated.View>
  );
}

/** Sheet listing every switch calls need, rechecked whenever the user comes back from Settings. */
export default function CallSetupModal() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [visible, setVisible] = useState(false);
  const [steps, setSteps] = useState([]);
  const progress = useSharedValue(0);
  const visibleRef = useRef(false);

  const refresh = useCallback(async () => {
    const next = await readCallSetupSteps();
    if (!next) {
      closeCallSetup();
      return;
    }
    setSteps(next);
    const done = next.filter((step) => step.done).length;
    progress.value = withSpring(next.length ? done / next.length : 1, { damping: 16, stiffness: 140 });
  }, [progress]);

  useEffect(
    () =>
      subscribeCallSetup((open) => {
        visibleRef.current = open;
        setVisible(open);
        if (open) refresh();
      }),
    [refresh]
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && visibleRef.current) refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const allDone = steps.length > 0 && steps.every((step) => step.done);
  const doneCount = steps.filter((step) => step.done).length;
  const nextStep = steps.find((step) => !step.done);

  const allDoneRef = useRef(false);
  useEffect(() => {
    if (allDone && !allDoneRef.current) callHaptic('answer');
    allDoneRef.current = allDone;
  }, [allDone]);

  const runStep = (step) => {
    callHaptic('toggleOn');
    openCallSetting(step.action);
  };

  const onPrimary = () => {
    if (allDone || !nextStep) {
      closeCallSetup();
      return;
    }
    runStep(nextStep);
  };

  const bar = useAnimatedStyle(() => ({ width: `${Math.max(6, progress.value * 100)}%` }));

  const primaryLabel = allDone ? 'All set, close' : 'Fix next step';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => closeCallSetup({ notNow: true })}
    >
      <View style={styles.backdrop}>
        {visible ? (
          <Reanimated.View entering={FadeInDown.springify().damping(16)} style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.hero}>
              <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroIcon}>
                <Wiggle angle={14} every={2200}>
                  <Icon name={allDone ? 'checkmark-done' : 'call'} size={30} color={colors.onGradient} />
                </Wiggle>
              </LinearGradient>
              <Text style={styles.title}>{allDone ? 'Calls are ready' : 'Never miss a call'}</Text>
              <Text style={styles.subtitle}>
                {allDone
                  ? 'KinBech calls will ring even when the app is closed or the phone is locked.'
                  : 'Turn these on so buyers and sellers can reach you even when KinBech is closed or your phone is locked.'}
              </Text>
            </View>

            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <Reanimated.View style={[styles.progressFill, bar]} />
              </View>
              <Text style={styles.progressText}>{doneCount}/{steps.length || 0}</Text>
            </View>

            <View style={styles.steps}>
              {steps.map((step, index) => (
                <StepRow
                  key={step.key}
                  step={step}
                  index={index}
                  onAction={runStep}
                  styles={styles}
                  colors={colors}
                />
              ))}
            </View>

            <Reanimated.View entering={FadeIn.delay(380)}>
              <PressableScale contentStyle={styles.primary} onPress={onPrimary}>
                <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
                <Text style={styles.primaryText}>{primaryLabel}</Text>
                {allDone ? null : <Icon name="arrow-forward" size={18} color={colors.onGradient} />}
              </PressableScale>
            </Reanimated.View>

            {allDone ? null : (
              <Pressable onPress={() => closeCallSetup({ notNow: true })} hitSlop={10} style={styles.notNow}>
                <Text style={styles.notNowText}>Not now</Text>
              </Pressable>
            )}
          </Reanimated.View>
        ) : null}
      </View>
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    sheet: {
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 34,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      backgroundColor: colors.surface,
    },
    handle: {
      alignSelf: 'center',
      width: 42,
      height: 5,
      borderRadius: 3,
      marginBottom: 14,
      backgroundColor: colors.border,
    },
    hero: {
      alignItems: 'center',
      paddingHorizontal: 6,
    },
    heroIcon: {
      width: 64,
      height: 64,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    title: {
      fontSize: 21,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
    },
    subtitle: {
      marginTop: 6,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textMuted,
      textAlign: 'center',
    },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 18,
      marginBottom: 6,
    },
    progressTrack: {
      flex: 1,
      height: 8,
      borderRadius: 4,
      overflow: 'hidden',
      backgroundColor: colors.iconBackground || colors.background,
    },
    progressFill: {
      height: '100%',
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    progressText: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textSecondary,
      fontVariant: ['tabular-nums'],
    },
    steps: {
      gap: 10,
      marginTop: 10,
      marginBottom: 18,
    },
    step: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    stepDone: {
      opacity: 0.75,
    },
    stepIcon: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.iconBackground || colors.surface,
    },
    stepIconDone: {
      backgroundColor: colors.success || colors.primary,
    },
    stepCopy: {
      flex: 1,
      gap: 2,
    },
    stepTitle: {
      fontSize: 14.5,
      fontWeight: '800',
      color: colors.text,
    },
    stepHint: {
      fontSize: 12.5,
      lineHeight: 17,
      color: colors.textMuted,
    },
    stepBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: colors.primary,
    },
    stepBtnText: {
      fontSize: 12.5,
      fontWeight: '800',
      color: colors.onPrimary,
    },
    primary: {
      height: 52,
      borderRadius: 16,
      overflow: 'hidden',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    primaryText: {
      fontSize: 15.5,
      fontWeight: '800',
      color: colors.onGradient,
    },
    notNow: {
      alignSelf: 'center',
      marginTop: 14,
      paddingVertical: 4,
    },
    notNowText: {
      fontSize: 13.5,
      fontWeight: '600',
      color: colors.textMuted,
    },
  });
