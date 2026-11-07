import { useEffect } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FadeIn, withSpring, withTiming } from 'react-native-reanimated';
import Icon from './Icon';
import { PressableScale, Pulse, Reanimated, Shimmer } from './Motion';
import { callHaptic } from '../services/callHaptics';
import { formatNpr } from '../utils/currency';
import { resolveMediaUrl, timeAgo } from '../utils/listing';
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

/** The seller's own listing this post repeats: open that one instead, or post anyway into review. */
function RepeatWarning({ listing, onOpen }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const cover = listing.photos?.[0] ? resolveMediaUrl(listing.photos[0]) : null;
  const posted = timeAgo(listing.createdAt);
  const inReview = listing.status === 'pending';
  return (
    <Reanimated.View entering={FadeIn.duration(220)} style={styles.repeat}>
      <View style={styles.repeatHead}>
        <View style={styles.repeatIcon}>
          <Icon name="copy-outline" size={16} color={colors.warning} />
        </View>
        <View style={styles.cellCopy}>
          <Text style={styles.repeatTitle}>You already posted this</Text>
          <Text style={styles.repeatSub}>Same item twice crowds the market. Edit the one you posted instead.</Text>
        </View>
      </View>
      <Pressable style={styles.repeatItem} onPress={onOpen} disabled={!onOpen}>
        {cover ? (
          <Image source={{ uri: cover }} style={styles.repeatThumb} />
        ) : (
          <View style={[styles.repeatThumb, styles.coverEmpty]}>
            <Icon name="image-outline" size={18} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.cellCopy}>
          <Text style={styles.cellValue} numberOfLines={1}>{listing.title}</Text>
          <Text style={styles.repeatPrice}>{formatNpr(Number(listing.price) || 0)}</Text>
          <Text style={styles.cellLabel} numberOfLines={1}>
            {[inReview ? 'In review' : 'Live', posted].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {onOpen ? (
          <View style={styles.repeatOpen}>
            <Text style={styles.repeatOpenText}>Open</Text>
            <Icon name="chevron-forward" size={14} color={colors.warning} />
          </View>
        ) : null}
      </Pressable>
    </Reanimated.View>
  );
}

const PHOTO_FLAG_COPY = {
  person: {
    icon: 'person-circle-outline',
    title: 'Face detected in photo',
    body: "A real person's face is in your photo, so our team checks it before it goes live.",
    tip: 'A photo of just the item goes live right away.',
  },
  revealing: {
    icon: 'eye-off-outline',
    title: 'Revealing photo',
    body: 'This photo puts private body areas on show, so our team checks it before it goes live.',
    tip: 'Show the item on a hanger, laid flat or on a mannequin instead.',
  },
  qr_code: {
    icon: 'qr-code-outline',
    title: 'Only a QR code in the photo',
    body: 'Buyers need to see the item, not a code, so our team checks it before it goes live.',
    tip: 'Take a photo of the item itself. Share payment details in chat.',
  },
  blurry: {
    icon: 'aperture-outline',
    title: 'Photo is blurry',
    body: 'The item is hard to make out, so our team checks it before it goes live.',
    tip: 'Hold the phone steady and tap the item to focus.',
  },
  too_dark: {
    icon: 'moon-outline',
    title: 'Photo is too dark',
    body: 'The item is hard to see, so our team checks it before it goes live.',
    tip: 'Take the photo near a window or in good light.',
  },
  blank: {
    icon: 'square-outline',
    title: 'Photo looks empty',
    body: 'There is no item to see in this photo, so our team checks it before it goes live.',
    tip: 'Fill the frame with the item you are selling.',
  },
  unclear: {
    icon: 'help-circle-outline',
    title: 'Item is not clear',
    body: 'It is hard to tell what is for sale here, so our team checks it before it goes live.',
    tip: 'Take a clear photo of just the item on a plain background.',
  },
  off_topic: {
    icon: 'help-circle-outline',
    title: 'No item in focus',
    body: 'This photo does not clearly show something for sale, so our team checks it before it goes live.',
    tip: 'Take a clear photo of the item you are selling.',
  },
};

/** The AI saw something in the cover (a real person, or content to check) that sends it to review. */
function PhotoReviewNotice({ flag }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const copy = PHOTO_FLAG_COPY[flag.issue] || {
    icon: 'shield-outline',
    title: 'Photo needs review',
    body: 'Our team checks this photo before your listing goes live.',
  };
  return (
    <Reanimated.View entering={FadeIn.duration(220)} style={styles.repeat}>
      <View style={styles.repeatHead}>
        <View style={styles.repeatIcon}>
          <Icon name={copy.icon} size={17} color={colors.warning} />
        </View>
        <View style={styles.cellCopy}>
          <Text style={styles.repeatTitle}>{copy.title}</Text>
          <Text style={styles.repeatSub}>{copy.body}</Text>
          {flag.reason ? <Text style={styles.flagNote} numberOfLines={2}>AI saw: {flag.reason}</Text> : null}
        </View>
      </View>
      <View style={styles.flagTip}>
        <Icon name="bulb-outline" size={14} color={colors.textMuted} />
        <Text style={styles.flagTipText}>{copy.tip || 'A photo of just the item goes live right away.'}</Text>
      </View>
    </Reanimated.View>
  );
}

function ConfirmContent({
  photo,
  photoCount,
  title,
  price,
  details,
  description,
  onEdit,
  onConfirm,
  onSimilar,
  duplicate,
  checking,
  onOpenDuplicate,
  photoFlag,
  voiceBar,
}) {
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

          {photoFlag ? <PhotoReviewNotice flag={photoFlag} /> : null}
          {duplicate ? <RepeatWarning listing={duplicate} onOpen={onOpenDuplicate} /> : null}

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

          {onSimilar && photo ? (
            <PressableScale style={styles.similarWrap} scaleTo={0.97} onPress={onSimilar}>
              <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.similar}>
                <Shimmer />
                <Pulse to={1.12} pause={1800} style={styles.similarIcon}>
                  <Icon name="sparkles" size={18} color="#FFFFFF" />
                </Pulse>
                <View style={styles.cellCopy}>
                  <View style={styles.similarTitleRow}>
                    <Text style={styles.similarTitle}>Similar products</Text>
                    <View style={styles.aiBadge}>
                      <Text style={styles.aiBadgeText}>AI</Text>
                    </View>
                  </View>
                  <Text style={styles.similarSub} numberOfLines={1}>See who sells this and for how much</Text>
                </View>
                <View style={styles.similarGo}>
                  <Icon name="arrow-forward" size={15} color={colors.gradientStart || colors.primary} />
                </View>
              </LinearGradient>
            </PressableScale>
          ) : null}

          {description ? (
            <View style={styles.description}>
              <Text style={styles.cellLabel}>Description</Text>
              <Text style={styles.descriptionText} numberOfLines={4}>{description}</Text>
            </View>
          ) : null}

          <Text style={styles.hint}>
            {duplicate
              ? 'Posting anyway? If it really is a different piece, our team checks it before it goes live.'
              : photoFlag
                ? 'Your listing goes to manual review and goes live once our team approves it.'
                : 'Check the details. Your post goes live for nearby buyers once you publish.'}
          </Text>
        </ScrollView>

        {voiceBar ? <View style={styles.voice}>{voiceBar}</View> : null}

        <View style={styles.actions}>
          <PressableScale style={styles.actionFlex} contentStyle={styles.secondary} onPress={onEdit}>
            <Icon name="create-outline" size={17} color={colors.text} />
            <Text style={styles.secondaryText}>Edit</Text>
          </PressableScale>
          <PressableScale
            style={styles.actionWide}
            contentStyle={[styles.primary, duplicate && styles.primaryRepeat, checking && styles.primaryBusy]}
            onPress={onConfirm}
            disabled={checking}
          >
            {checking ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <Icon
                name={duplicate ? 'alert-circle-outline' : photoFlag ? 'shield-checkmark-outline' : 'send'}
                size={17}
                color={colors.onPrimary}
              />
            )}
            <Text style={styles.primaryText}>
              {checking ? 'Checking…' : duplicate ? 'Post anyway' : photoFlag ? 'Send for review' : 'Publish now'}
            </Text>
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
    similarWrap: {
      marginTop: 12,
      borderRadius: 16,
      shadowColor: colors.primary,
      shadowOpacity: 0.3,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 5,
    },
    similar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 11,
      paddingHorizontal: 12,
      borderRadius: 16,
      overflow: 'hidden',
    },
    similarIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.2)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.35)',
    },
    similarTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    similarTitle: {
      fontSize: 14.5,
      fontWeight: '900',
      color: '#FFFFFF',
      letterSpacing: -0.1,
    },
    aiBadge: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 6,
      backgroundColor: '#FFFFFF',
    },
    aiBadgeText: {
      fontSize: 9.5,
      fontWeight: '900',
      color: colors.gradientStart || colors.primary,
    },
    similarSub: {
      marginTop: 2,
      fontSize: 11.5,
      fontWeight: '600',
      color: 'rgba(255,255,255,0.88)',
    },
    similarGo: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FFFFFF',
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
    primaryRepeat: {
      backgroundColor: colors.warning,
    },
    primaryBusy: {
      opacity: 0.7,
    },
    repeat: {
      marginTop: 12,
      padding: 12,
      gap: 10,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: `${colors.warning}66`,
      backgroundColor: `${colors.warning}14`,
    },
    repeatHead: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    repeatIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${colors.warning}26`,
    },
    repeatTitle: {
      fontSize: 14,
      fontWeight: '900',
      color: colors.text,
    },
    repeatSub: {
      marginTop: 2,
      fontSize: 12,
      lineHeight: 16,
      color: colors.textMuted,
    },
    repeatItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 8,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    repeatThumb: {
      width: 50,
      height: 50,
      borderRadius: 10,
      backgroundColor: colors.background,
    },
    repeatPrice: {
      fontSize: 13,
      fontWeight: '900',
      color: colors.primary,
    },
    repeatOpen: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: `${colors.warning}1F`,
    },
    flagNote: {
      marginTop: 4,
      fontSize: 11.5,
      fontWeight: '700',
      color: colors.text,
    },
    flagTip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    flagTipText: {
      flex: 1,
      fontSize: 11.5,
      color: colors.textMuted,
    },
    repeatOpenText: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.warning,
    },
  });
