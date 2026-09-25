import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertModal, showErrorAlert, showImageSafetyAlert } from '../components/AlertModal';
import EmptyState from '../components/EmptyState';
import ListingMediaPreview from '../components/ListingMediaPreview';
import VariantEditor from '../components/VariantEditor';
import { api } from '../services/api';
import { uploadMediaUris } from '../utils/mediaUpload';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { useCategories } from '../utils/categories';
import { formatCityDistrict } from '../utils/locations';
import { normalizeVariantsForApi } from '../utils/listingVariants';
import {
  assignVideoSlot,
  countListingPhotos,
  countListingVideos,
  EXTRA_PHOTO_SLOTS,
  hydrateMediaSlotsFromUris,
  MAX_LISTING_PHOTOS,
  MAX_LISTING_VIDEOS,
  MAX_MEDIA_SLOTS,
  MAX_VIDEO_DURATION_SEC,
  mediaUrisFromSlots,
  pickListingPhoto,
  recordListingVideo,
  VIDEO_SLOT_INDEX,
} from '../utils/listingPhotos';

const TOTAL_STEPS = 3;
const CONDITIONS = ['New', 'Good', 'Fair'];
const MEETUP_OPTIONS = ['Public place', 'Seller location', 'Buyer location'];

function FloatingField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  right,
  colors,
  styles,
  inputRef,
}) {
  return (
    <View style={styles.floatingWrap}>
      <Text style={styles.floatingLabel}>{label}</Text>
      <View style={[styles.floatingInputRow, multiline && styles.floatingInputRowMultiline]}>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          multiline={multiline}
          keyboardType={keyboardType}
          style={[styles.floatingInput, multiline && styles.floatingTextarea]}
        />
        {right}
      </View>
    </View>
  );
}

function ProgressHeader({ step, insets, onBack, colors, styles, title, stepLabels }) {
  return (
    <LinearGradient
      colors={colors.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[styles.header, { paddingTop: insets.top + 8 }]}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.onGradient} />
        </Pressable>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerSubtitle}>
            Step {step} of {TOTAL_STEPS}
          </Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.stepsRow}>
        {stepLabels.map((label, index) => {
          const n = index + 1;
          const active = n === step;
          const done = n < step;
          return (
            <View key={label} style={styles.stepItem}>
              <View
                style={[
                  styles.stepNum,
                  active && styles.stepNumActive,
                  done && styles.stepNumDone,
                ]}
              >
                {done ? (
                  <Ionicons name="checkmark" size={12} color={colors.gradientStart} />
                ) : (
                  <Text style={[styles.stepNumText, active && styles.stepNumTextActive]}>{n}</Text>
                )}
              </View>
              <Text
                style={[styles.stepLabel, (active || done) && styles.stepLabelActive]}
                numberOfLines={1}
              >
                {label}
              </Text>
              {index < stepLabels.length - 1 ? (
                <View style={[styles.stepConnector, done && styles.stepConnectorDone]} />
              ) : null}
            </View>
          );
        })}
      </View>
    </LinearGradient>
  );
}

export default function EditListingScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const categories = useCategories('product');
  const listingId = route?.params?.listingId;
  const incoming = route?.params?.listing;

  const scrollRef = useRef(null);
  const titleRef = useRef(null);
  const descRef = useRef(null);
  const priceRef = useRef(null);
  const stockRef = useRef(null);
  const brandRef = useRef(null);
  const skuRef = useRef(null);
  const locationRef = useRef(null);

  const [loading, setLoading] = useState(Boolean(listingId));
  const [listingNotFound, setListingNotFound] = useState(false);
  const [step, setStep] = useState(1);
  const [pickingIndex, setPickingIndex] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);

  const [title, setTitle] = useState(incoming?.title || '');
  const [description, setDescription] = useState(incoming?.description || '');
  const [category, setCategory] = useState(incoming?.category || 'Mobiles');
  const [condition, setCondition] = useState(incoming?.condition || 'Good');
  const [price, setPrice] = useState(incoming?.price != null ? String(incoming.price) : '');
  const [location, setLocation] = useState(incoming?.location || '');
  const [meetup, setMeetup] = useState(incoming?.meetupOption || 'Public place');
  const [markSold, setMarkSold] = useState(incoming?.status === 'sold');

  const [sellerType, setSellerType] = useState(incoming?.sellerType || 'individual');
  const [userShop, setUserShop] = useState(null);
  const [stock, setStock] = useState('1');
  const [hasVariants, setHasVariants] = useState(false);
  const [variantOptions, setVariantOptions] = useState([]);
  const [variants, setVariants] = useState([]);
  const [brand, setBrand] = useState('');
  const [sku, setSku] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [isOnSale, setIsOnSale] = useState(false);

  const isShop = sellerType === 'shop';
  const stepLabels = isShop ? ['Photos', 'Details', 'Preview'] : ['Photos', 'Details', 'Meetup'];
  const headerTitle = isShop ? 'Edit Product' : 'Edit Listing';

  useEffect(() => {
    if (!listingId) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    (async () => {
      const { data, error } = await api.getListing(listingId);
      if (!active) return;

      if (error || !data?.listing) {
        setListingNotFound(true);
        setLoading(false);
        return;
      }

      const listing = data.listing;
      setTitle(listing.title || '');
      setDescription(listing.description || '');
      setCategory(listing.category || 'Mobiles');
      setCondition(listing.condition || 'Good');
      setPrice(listing.price != null ? String(listing.price) : '');
      setLocation(listing.location || '');
      setMeetup(listing.meetupOption || 'Public place');
      setMarkSold(listing.status === 'sold');
      setSellerType(listing.sellerType || 'individual');
      setStock(String(listing.stock ?? 1));
      setHasVariants(Boolean(listing.hasVariants));
      setVariantOptions(listing.variantOptions || []);
      setVariants(
        (listing.variants || []).map((variant, index) => ({
          ...variant,
          id: variant.id || `variant-${index + 1}`,
          price: variant.price != null ? String(variant.price) : '',
          stock: String(variant.stock ?? 0),
        })),
      );
      setBrand(listing.brand || '');
      setSku(listing.sku || '');
      setOriginalPrice(
        listing.originalPrice != null && listing.originalPrice !== ''
          ? String(listing.originalPrice)
          : '',
      );
      setIsOnSale(Boolean(listing.isOnSale));

      if (listing.shopId && typeof listing.shopId === 'object') {
        setUserShop({
          _id: listing.shopId._id,
          name: listing.shopId.name,
          category: listing.shopId.category,
          location: listing.shopId.location,
        });
      }

      setPhotos(
        hydrateMediaSlotsFromUris(listing.photos || [], {
          includeVideoSlot: listing.sellerType !== 'shop',
        }),
      );
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [listingId]);

  const mainPhoto = photos[0]?.type !== 'video' ? photos[0]?.uri ?? null : null;
  const extraPhotos = photos.slice(1);
  const photoCount = countListingPhotos(photos);
  const videoCount = countListingVideos(photos);

  const getCurrentLocation = useCallback(async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setAlertConfig(
          showErrorAlert({
            title: 'Location permission',
            message: 'Allow location access to auto-fill your city.',
            onConfirm: () => setAlertConfig(null),
          }),
        );
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const geocode = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      const addr = geocode?.[0];
      if (!addr) {
        setAlertConfig(
          showErrorAlert({
            title: 'Could not determine location',
            message: 'Please enter location manually.',
            onConfirm: () => setAlertConfig(null),
          }),
        );
        return;
      }
      setLocation(formatCityDistrict(addr, 'Kathmandu'));
    } catch {
      setAlertConfig(
        showErrorAlert({
          title: 'Location error',
          message: 'Could not fetch location. Please enter manually.',
          onConfirm: () => setAlertConfig(null),
        }),
      );
    } finally {
      setLocating(false);
    }
  }, []);

  const openMediaPreview = (index) => {
    const item = photos[index];
    if (item?.uri) setPreviewIndex(index);
  };

  const handleBack = () => {
    if (previewIndex != null) {
      setPreviewIndex(null);
      return;
    }
    if (alertConfig) {
      setAlertConfig(null);
      return;
    }
    if (step > 1) {
      setStep((value) => value - 1);
      return;
    }
    if (navigation.canGoBack()) navigation.goBack();
  };

  const pickPhoto = async (index) => {
    setPickingIndex(index);
    try {
      const uri = await pickListingPhoto(index === 0 ? 'main' : 'extra');
      if (!uri) return;
      setPhotos((prev) => {
        const next = [...(prev || [])];
        while (next.length <= index) next.push(null);
        next[index] = { id: `${Date.now()}-${index}`, uri, type: 'image' };
        return next.slice(0, isShop ? MAX_LISTING_PHOTOS : MAX_MEDIA_SLOTS);
      });
    } finally {
      setPickingIndex(null);
    }
  };

  const pickVideo = async (index) => {
    setPickingIndex(index);
    try {
      const result = await recordListingVideo();
      if (!result) return;
      setPhotos((prev) =>
        assignVideoSlot(prev, {
          id: `${Date.now()}-${VIDEO_SLOT_INDEX}`,
          uri: result.uri,
          duration: result.duration,
          type: 'video',
        }),
      );
    } finally {
      setPickingIndex(null);
    }
  };

  const removePhoto = (index) => {
    if (previewIndex === index) setPreviewIndex(null);
    setPhotos((prev) => {
      const next = [...(prev || [])];
      next[index] = null;
      return next;
    });
  };

  const validateStep1 = () => {
    if (!mainPhoto) {
      setAlertConfig(
        showErrorAlert({
          title: 'Main photo required',
          message: isShop
            ? 'Add a clear main photo for your product.'
            : 'Add a clear main photo for your listing.',
          onConfirm: () => setAlertConfig(null),
        }),
      );
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!title.trim()) {
      setAlertConfig(
        showErrorAlert({
          title: 'Title required',
          message: isShop ? 'Enter a product title.' : 'Enter a title for your item.',
          onConfirm: () => setAlertConfig(null),
        }),
      );
      return false;
    }
    if (!price.trim()) {
      setAlertConfig(
        showErrorAlert({
          title: 'Price required',
          message: 'Enter a price in NPR.',
          onConfirm: () => setAlertConfig(null),
        }),
      );
      return false;
    }
    return true;
  };

  const validateStep3 = () => {
    if (!isShop && !location.trim()) {
      setAlertConfig(
        showErrorAlert({
          title: 'Location required',
          message: 'Enter your location.',
          onConfirm: () => setAlertConfig(null),
        }),
      );
      return false;
    }
    return true;
  };

  const handleDelete = () => {
    if (!listingId) return;
    Alert.alert('Delete listing', 'Remove this listing permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await api.deleteListing(listingId);
          if (error) {
            Alert.alert('Could not delete', error);
            return;
          }
          navigation.goBack();
        },
      },
    ]);
  };

  const save = async () => {
    if (!listingId || submitting) return;

    setSubmitting(true);
    const localPhotos = mediaUrisFromSlots(photos);
    const uploaded = await uploadMediaUris(localPhotos, 'listings');
    if (uploaded.error) {
      setSubmitting(false);
      setAlertConfig(
        uploaded.isSafetyBlock || uploaded.errorCode
          ? showImageSafetyAlert({
              code: uploaded.errorCode,
              message: uploaded.error,
              issues: uploaded.issues,
              onConfirm: () => setAlertConfig(null),
            })
          : showErrorAlert({
              title: 'Photo Upload Failed',
              message: uploaded.error,
              onConfirm: () => setAlertConfig(null),
            })
      );
      return;
    }

    const parsedBasePrice = Number(String(price).replace(/[^\d]/g, '')) || 0;
    const payload = {
      title: title.trim(),
      description: description.trim(),
      category,
      condition,
      price,
      photos: uploaded.urls,
      markSold,
    };

    if (isShop) {
      payload.brand = brand.trim();
      payload.sku = sku.trim();
      payload.isOnSale = isOnSale;
      if (originalPrice.trim()) {
        payload.originalPrice = Number(String(originalPrice).replace(/[^\d]/g, '')) || null;
      }
      payload.hasVariants = hasVariants;
      if (hasVariants) {
        payload.variantOptions = variantOptions;
        payload.variants = normalizeVariantsForApi(variants, parsedBasePrice);
      } else {
        payload.stock = Number(stock) || 0;
      }
    } else {
      payload.location = location.trim();
      payload.meetupOption = meetup;
    }

    const { error } = await api.updateListing(listingId, payload);
    setSubmitting(false);

    if (error) {
      setAlertConfig(
        showErrorAlert({
          title: 'Could not save',
          message: error,
          onConfirm: () => setAlertConfig(null),
        }),
      );
      return;
    }
    navigation.goBack();
  };

  const goNext = async () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    if (step < TOTAL_STEPS) {
      setStep((value) => value + 1);
      return;
    }
    if (!validateStep3()) return;
    await save();
  };

  const previewPrice = useMemo(() => {
    const numeric = Number(String(price).replace(/[^\d]/g, ''));
    if (!numeric) return 'Rs —';
    if (isShop && hasVariants && variants.length) {
      const prices = variants
        .map((variant) => {
          const custom = Number(String(variant.price || '').replace(/[^\d]/g, ''));
          return Number.isFinite(custom) && custom > 0 ? custom : numeric;
        })
        .filter((value) => value > 0);
      if (prices.length) {
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        if (min !== max) {
          return `Rs ${min.toLocaleString('en-NP')} – ${max.toLocaleString('en-NP')}`;
        }
      }
    }
    return `Rs ${numeric.toLocaleString('en-NP')}`;
  }, [price, isShop, hasVariants, variants]);

  const previewStock = useMemo(() => {
    if (hasVariants) {
      return variants.reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0);
    }
    return Number(stock) || 0;
  }, [hasVariants, variants, stock]);

  if (!colors) return null;

  if (loading) {
    return (
      <View style={styles.root}>
        <ThemeStatusBar variant="header" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading listing…</Text>
        </View>
      </View>
    );
  }

  if (listingNotFound) {
    return (
      <View style={styles.root}>
        <ThemeStatusBar variant="header" />
        <EmptyState
          compact
          icon="alert-circle-outline"
          title="Listing not found"
          body="This listing may have been removed or is no longer available."
          buttonLabel="Go back"
          onButtonPress={() => navigation.goBack()}
        />
      </View>
    );
  }

  const renderStep1 = () => {
    if (isShop) {
      return (
        <>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>Product photos</Text>
              <Text style={styles.sectionHint}>Add a clear cover photo first</Text>
            </View>
            <View style={styles.countChip}>
              <Ionicons name="image" size={12} color={colors.primary} />
              <Text style={styles.countChipText}>
                {photoCount}/{MAX_LISTING_PHOTOS}
              </Text>
            </View>
          </View>

          {userShop ? (
            <View style={styles.shopInfoCard}>
              <Ionicons name="storefront" size={18} color={colors.primary} />
              <Text style={styles.shopInfoText} numberOfLines={1}>
                Editing for {userShop.name}
              </Text>
            </View>
          ) : null}

          <Pressable
            style={styles.mainPhotoBox}
            onPress={() => {
              if (photos[0]?.uri) openMediaPreview(0);
              else pickPhoto(0);
            }}
            disabled={pickingIndex === 0}
          >
            {mainPhoto ? (
              <>
                <Image source={{ uri: mainPhoto }} style={styles.mainPhotoImage} />
                <View style={styles.tapPreviewHint} pointerEvents="none">
                  <Ionicons name="expand-outline" size={14} color="#fff" />
                </View>
                <View style={styles.mainBadge} pointerEvents="none">
                  <Text style={styles.mainBadgeText}>Cover</Text>
                </View>
                <Pressable style={styles.removeBadge} onPress={() => removePhoto(0)} hitSlop={8}>
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </>
            ) : pickingIndex === 0 ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <View style={styles.mainPhotoEmpty}>
                <View style={styles.mainPhotoIconWrap}>
                  <Ionicons name="camera" size={26} color={colors.primary} />
                </View>
                <Text style={styles.mainPhotoTitle}>Add cover photo</Text>
                <Text style={styles.mainPhotoSub}>Showcase the product clearly</Text>
              </View>
            )}
          </Pressable>

          <View style={styles.extraRow}>
            {Array.from({ length: EXTRA_PHOTO_SLOTS }).map((_, index) => {
              const photo = extraPhotos[index];
              const slotIndex = index + 1;
              const loadingSlot = pickingIndex === slotIndex;

              return (
                <View key={index} style={styles.extraBox}>
                  {photo?.uri ? (
                    <>
                      <Pressable
                        style={styles.extraSlotFill}
                        onPress={() => openMediaPreview(slotIndex)}
                      >
                        <Image source={{ uri: photo.uri }} style={styles.extraPhotoImage} />
                        <View style={styles.extraPreviewHint} pointerEvents="none">
                          <Ionicons name="expand-outline" size={11} color="#fff" />
                        </View>
                      </Pressable>
                      <Pressable
                        style={styles.removeBadgeSmall}
                        onPress={() => removePhoto(slotIndex)}
                        hitSlop={8}
                      >
                        <Ionicons name="close" size={11} color="#fff" />
                      </Pressable>
                    </>
                  ) : loadingSlot ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Pressable style={styles.extraSlotFill} onPress={() => pickPhoto(slotIndex)}>
                      <Ionicons name="add" size={20} color={colors.primary} />
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        </>
      );
    }

    return (
      <>
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>Photos & video</Text>
            <Text style={styles.sectionHint}>Add a clear main photo first</Text>
          </View>
          <View style={styles.mediaCountRow}>
            <View style={styles.countChip}>
              <Ionicons name="image" size={12} color={colors.primary} />
              <Text style={styles.countChipText}>
                {photoCount}/{MAX_LISTING_PHOTOS}
              </Text>
            </View>
            <View style={[styles.countChip, styles.countChipVideo]}>
              <Ionicons name="videocam" size={12} color="#E53935" />
              <Text style={[styles.countChipText, { color: '#E53935' }]}>
                {videoCount}/{MAX_LISTING_VIDEOS}
              </Text>
            </View>
          </View>
        </View>

        <Pressable
          style={styles.mainPhotoBox}
          onPress={() => {
            if (photos[0]?.uri) openMediaPreview(0);
            else pickPhoto(0);
          }}
          disabled={pickingIndex === 0}
        >
          {mainPhoto ? (
            <>
              <Image source={{ uri: mainPhoto }} style={styles.mainPhotoImage} />
              <View style={styles.tapPreviewHint} pointerEvents="none">
                <Ionicons name="expand-outline" size={14} color="#fff" />
              </View>
              {photos[0]?.type === 'video' ? (
                <View style={styles.mainPlayOverlay} pointerEvents="none">
                  <View style={styles.mainPlayIcon}>
                    <Ionicons name="play" size={28} color="#fff" />
                  </View>
                </View>
              ) : null}
              <View style={styles.mainBadge} pointerEvents="none">
                <Text style={styles.mainBadgeText}>Cover</Text>
              </View>
              <Pressable style={styles.removeBadge} onPress={() => removePhoto(0)} hitSlop={8}>
                <Ionicons name="close" size={14} color="#fff" />
              </Pressable>
            </>
          ) : pickingIndex === 0 ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <View style={styles.mainPhotoEmpty}>
              <View style={styles.mainPhotoIconWrap}>
                <Ionicons name="camera" size={26} color={colors.primary} />
              </View>
              <Text style={styles.mainPhotoTitle}>Add cover photo</Text>
              <Text style={styles.mainPhotoSub}>Square, well-lit, item in focus</Text>
            </View>
          )}
        </Pressable>

        <View style={styles.extraRow}>
          {Array.from({ length: EXTRA_PHOTO_SLOTS + 1 }).map((_, index) => {
            const isVideoSlot = index === EXTRA_PHOTO_SLOTS;
            const photo = extraPhotos[index];
            const slotIndex = index + 1;
            const loadingSlot = pickingIndex === slotIndex;

            return (
              <View
                key={index}
                style={[styles.extraBox, isVideoSlot && styles.extraBoxVideo]}
              >
                {photo?.uri ? (
                  <>
                    <Pressable
                      style={styles.extraSlotFill}
                      onPress={() => openMediaPreview(slotIndex)}
                    >
                      {photo.type === 'video' ? (
                        <View style={[styles.extraPhotoImage, styles.extraVideoPlaceholder]}>
                          <Ionicons name="videocam" size={22} color="#E53935" />
                        </View>
                      ) : (
                        <Image source={{ uri: photo.uri }} style={styles.extraPhotoImage} />
                      )}
                      {photo.type === 'video' ? (
                        <View style={styles.extraPlayOverlay} pointerEvents="none">
                          <Ionicons name="play" size={14} color="#fff" />
                        </View>
                      ) : (
                        <View style={styles.extraPreviewHint} pointerEvents="none">
                          <Ionicons name="expand-outline" size={11} color="#fff" />
                        </View>
                      )}
                    </Pressable>
                    <Pressable
                      style={styles.removeBadgeSmall}
                      onPress={() => removePhoto(slotIndex)}
                      hitSlop={8}
                    >
                      <Ionicons name="close" size={11} color="#fff" />
                    </Pressable>
                  </>
                ) : loadingSlot ? (
                  <ActivityIndicator
                    size="small"
                    color={isVideoSlot ? '#E53935' : colors.primary}
                  />
                ) : isVideoSlot ? (
                  <Pressable
                    style={styles.extraSlotFill}
                    onPress={() => {
                      if (videoCount >= MAX_LISTING_VIDEOS) {
                        setAlertConfig(
                          showErrorAlert({
                            title: 'Video limit',
                            message: 'Only 1 video allowed. Remove existing first.',
                            onConfirm: () => setAlertConfig(null),
                          }),
                        );
                        return;
                      }
                      if (!mainPhoto) {
                        setAlertConfig(
                          showErrorAlert({
                            title: 'Cover photo first',
                            message: 'Add a cover photo before adding a video.',
                            onConfirm: () => setAlertConfig(null),
                          }),
                        );
                        return;
                      }
                      pickVideo(slotIndex);
                    }}
                  >
                    <Ionicons name="videocam" size={18} color="#E53935" />
                    <Text style={styles.extraVideoText}>Record</Text>
                    <Text style={styles.extraVideoHint}>Max {MAX_VIDEO_DURATION_SEC}s</Text>
                  </Pressable>
                ) : (
                  <Pressable style={styles.extraSlotFill} onPress={() => pickPhoto(slotIndex)}>
                    <Ionicons name="add" size={20} color={colors.primary} />
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      </>
    );
  };

  const renderCategoryChips = () => (
    <>
      <Text style={styles.fieldLabel}>Category</Text>
      <View style={styles.chipWrap}>
        {categories.map((cat) => {
          const categoryColor = cat.color || colors.primary;
          const active = category === cat.label;
          return (
            <Pressable
              key={cat.label}
              style={[
                styles.categoryChip,
                active && styles.categoryChipActive,
                active && { backgroundColor: categoryColor, borderColor: categoryColor },
              ]}
              onPress={() => setCategory(cat.label)}
            >
              {cat.imageUrl ? (
                <Image
                  source={{ uri: cat.imageUrl }}
                  style={{ width: 16, height: 16, borderRadius: 4 }}
                />
              ) : (
                <Ionicons
                  name={cat.icon}
                  size={16}
                  color={active ? colors.onPrimary : colors.textSecondary}
                />
              )}
              <Text
                style={[styles.categoryChipText, active && styles.categoryChipTextActive]}
              >
                {cat.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );

  const renderConditionChips = () => (
    <>
      <Text style={styles.fieldLabel}>Condition</Text>
      <View style={styles.chipWrap}>
        {CONDITIONS.map((cond) => {
          const active = condition === cond;
          return (
            <Pressable
              key={cond}
              style={[styles.categoryChip, active && styles.categoryChipActive]}
              onPress={() => setCondition(cond)}
            >
              <Text
                style={[styles.categoryChipText, active && styles.categoryChipTextActive]}
              >
                {cond}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );

  const renderStep2 = () => {
    if (isShop) {
      return (
        <>
          <Text style={styles.sectionTitle}>Product details</Text>
          <Text style={styles.sectionHint}>Price, stock, and what you are selling</Text>

          <FloatingField
            label="Product title"
            value={title}
            onChangeText={setTitle}
            placeholder="Product name"
            colors={colors}
            styles={styles}
            inputRef={titleRef}
          />

          <FloatingField
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Describe your product…"
            multiline
            colors={colors}
            styles={styles}
            inputRef={descRef}
          />

          {renderCategoryChips()}
          {renderConditionChips()}

          <View style={styles.priceRow}>
            <View style={styles.priceCol}>
              <FloatingField
                label="Price (NPR)"
                value={price}
                onChangeText={setPrice}
                placeholder="Selling price"
                keyboardType="numeric"
                colors={colors}
                styles={styles}
                inputRef={priceRef}
              />
            </View>
            {!hasVariants ? (
              <View style={styles.priceCol}>
                <FloatingField
                  label="Stock"
                  value={stock}
                  onChangeText={setStock}
                  placeholder="Qty"
                  keyboardType="numeric"
                  colors={colors}
                  styles={styles}
                  inputRef={stockRef}
                />
              </View>
            ) : null}
          </View>

          <VariantEditor
            category={category}
            basePrice={price}
            enabled={hasVariants}
            onToggleEnabled={(value) => {
              setHasVariants(value);
              if (!value) {
                setVariantOptions([]);
                setVariants([]);
              }
            }}
            variantOptions={variantOptions}
            onChangeVariantOptions={setVariantOptions}
            variants={variants}
            onChangeVariants={setVariants}
            colors={colors}
            styles={styles}
          />

          <FloatingField
            label="Original price (optional)"
            value={originalPrice}
            onChangeText={setOriginalPrice}
            placeholder="For comparison"
            keyboardType="numeric"
            colors={colors}
            styles={styles}
          />

          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>On sale</Text>
              <Text style={styles.toggleHint}>Show as a discounted product</Text>
            </View>
            <Switch
              value={isOnSale}
              onValueChange={setIsOnSale}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.surface}
            />
          </View>

          <FloatingField
            label="Brand (optional)"
            value={brand}
            onChangeText={setBrand}
            placeholder="Product brand"
            colors={colors}
            styles={styles}
            inputRef={brandRef}
          />

          <FloatingField
            label="SKU / product code (optional)"
            value={sku}
            onChangeText={setSku}
            placeholder="Product identifier"
            colors={colors}
            styles={styles}
            inputRef={skuRef}
          />
        </>
      );
    }

    return (
      <>
        <Text style={styles.sectionTitle}>Item details</Text>
        <Text style={styles.sectionHint}>Tell buyers what you are selling</Text>

        <FloatingField
          label="Title"
          value={title}
          onChangeText={setTitle}
          placeholder="What are you selling?"
          colors={colors}
          styles={styles}
          inputRef={titleRef}
        />

        <FloatingField
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Condition, age, reason for selling…"
          multiline
          colors={colors}
          styles={styles}
          inputRef={descRef}
        />

        {renderCategoryChips()}
        {renderConditionChips()}

        <FloatingField
          label="Price (NPR)"
          value={price}
          onChangeText={setPrice}
          placeholder="Enter price"
          keyboardType="numeric"
          colors={colors}
          styles={styles}
          inputRef={priceRef}
        />
      </>
    );
  };

  const renderMarkSoldToggle = () => (
    <View style={styles.toggleRow}>
      <View>
        <Text style={styles.toggleLabel}>Mark as sold</Text>
        <Text style={styles.toggleHint}>Hide this listing from other buyers</Text>
      </View>
      <Switch
        value={markSold}
        onValueChange={setMarkSold}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={colors.surface}
      />
    </View>
  );

  const renderStep3 = () => {
    if (isShop) {
      return (
        <>
          <Text style={styles.sectionTitle}>Preview & save</Text>
          <Text style={styles.sectionHint}>Check everything before saving changes</Text>

          {userShop ? (
            <View style={styles.shopCard}>
              <View style={styles.shopIcon}>
                <Ionicons name="storefront" size={22} color={colors.onPrimary} />
              </View>
              <View style={styles.shopInfo}>
                <Text style={styles.shopName}>{userShop.name}</Text>
                <Text style={styles.shopMeta}>
                  {userShop.category}
                  {userShop.location ? ` · ${userShop.location}` : ''}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.previewCard}>
            {mainPhoto ? (
              <Pressable onPress={() => openMediaPreview(0)}>
                <Image source={{ uri: mainPhoto }} style={styles.previewImage} />
              </Pressable>
            ) : null}
            <Text style={styles.previewTitle}>{title || 'Product title'}</Text>
            <Text style={styles.previewPrice}>{previewPrice}</Text>
            {originalPrice ? (
              <Text style={styles.previewOriginalPrice}>
                Original: Rs {Number(originalPrice).toLocaleString('en-NP')}
              </Text>
            ) : null}
            <View style={styles.previewMeta}>
              <View style={styles.previewMetaItem}>
                <Ionicons name="cube-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.previewMetaText}>
                  Stock {previewStock}
                  {hasVariants && variants.length ? ` · ${variants.length} variants` : ''}
                </Text>
              </View>
              {brand ? (
                <View style={styles.previewMetaItem}>
                  <Ionicons name="pricetag-outline" size={14} color={colors.textSecondary} />
                  <Text style={styles.previewMetaText}>{brand}</Text>
                </View>
              ) : null}
              <View style={styles.previewMetaItem}>
                <Ionicons name="shield-checkmark-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.previewMetaText}>{condition}</Text>
              </View>
            </View>
          </View>

          {renderMarkSoldToggle()}

          <Pressable style={styles.deleteBtn} onPress={handleDelete}>
            <Text style={styles.deleteText}>Delete listing</Text>
          </Pressable>
        </>
      );
    }

    return (
      <>
        <Text style={styles.sectionTitle}>Location & meetup</Text>
        <Text style={styles.sectionHint}>Meet in a public place when you can</Text>

        <FloatingField
          label="Location"
          value={location}
          onChangeText={setLocation}
          placeholder="City or area"
          right={
            <Pressable onPress={getCurrentLocation} disabled={locating} style={styles.locBtn}>
              {locating ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="locate" size={20} color={colors.primary} />
              )}
            </Pressable>
          }
          colors={colors}
          styles={styles}
          inputRef={locationRef}
        />

        <Text style={styles.fieldLabel}>Meetup option</Text>
        <View style={styles.chipWrap}>
          {MEETUP_OPTIONS.map((option) => {
            const active = meetup === option;
            return (
              <Pressable
                key={option}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                onPress={() => setMeetup(option)}
              >
                <Text
                  style={[styles.categoryChipText, active && styles.categoryChipTextActive]}
                >
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.previewCard}>
          <Text style={styles.previewEyebrow}>Preview</Text>
          {mainPhoto ? (
            <Pressable onPress={() => openMediaPreview(0)}>
              <Image source={{ uri: mainPhoto }} style={styles.previewImage} />
            </Pressable>
          ) : null}
          <Text style={styles.previewItemTitle}>{title || 'Item title'}</Text>
          <Text style={styles.previewPrice}>{previewPrice}</Text>
          <Text style={styles.previewLocation}>
            {location || 'Location'} · {condition}
          </Text>
        </View>

        {renderMarkSoldToggle()}

        <Pressable style={styles.deleteBtn} onPress={handleDelete}>
          <Text style={styles.deleteText}>Delete listing</Text>
        </Pressable>
      </>
    );
  };

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <ProgressHeader
        step={step}
        insets={insets}
        onBack={handleBack}
        colors={colors}
        styles={styles}
        title={headerTitle}
        stepLabels={stepLabels}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </ScrollView>

        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable style={styles.continueBtn} onPress={goNext} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.continueBtnText}>
                {step === TOTAL_STEPS ? 'Save changes' : 'Continue'}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <ListingMediaPreview
        visible={previewIndex != null}
        item={previewIndex != null ? photos[previewIndex] : null}
        onClose={() => setPreviewIndex(null)}
      />

      <AlertModal
        visible={!!alertConfig}
        onClose={() => setAlertConfig(null)}
        {...(alertConfig || {})}
      />
    </View>
  );
}

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: { flex: 1 },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: colors.textSecondary,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  headerTitles: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.onGradient,
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    backgroundColor: 'transparent',
  },
  stepNumActive: {
    backgroundColor: colors.surface,
    borderColor: colors.surface,
  },
  stepNumDone: {
    backgroundColor: colors.surface,
    borderColor: colors.surface,
  },
  stepNumText: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.85)',
  },
  stepNumTextActive: {
    color: colors.gradientStart,
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
  },
  stepLabelActive: {
    color: colors.onGradient,
  },
  stepConnector: {
    position: 'absolute',
    top: 11,
    left: '62%',
    right: '-38%',
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  stepConnectorDone: {
    backgroundColor: colors.surface,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  sectionHint: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: 12,
  },
  mediaCountRow: {
    flexDirection: 'row',
    gap: 6,
  },
  countChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: colors.iconBackground,
  },
  countChipVideo: {
    backgroundColor: 'rgba(229, 57, 53, 0.1)',
  },
  countChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  shopInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shopInfoText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  mainPhotoBox: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.iconBackground,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainPhotoImage: {
    width: '100%',
    height: '100%',
  },
  mainPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainPlayIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  mainBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  removeBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  tapPreviewHint: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  mainPhotoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  mainPhotoIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mainPhotoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  mainPhotoSub: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  extraRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  extraBox: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.iconBackground,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraBoxVideo: {
    borderColor: 'rgba(229, 57, 53, 0.35)',
    backgroundColor: 'rgba(229, 57, 53, 0.06)',
  },
  extraPhotoImage: {
    width: '100%',
    height: '100%',
  },
  extraVideoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  extraPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBadgeSmall: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  extraPreviewHint: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraSlotFill: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  extraVideoText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#E53935',
  },
  extraVideoHint: {
    fontSize: 8,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 8,
    marginTop: 4,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: colors.iconBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  categoryChipTextActive: {
    color: colors.onPrimary,
  },
  priceRow: {
    flexDirection: 'row',
    gap: 10,
  },
  priceCol: {
    flex: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  toggleHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  floatingWrap: {
    marginBottom: 14,
  },
  floatingLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  floatingInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  floatingInputRowMultiline: {
    alignItems: 'flex-start',
    paddingTop: 12,
  },
  floatingInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  floatingTextarea: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  locBtn: {
    paddingLeft: 8,
  },
  shopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shopIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  shopInfo: {
    flex: 1,
  },
  shopName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  shopMeta: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  previewCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    marginTop: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  previewImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginBottom: 12,
  },
  previewItemTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  previewPrice: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 4,
  },
  previewOriginalPrice: {
    fontSize: 14,
    color: colors.textSecondary,
    textDecorationLine: 'line-through',
    marginBottom: 8,
  },
  previewLocation: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  previewMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  previewMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  previewMetaText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  deleteBtn: {
    marginTop: 8,
    marginBottom: 8,
    alignItems: 'center',
    paddingVertical: 12,
  },
  deleteText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.danger,
  },
  bottomBar: {
    backgroundColor: colors.surface,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  continueBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.onPrimary,
  },
  variantCard: {
    marginBottom: 20,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  variantToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  variantToggleCopy: { flex: 1 },
  variantTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  variantHint: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  variantOptionBlock: { marginTop: 14 },
  variantValueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  variantValueChipText: { fontSize: 12, fontWeight: '600', color: colors.text },
  optionInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  optionInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: colors.background,
  },
  optionAddBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  suggestionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  suggestionChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  suggestionChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft || `${colors.primary}18`,
  },
  suggestionChipText: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  suggestionChipTextActive: { color: colors.primary },
  generateBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft || `${colors.primary}18`,
  },
  generateBtnText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  variantRowsWrap: { marginTop: 14, gap: 10 },
  variantRowsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  variantRowsTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  variantRowsMeta: { fontSize: 12, color: colors.textSecondary },
  variantRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    backgroundColor: colors.background,
  },
  variantRowLabel: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 8 },
  variantRowFields: { flexDirection: 'row', gap: 8 },
  variantFieldCol: { width: 88 },
  variantFieldColWide: { flex: 1 },
  variantFieldLabel: { fontSize: 11, color: colors.textSecondary, marginBottom: 4 },
  variantFieldInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  variantEmptyText: { marginTop: 12, fontSize: 12, color: colors.textSecondary },
});
