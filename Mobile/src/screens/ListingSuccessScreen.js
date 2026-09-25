import { useEffect, useRef, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
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
      Alert.alert('Could not feature', error);
      return;
    }
    setIsFeatured(true);
    setFeaturedCredits(data?.featuredCredits ?? Math.max(0, featuredCredits - 1));
    await refreshUser();
    Alert.alert('Featured for 24 hours', 'Your listing will rank higher in search today.');
  };

  const handleViewListing = () => {
    navigation.replace(ROUTES.ITEM_DETAIL, { listingId: shareListing?.id });
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
          <Ionicons name="checkmark-circle" size={42} color={colors.onPrimary} />
        </LinearGradient>

        <Text style={styles.title}>{shareMode ? 'Share your listing' : 'Listing is live!'}</Text>
        <Text style={styles.subtitle}>
          {shareMode
            ? 'Download or share this card on WhatsApp Status, Facebook Groups, or Instagram.'
            : 'Share your auto-generated card on WhatsApp Status, Facebook Groups, or Instagram.'}
        </Text>

        {!shareMode && featuredCredits > 0 && !isFeatured ? (
          <Pressable style={styles.featureCard} onPress={handleFeature} disabled={featuring}>
            <Ionicons name="sparkles" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.featureTitle}>
                {featuring ? 'Featuring…' : 'Use 1 free featured day'}
              </Text>
              <Text style={styles.featureHint}>
                You have {featuredCredits} credit(s) from inviting friends.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </Pressable>
        ) : null}

        {isFeatured ? (
          <View style={styles.featureCardDone}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success || colors.primary} />
            <Text style={styles.featureDoneText}>Featured for 24 hours</Text>
          </View>
        ) : null}

        {!shareMode ? (
          <Pressable
            style={styles.inviteLink}
            onPress={() => navigation.navigate(ROUTES.INVITE_FRIENDS)}
          >
            <Ionicons name="gift-outline" size={16} color={colors.primary} />
            <Text style={styles.inviteLinkText}>
              Invite a friend → earn another free featured day
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

        <View style={styles.shareGrid}>
          <Pressable
            style={[styles.shareTile, styles.shareTileWhatsApp]}
            onPress={() => runShare('whatsapp', () => shareListingToWhatsApp(cardRef, shareListing))}
            disabled={Boolean(sharing)}
          >
            {sharing === 'whatsapp' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="logo-whatsapp" size={22} color="#fff" />
                <Text style={styles.shareTileTitle}>WhatsApp</Text>
                <Text style={styles.shareTileHint}>Status or chat</Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={styles.shareTile}
            onPress={() => runShare('image', () => shareListingImage(cardRef, shareListing))}
            disabled={Boolean(sharing)}
          >
            {sharing === 'image' ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Ionicons name="share-social-outline" size={22} color={colors.primary} />
                <Text style={styles.shareTileTitleDark}>Share image</Text>
                <Text style={styles.shareTileHintDark}>Facebook · Instagram</Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={styles.shareTile}
            onPress={() => runShare('save', () => saveListingShareCard(cardRef))}
            disabled={Boolean(sharing)}
          >
            {sharing === 'save' ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Ionicons name="download-outline" size={22} color={colors.primary} />
                <Text style={styles.shareTileTitleDark}>Export card</Text>
                <Text style={styles.shareTileHintDark}>Save to Photos</Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={styles.shareTile}
            onPress={() => runShare('link', () => shareListingLink(shareListing))}
            disabled={Boolean(sharing)}
          >
            {sharing === 'link' ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Ionicons name="link-outline" size={22} color={colors.primary} />
                <Text style={styles.shareTileTitleDark}>Share link</Text>
                <Text style={styles.shareTileHintDark}>Text only</Text>
              </>
            )}
          </Pressable>
        </View>

        <Pressable
          style={styles.copyBtn}
          onPress={async () => {
            await Clipboard.setStringAsync(buildShareMessage(shareListing));
            Alert.alert('Copied', 'Listing message copied to clipboard.');
          }}
        >
          <Ionicons name="copy-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.copyBtnText}>Copy share message</Text>
        </Pressable>

        <Pressable style={styles.viewButtonWrap} onPress={handleViewListing}>
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.viewButton}
          >
            <Ionicons name="eye-outline" size={18} color={colors.onPrimary} />
            <Text style={styles.viewLabel}>View listing</Text>
          </LinearGradient>
        </Pressable>

        <Pressable
          style={styles.doneBtn}
          onPress={() => (shareMode ? navigation.goBack() : navigation.navigate(ROUTES.MAIN_TABS))}
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
  shareGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  shareTile: {
    width: '48%',
    flexGrow: 1,
    minHeight: 92,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 4,
    justifyContent: 'center',
  },
  shareTileWhatsApp: {
    backgroundColor: '#25D366',
    borderColor: '#25D366',
  },
  shareTileTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  shareTileHint: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 11,
  },
  shareTileTitleDark: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  shareTileHintDark: {
    color: colors.textSecondary,
    fontSize: 11,
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
