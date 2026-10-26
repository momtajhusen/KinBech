import { useState } from 'react';
import { useTheme, useThemedStyles, ThemeStatusBar, formTextareaStyle } from '../theme';
import Icon from '../components/Icon';
import {
  Text,
  TextInput,
  View,
  Image,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../services/api';
import { resolveMediaUrl, formatPrice } from '../utils/listing';
import { AlertModal, showErrorAlert, showSuccessAlert } from '../components/AlertModal';
import { FormScroll } from '../components/FormScroll';

const TAGS = [
  { key: 'communication', label: 'Great communication', icon: 'chatbubble-outline' },
  { key: 'as-described', label: 'Item as described', icon: 'cube-outline' },
  { key: 'fast-deal', label: 'Fast deal', icon: 'flash-outline' },
];

const MAX_LENGTH = 500;

export default function RateReviewScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { seller, listing, shop } = route.params ?? {};
  const [rating, setRating] = useState(4);
  const [review, setReview] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);

  const listingId = listing?.id || listing?._id;
  const isShopListing = listing?.sellerType === 'shop' || Boolean(shop);
  const sellerUser = seller || listing?.seller;
  const displayName = isShopListing
    ? shop?.name || listing?.shopId?.name || 'Shop'
    : sellerUser?.name || 'Seller';
  const avatarUri = isShopListing ? shop?.logo || listing?.shopId?.logo : sellerUser?.avatarUrl;

  if (!colors) {
    return null;
  }

  if (!listingId) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.content}>
          <Icon name="information-circle" size={64} color={colors.textMuted} />
          <Text style={styles.errorTitle}>Item not found</Text>
          <Text style={styles.errorMessage}>
            Open this from the "How was your deal?" notification to rate the seller.
          </Text>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const toggleTag = (key) => {
    setSelectedTags((prev) =>
      prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key]
    );
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const { data, error } = await api.createReview({
        listingId,
        rating,
        review,
        tags: selectedTags,
      });
      
      setLoading(false);
      if (error) {
        setAlertConfig(showErrorAlert({
          title: data?.code === 'DEAL_REQUIRED' ? 'Not yet' : 'Review failed',
          message: data?.code === 'DEAL_REQUIRED'
            ? 'You can rate the seller once your meetup for this item is done.'
            : error,
          onConfirm: () => setAlertConfig(null),
        }));
        return;
      }
      
      setAlertConfig(showSuccessAlert({
        title: 'Review Submitted',
        message: 'Thank you for your feedback!',
        onConfirm: () => {
          setAlertConfig(null);
          navigation.goBack();
        },
      }));
    } catch (err) {
      setLoading(false);
      setAlertConfig(showErrorAlert({
        title: 'Error',
        message: 'Failed to submit review. Please try again.',
        onConfirm: () => setAlertConfig(null),
      }));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <Text style={styles.headerTitle}>Rate Your Experience</Text>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Icon name="close" size={26} color={colors.white} />
        </Pressable>
      </LinearGradient>

      <FormScroll contentContainerStyle={styles.scrollContent}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            {avatarUri ? (
              <Image source={{ uri: resolveMediaUrl(avatarUri) }} style={{ width: '100%', height: '100%' }} />
            ) : (
              <View style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={isShopListing ? 'storefront' : 'person'} size={44} color={colors.text} />
              </View>
            )}
          </View>
        </View>
        <Text style={styles.sellerName}>{displayName}</Text>
        <Text style={styles.sellerRole}>{isShopListing ? 'Shop' : 'Seller'}</Text>

        <View style={styles.listingCard}>
          <View style={styles.listingImage}>
            {listing?.imageUrl || listing?.photos?.[0] ? (
              <Image 
                source={{ uri: resolveMediaUrl(listing?.imageUrl || listing?.photos?.[0] || '') }} 
                style={{ width: '100%', height: '100%' }} 
                resizeMode="cover" 
              />
            ) : (
              <View style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="cube-outline" size={32} color={colors.textMuted} />
              </View>
            )}
          </View>
          <View style={styles.listingInfo}>
            <Text style={styles.listingTitle} numberOfLines={1}>
              {listing?.title}
            </Text>
            {listing?.subtitle ? <Text style={styles.listingSubtitle}>{listing.subtitle}</Text> : null}
            {listing?.price != null ? (
              <Text style={styles.listingPrice}>{formatPrice(listing.price)}</Text>
            ) : null}
          </View>
        </View>

        <Text style={styles.sectionLabel}>How would you rate your experience?</Text>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((value) => (
            <Pressable key={value} onPress={() => setRating(value)} hitSlop={6}>
              <Icon
                name={value <= rating ? 'star' : 'star-outline'}
                size={40}
                color={value <= rating ? colors.gradientEnd : colors.border}
                style={styles.star}
              />
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Tell us more (optional)</Text>
        <View style={styles.inputWrap}>
          <TextInput
            placeholder="Share your experience..."
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={MAX_LENGTH}
            value={review}
            onChangeText={setReview}
            style={styles.input}
          />
          <Text style={styles.charCount}>
            {review.length}/{MAX_LENGTH}
          </Text>
        </View>

        <Text style={styles.sectionLabel}>What did you like about the experience?</Text>
        <View style={styles.tagsRow}>
          {(TAGS || []).map((tag) => {
            const selected = selectedTags.includes(tag.key);
            return (
              <Pressable
                key={tag.key}
                onPress={() => toggleTag(tag.key)}
                style={[styles.tag, selected && styles.tagSelected]}
              >
                <Icon
                  name={tag.icon}
                  size={16}
                  color={colors.gradientStart}
                  style={styles.tagIcon}
                />
                <Text style={styles.tagLabel}>{tag.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable onPress={handleSubmit} disabled={loading}>
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.submitButton}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitLabel}>Submit Review</Text>
            )}
          </LinearGradient>
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
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.onPrimary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '800',
    color: colors.white,
  },
  scrollContent: {
    padding: 20,
    alignItems: 'center',
  },
  avatarWrap: {
    marginTop: 8,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: colors.white,
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  sellerName: {
    marginTop: 12,
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  sellerRole: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 2,
  },
  listingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    width: '100%',
    marginTop: 20,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listingImage: {
    width: 84,
    height: 84,
    borderRadius: 12,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  listingInfo: {
    flex: 1,
    gap: 4,
  },
  listingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  listingSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
  },
  listingPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.price,
    marginTop: 2,
  },
  sectionLabel: {
    alignSelf: 'flex-start',
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginTop: 24,
    marginBottom: 12,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  star: {
    marginHorizontal: 2,
  },
  inputWrap: { width: '100%' },
  input: { ...formTextareaStyle(colors), minHeight: 96 },
  charCount: {
    alignSelf: 'flex-end',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 8,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    width: '100%',
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagSelected: {
    backgroundColor: colors.surfaceSelected ?? colors.surface,
    borderColor: colors.gradientStart,
  },
  tagIcon: {
    marginRight: 6,
  },
  tagLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.link,
  },
  submitButton: {
    width: '100%',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 28,
    minHeight: 54,
  },
  submitLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.white,
  },
});
