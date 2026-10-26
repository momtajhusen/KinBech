import { useState } from 'react';
import { useTheme, useThemedStyles, ThemeStatusBar, formTextareaStyle } from '../theme';
import {
  Text,
  TextInput,
  View,
  Pressable,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from '../components/Icon';
import { api } from '../services/api';
import { AlertModal, showErrorAlert, showSuccessAlert } from '../components/AlertModal';
import { FormScroll } from '../components/FormScroll';

/**
 * Resolve color references (e.g., 'colors.iconBackground') to actual color values
 * @param {string} colorRef - Color reference string or direct color value
 * @param {object} colors - Theme colors object
 * @returns {string} Resolved color value
 */
function resolveColor(colorRef, colors) {
  if (typeof colorRef === 'string' && colorRef.startsWith('colors.')) {
    const colorKey = colorRef.replace('colors.', '');
    return colors[colorKey] || colorRef;
  }
  return colorRef;
}

// Shown only when the report is about a specific listing (opened from a chat).
const LISTING_REASONS = [
  {
    key: 'not-available',
    icon: 'close-circle-outline',
    iconBg: 'iconBackground',
    iconColor: 'gradientStart',
    title: 'Not available / already sold',
    subtitle: 'The item is gone but the listing is still up',
  },
  {
    key: 'no-show',
    icon: 'time-outline',
    iconBg: 'supportSafetyBg',
    iconColor: 'supportSafetyIcon',
    title: 'Did not show up',
    subtitle: 'Confirmed a meetup and never came',
  },
];

const REASONS = [
  {
    key: 'scam',
    icon: 'warning-outline',
    iconBg: 'dangerBackground',
    iconColor: 'danger',
    title: 'Scam or fraud',
    subtitle: 'Asked for advance payment, fake payment proof, or tried to cheat',
  },
  {
    key: 'spam',
    icon: 'megaphone-outline',
    iconBg: 'dangerBackground',
    iconColor: 'danger',
    title: 'Spam',
    subtitle: 'Repeated or unwanted messages and listings',
  },
  {
    key: 'fake-listing',
    icon: 'document-text-outline',
    iconBg: 'supportSafetyBg',
    iconColor: 'supportSafetyIcon',
    title: 'Fake Listing',
    subtitle: 'The listing is fake or misleading',
  },
  {
    key: 'inappropriate',
    icon: 'person-outline',
    iconBg: 'iconBackground',
    iconColor: 'gradientStart',
    title: 'Inappropriate Behavior',
    subtitle: 'Harassment, abusive or rude behavior',
  },
  {
    key: 'other',
    icon: 'ellipsis-horizontal',
    iconBg: 'pastelCyan',
    iconColor: 'menuCyan',
    title: 'Other',
    subtitle: 'Something else that violates our policies',
  },
];

const MAX_LENGTH = 500;

export default function ReportBlockUserScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  // Guard against undefined colors
  if (!colors) {
    return null;
  }
  const { userId, listingId, listingTitle, reason: initialReason } = route.params ?? {};
  const [selectedReason, setSelectedReason] = useState(initialReason || null);
  const [details, setDetails] = useState('');
  const [blockUser, setBlockUser] = useState(!listingId);
  const [loading, setLoading] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);

  // Resolve reason colors dynamically
  const reasons = listingId ? [...LISTING_REASONS, ...REASONS] : REASONS;
  const resolvedReasons = reasons.map(reason => ({
    ...reason,
    iconBg: resolveColor(`colors.${reason.iconBg}`, colors),
    iconColor: resolveColor(`colors.${reason.iconColor}`, colors)
  }));

  const handleSubmit = async () => {
    if (!selectedReason) {
      setAlertConfig(showErrorAlert({
        title: 'Select a reason',
        message: 'Please choose why you are reporting this user.',
        onConfirm: () => setAlertConfig(null),
      }));
      return;
    }
    if (!userId) {
      setAlertConfig(showErrorAlert({
        title: 'User not found',
        message: 'Unable to report this user.',
        onConfirm: () => setAlertConfig(null),
      }));
      return;
    }
    
    setLoading(true);
    try {
      const { data, error } = await api.createReport({
        reportedUserId: userId,
        reason: selectedReason,
        details: details,
        blockUser: blockUser,
        ...(listingId ? { listingId } : {}),
      });
      
      setLoading(false);
      if (error) {
        setAlertConfig(showErrorAlert({
          title: 'Report failed',
          message: error,
          onConfirm: () => setAlertConfig(null),
        }));
        return;
      }
      
      setAlertConfig(showSuccessAlert({
        title: data?.duplicate ? 'Already reported' : 'Report Submitted',
        message: selectedReason === 'not-available'
          ? 'Thanks. If more buyers say the same, the listing is hidden automatically.'
          : 'Thank you for helping keep our community safe.',
        onConfirm: () => {
          setAlertConfig(null);
          navigation.goBack();
        },
      }));
    } catch (err) {
      setLoading(false);
      setAlertConfig(showErrorAlert({
        title: 'Error',
        message: 'Failed to submit report. Please try again.',
        onConfirm: () => setAlertConfig(null),
      }));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Icon name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Report User</Text>
        <View style={{ width: 24 }} />
      </View>

      <FormScroll contentContainerStyle={styles.content}>
        <View style={styles.illustrationWrap}>
          <View style={styles.illustrationGlow} />
          <View style={styles.shieldCircle}>
            <Icon name="shield" size={56} color={colors.danger} />
            <Icon
              name="alert"
              size={22}
              color={colors.white}
              style={styles.alertIcon}
            />
          </View>
        </View>

        <Text style={styles.title}>Help us keep the community safe</Text>
        <Text style={styles.subtitle}>
          Your report is private and helps us take action against inappropriate users.
        </Text>

        <Text style={styles.sectionLabel}>
          {listingTitle ? `What happened with "${listingTitle}"?` : 'Why are you reporting this user?'}
        </Text>
        <View style={styles.reasonsCard}>
          {(resolvedReasons || []).map((reason, index) => {
            const selected = selectedReason === reason.key;
            return (
              <Pressable
                key={reason.key}
                style={[
                  styles.reasonRow,
                  index === resolvedReasons.length - 1 && styles.reasonRowLast,
                ]}
                onPress={() => setSelectedReason(reason.key)}
              >
                <View style={[styles.reasonIconCircle, { backgroundColor: reason.iconBg }]}>
                  <Icon name={reason.icon} size={20} color={reason.iconColor} />
                </View>
                <View style={styles.reasonTextWrap}>
                  <Text style={styles.reasonTitle}>{reason.title}</Text>
                  <Text style={styles.reasonSubtitle}>{reason.subtitle}</Text>
                </View>
                <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                  {selected && <View style={styles.radioInner} />}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>Additional details (optional)</Text>
        <View style={styles.textAreaWrap}>
          <TextInput
            placeholder="Please provide more details..."
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={MAX_LENGTH}
            value={details}
            onChangeText={setDetails}
            style={styles.textArea}
          />
          <Text style={styles.charCount}>
            {details.length}/{MAX_LENGTH}
          </Text>
        </View>

        <View style={styles.blockCard}>
          <View style={styles.blockIconCircle}>
            <Icon name="shield-outline" size={20} color={colors.gradientStart} />
          </View>
          <View style={styles.blockTextWrap}>
            <Text style={styles.blockTitle}>Also block this user</Text>
            <Text style={styles.blockSubtitle}>
              You won't be able to see or contact each other.
            </Text>
          </View>
          <Switch
            value={blockUser}
            onValueChange={setBlockUser}
            trackColor={{ false: colors.border, true: colors.gradientStart }}
            thumbColor={colors.white}
          />
        </View>

        <Pressable onPress={handleSubmit} disabled={loading}>
          <LinearGradient
            colors={colors.reportGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.submitButton}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Icon name="shield-checkmark-outline" size={18} color={colors.white} />
                <Text style={styles.submitLabel}>Submit Report</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>

        <Pressable onPress={() => navigation.goBack()} style={styles.cancelButton}>
          <Text style={styles.cancelLabel}>Cancel</Text>
        </Pressable>
      </FormScroll>

      <AlertModal
        visible={!!alertConfig}
        onClose={() => setAlertConfig(null)}
        {...(alertConfig || {})}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  illustrationWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 160,
    marginBottom: 16,
  },
  illustrationGlow: {
    position: 'absolute',
    width: 200,
    height: 160,
    borderRadius: 100,
    backgroundColor: colors.danger,
    opacity: 0.06,
  },
  shieldCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertIcon: {
    position: 'absolute',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  reasonsCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  reasonRowLast: {
    borderBottomWidth: 0,
  },
  reasonIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonTextWrap: {
    flex: 1,
    gap: 3,
  },
  reasonTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  reasonSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: colors.gradientStart,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.gradientStart,
  },
  textAreaWrap: { marginBottom: 20 },
  textArea: { ...formTextareaStyle(colors), minHeight: 96 },
  charCount: {
    alignSelf: 'flex-end',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 8,
  },
  blockCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 24,
  },
  blockIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.photoPlusBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockTextWrap: {
    flex: 1,
    gap: 3,
  },
  blockTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  blockSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    borderRadius: 16,
    minHeight: 54,
  },
  submitLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.white,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 18,
  },
  cancelLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.danger,
  },
});
