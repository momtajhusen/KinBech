import { useEffect } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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

function ConfirmContent({ photo, photoCount, title, price, details, description, onEdit, onConfirm }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { height } = useWindowDimensions();
  const amount = Number(String(price ?? '').replace(/[^\d.]/g, '')) || 0;
  const rows = (details || []).filter((row) => row?.value);

  useEffect(() => {
    callHaptic('toggleOn');
  }, []);

  return (
    <Reanimated.View entering={FadeIn.duration(200)} style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onEdit} />
      <Reanimated.View entering={cardIn} style={[styles.card, { maxHeight: height * 0.88 }]}>
        <View style={styles.cover}>
          {photo ? (
            <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.coverEmpty]}>
              <Icon name="image-outline" size={40} color={colors.textMuted} />
            </View>
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.45)', 'transparent', 'transparent', 'rgba(0,0,0,0.55)']}
            locations={[0, 0.3, 0.6, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.coverTop}>
            <View style={styles.pill}>
              <Icon name="eye-outline" size={13} color="#FFFFFF" />
              <Text style={styles.pillText}>Preview</Text>
            </View>
            <Pressable style={styles.close} onPress={onEdit} hitSlop={10}>
              <Icon name="close" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
          {photoCount > 1 ? (
            <View style={styles.count}>
              <Icon name="images-outline" size={13} color="#FFFFFF" />
              <Text style={styles.pillText}>{photoCount}</Text>
            </View>
          ) : null}
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.body} bounces={false}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          {amount > 0 ? <Text style={styles.price}>{formatNpr(amount)}</Text> : null}

          {rows.length ? (
            <View style={styles.grid}>
              {rows.map((row) => (
                <View key={row.label} style={styles.cell}>
                  <View style={styles.cellIcon}>
                    <Icon name={row.icon} size={15} color={colors.primary} />
                  </View>
                  <View style={styles.cellCopy}>
                    <Text style={styles.cellLabel}>{row.label}</Text>
                    <Text style={styles.cellValue} numberOfLines={1}>{row.value}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {description ? (
            <View style={styles.description}>
              <Text style={styles.cellLabel}>Description</Text>
              <Text style={styles.descriptionText} numberOfLines={4}>{description}</Text>
            </View>
          ) : null}

          <Text style={styles.hint}>Check the details. Your post goes live for nearby buyers once you publish.</Text>
        </ScrollView>

        <View style={styles.actions}>
          <PressableScale style={styles.actionFlex} contentStyle={styles.secondary} onPress={onEdit}>
            <Icon name="create-outline" size={17} color={colors.text} />
            <Text style={styles.secondaryText}>Edit</Text>
          </PressableScale>
          <PressableScale style={styles.actionWide} contentStyle={styles.primary} onPress={onConfirm}>
            <Icon name="send" size={17} color={colors.onPrimary} />
            <Text style={styles.primaryText}>Publish now</Text>
          </PressableScale>
        </View>
      </Reanimated.View>
    </Reanimated.View>
  );
}

/** Last look at a new listing (cover photo first, then the details) before it is posted. */
export default function PublishConfirmModal({ visible, onEdit, ...rest }) {
  return (
    <Modal visible={!!visible} transparent animationType="none" statusBarTranslucent onRequestClose={onEdit}>
      {visible ? <ConfirmContent {...rest} onEdit={onEdit} /> : null}
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
    cover: {
      width: '100%',
      aspectRatio: 4 / 3,
      backgroundColor: colors.background,
    },
    coverEmpty: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    coverTop: {
      position: 'absolute',
      top: 12,
      left: 12,
      right: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    pillText: {
      fontSize: 12,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    close: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    count: {
      position: 'absolute',
      right: 12,
      bottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    scroll: {
      flexGrow: 0,
    },
    body: {
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 6,
    },
    title: {
      fontSize: 19,
      fontWeight: '900',
      color: colors.text,
      letterSpacing: -0.2,
    },
    price: {
      marginTop: 4,
      fontSize: 20,
      fontWeight: '900',
      color: colors.primary,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 14,
    },
    cell: {
      width: '48.5%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 9,
      borderRadius: 14,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cellIcon: {
      width: 28,
      height: 28,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${colors.primary}1A`,
    },
    cellCopy: {
      flex: 1,
    },
    cellLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
    },
    cellValue: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.text,
    },
    description: {
      marginTop: 12,
      gap: 3,
    },
    descriptionText: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.text,
    },
    hint: {
      marginTop: 12,
      fontSize: 12,
      lineHeight: 17,
      color: colors.textMuted,
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
