import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from '../components/Icon';
import * as Clipboard from 'expo-clipboard';
import ListingShareCard from '../components/ListingShareCard';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { normalizeListingForShare, buildShareMessage } from '../utils/listingShare';
import {
  saveListingShareCard,
  shareListingImage,
  shareListingLink,
  shareListingToWhatsApp,
  redirectListingPost,
} from '../utils/shareListingCard';

export default function ListingSuccessScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const cardRef = useRef(null);
  const [sharing, setSharing] = useState(null);
  const { user, refreshUser } = useAuth();
  const [featuredCredits, setFeaturedCredits] = useState(user?.featuredCredits || 0);
  const [featuring, setFeaturing] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);

  const shareListing = normalizeListingForShare(route.params?.listing);
  const shareMode = route.params?.mode === 'share';
  const inReview = route.params?.listing?.status === 'pending';

  const goHome = useCallback(() => {
    navigation.reset({
      index: 0,
      routes: [{ name: ROUTES.MAIN_TABS, params: { screen: ROUTES.HOME } }],
    });
  }, [navigation]);

  useEffect(() => {
    if (shareMode) return undefined;
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      const type = event.data?.action?.type;
      if (type !== 'GO_BACK' && type !== 'POP') return;
      event.preventDefault();
      goHome();
    });
    return unsubscribe;
  }, [goHome, navigation, shareMode]);

  useEffect(() => {
    (async () => {
      const { data } = await api.getReferral();
      if (data) setFeaturedCredits(data.featuredCredits || 0);
    })();
  }, []);

  if (!colors) return null;

  const runShare = async (key, action) => {
    if (!shareListing?.id || sharing) return;
    setSharing(key);
    try {
      await action();
    } catch (error) {
      Alert.alert('Could not share', error?.message || 'Please try again.');
    } finally {
      setSharing(null);
    }
  };

  const handleFeature = async () => {
    if (!shareListing?.id || featuring || isFeatured) return;
    setFeaturing(true);
    const { data, error } = await api.featureListing(shareListing.id);
    setFeaturing(false);
    if (error) {
      if (data?.code === 'NO_FEATURED_CREDITS') setFeaturedCredits(0);
      if (data?.code === 'ALREADY_FEATURED') setIsFeatured(true);
      Alert.alert('Could not boost', error);
      return;
    }
    setIsFeatured(true);
    setFeaturedCredits(data?.featuredCredits ?? Math.max(0, featuredCredits - 1));
    await refreshUser();
    Alert.alert('Boosted for 24 hours', 'Your listing is now Featured and shown higher to nearby buyers.');
  };

  const handleViewListing = () => {
    navigation.reset({
      index: 1,
      routes: [
        { name: ROUTES.MAIN_TABS, params: { screen: ROUTES.HOME } },
        { name: ROUTES.ITEM_DETAIL, params: { listingId: shareListing?.id } },
      ],
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ThemeStatusBar variant="default" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroBadge}
        >
          <Icon name="checkmark-circle" size={42} color={colors.onPrimary} />
        </LinearGradient>

        <Text style={styles.title}>
          {shareMode ? 'Share your listing' : inReview ? 'Sent for review' : 'Listing is live!'}
        </Text>
        <Text style={styles.subtitle}>
          {shareMode
            ? 'Send the card. WhatsApp and Facebook open with your listing.'
            : inReview
              ? 'It goes live after a quick check. You can get the share card ready now.'
              : 'Your listing is ready to share. Tap an app to post it.'}
        </Text>

        {!shareMode && !inReview && featuredCredits > 0 && !isFeatured ? (
          <Pressable style={styles.featureCard} onPress={handleFeature} disabled={featuring}>
            <Icon name="flash" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.featureTitle}>
                {featuring ? 'Boosting…' : 'Boost for 24 hours, free'}
              </Text>
              <Text style={styles.featureHint}>
                Uses 1 of your {featuredCredits} {featuredCredits === 1 ? 'credit' : 'credits'}. Shown higher to nearby buyers.
              </Text>
            </View>
            <Icon name="chevron-forward" size={18} color={colors.primary} />
          </Pressable>
        ) : null}

        {!shareMode && inReview && featuredCredits > 0 ? (
          <View style={styles.featureCardDone}>
            <Icon name="flash-outline" size={18} color={colors.primary} />
            <Text style={[styles.featureDoneText, { flex: 1 }]}>
              You can boost it from My Listings once it is approved.
            </Text>
          </View>
        ) : null}

        {isFeatured ? (
          <View style={styles.featureCardDone}>
            <Icon name="checkmark-circle" size={18} color={colors.success || colors.primary} />
            <Text style={styles.featureDoneText}>Featured for 24 hours</Text>
          </View>
        ) : null}

        {!shareMode ? (
          <Pressable
            style={styles.inviteLink}
            onPress={() => navigation.navigate(ROUTES.INVITE_FRIENDS)}
          >
            <Icon name="gift-outline" size={16} color={colors.primary} />
            <Text style={styles.inviteLinkText}>
              Invite a friend → earn a free boost
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.cardPreviewWrap}>
          <Text style={styles.sectionLabel}>Share card preview</Text>
          <View style={styles.cardShadow}>
            <ListingShareCard ref={cardRef} listing={shareListing} />
          </View>
          <Text style={styles.cardHint}>Portrait card · optimized for Status & groups</Text>
        </View>

        <View style={styles.shareRow}>
          {[
            { key: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp', color: '#25D366', action: () => shareListingToWhatsApp(cardRef, shareListing) },
            { key: 'facebook', label: 'Facebook', icon: 'logo-facebook', color: '#1877F2', action: () => redirectListingPost('facebook', shareListing, cardRef) },
            { key: 'instagram', label: 'Instagram', icon: 'logo-instagram', color: '#E1306C', action: () => redirectListingPost('instagram', shareListing, cardRef) },
            { key: 'tiktok', label: 'TikTok', icon: 'logo-tiktok', color: '#111111', action: () => redirectListingPost('tiktok', shareListing, cardRef) },
          ].map((item) => (
            <Pressable
              key={item.key}
              style={styles.shareIcon}
              onPress={() => runShare(item.key, item.action)}
              disabled={Boolean(sharing)}
            >
              <View style={[styles.shareCircle, { backgroundColor: item.color }]}>
                {sharing === item.key ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Icon name={item.icon} size={22} color="#fff" />
                )}
              </View>
              <Text style={styles.shareLabel}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.toolRow}>
          {[
            { key: 'image', label: 'Share', icon: 'share-social-outline', action: () => shareListingImage(cardRef, shareListing) },
            { key: 'save', label: 'Save', icon: 'download-outline', action: () => saveListingShareCard(cardRef) },
            { key: 'link', label: 'Link', icon: 'link-outline', action: () => shareListingLink(shareListing) },
          ].map((item) => (
            <Pressable
              key={item.key}
              style={styles.toolIcon}
              onPress={() => runShare(item.key, item.action)}
              disabled={Boolean(sharing)}
            >
              {sharing === item.key ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Icon name={item.icon} size={18} color={colors.text} />
              )}
              <Text style={styles.toolLabel}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={styles.copyBtn}
          onPress={async () => {
            await Clipboard.setStringAsync(buildShareMessage(shareListing));
            Alert.alert('Copied', 'Listing message copied to clipboard.');
          }}
        >
          <Icon name="copy-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.copyBtnText}>Copy share message</Text>
        </Pressable>

        <Pressable style={styles.viewButtonWrap} onPress={handleViewListing}>
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.viewButton}
          >
            <Icon name="eye-outline" size={18} color={colors.onPrimary} />
            <Text style={styles.viewLabel}>View listing</Text>
          </LinearGradient>
        </Pressable>

        <Pressable
          style={styles.doneBtn}
          onPress={() => (shareMode ? navigation.goBack() : goHome())}
        >
          <Text style={styles.doneBtnText}>{shareMode ? 'Done' : 'Back to home'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    alignItems: 'center',
  },
  heroBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
    maxWidth: 320,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: 10,
  },
  featureTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  featureHint: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  featureCardDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.iconBackground,
    marginBottom: 10,
  },
  featureDoneText: { fontSize: 13, fontWeight: '700', color: colors.text },
  inviteLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  inviteLinkText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.04,
    textTransform: 'uppercase',
    color: colors.textSecondary,
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  cardPreviewWrap: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 18,
  },
  cardShadow: {
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  cardHint: {
    marginTop: 10,
    fontSize: 12,
    color: colors.textTertiary,
  },
  shareRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  shareIcon: {
    width: 72,
    alignItems: 'center',
    gap: 6,
  },
  shareCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  toolRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 8,
  },
  toolIcon: {
    minWidth: 88,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  toolLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginBottom: 16,
  },
  copyBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  viewButtonWrap: {
    width: '100%',
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  viewLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.onPrimary,
  },
  doneBtn: {
    marginTop: 12,
    paddingVertical: 10,
  },
  doneBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
  },
});
