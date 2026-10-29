import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import {
  ActivityIndicator,
  Image,
  Alert,
  Keyboard,
  ScrollView,
  StyleSheet,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormScroll, revealFocusedInput, scrollFieldToTop, useKeyboardHeight } from '../components/FormScroll';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { uploadMediaUris } from '../utils/mediaUpload';
import { useTheme, useThemedStyles, ThemeStatusBar, formFieldStyles, FORM_ERROR_COLOR } from '../theme';
import {
  noteUserListedCategory,
  refreshUserCategoryRank,
  useCategories,
  withCategoryFirst,
} from '../utils/categories';
import { getHomePlace, loadHomeListingsCache } from '../utils/homeListingsCache';
import { formatCityDistrict } from '../utils/locations';
import { coordinatesForPlace, resolveMediaUrl } from '../utils/listing';
import { AlertModal, showErrorAlert, showImageSafetyAlert } from '../components/AlertModal';
import ListingMediaPreview from '../components/ListingMediaPreview';
import SearchWordsField from '../components/SearchWordsField';
import { priceWarning, useListingAiFill, USED_PRICE_SHARE } from '../hooks/useListingAiFill';
import { AiFillButton, AiFillNotice } from '../components/AiFillStatus';
import PostQuotaBanner from '../components/PostQuotaBanner';
import TesterModeButton from '../components/TesterModeButton';
import PostLimitModal from '../components/PostLimitModal';
import { usePostQuota } from '../hooks/usePostQuota';
import {
  EXTRA_PHOTO_SLOTS,
  hydrateMediaSlotsFromUris,
  MAX_LISTING_PHOTOS,
  MAX_LISTING_VIDEOS,
  pickListingPhoto,
  recordListingVideo,
  MAX_VIDEO_DURATION_SEC,
} from '../utils/listingPhotos';

function resolveColor(colorRef, colors) {
  if (typeof colorRef === 'string' && colorRef.startsWith('colors.')) {
    const colorKey = colorRef.replace('colors.', '');
    return colors[colorKey] || colorRef;
  }
  return colorRef;
}

const VIDEO_SLOT_INDEX = EXTRA_PHOTO_SLOTS + 1;
const MAX_MEDIA_SLOTS = MAX_LISTING_PHOTOS + MAX_LISTING_VIDEOS;

function countListingPhotos(items) {
  return (items || []).filter((item) => item && item.type !== 'video').length;
}

function countListingVideos(items) {
  return (items || []).filter((item) => item?.type === 'video').length;
}

function assignVideoSlot(prev, videoItem) {
  const withoutVideo = (prev || []).filter((item) => item?.type !== 'video');
  const next = [...withoutVideo];
  while (next.length < VIDEO_SLOT_INDEX) {
    next.push(null);
  }
  next[VIDEO_SLOT_INDEX] = videoItem;
  return next.slice(0, MAX_MEDIA_SLOTS);
}

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
  anchorRef,
  error,
  onFocus,
}) {
  return (
    <View ref={anchorRef} collapsable={false} style={styles.floatingWrap}>
      <Text style={styles.floatingLabel}>{label}</Text>
      <View
        style={[
          styles.floatingInputRow,
          multiline && styles.floatingInputRowMultiline,
          error && styles.floatingInputError,
        ]}
      >
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          multiline={multiline}
          keyboardType={keyboardType}
          style={[styles.floatingInput, multiline && styles.floatingTextarea]}
        />
        {right}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function CompactHeader({ insets, onBack, colors, styles, title }) {
  return (
    <LinearGradient
      colors={colors.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[styles.header, { paddingTop: insets.top + 6 }]}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
          <Icon name="chevron-back" size={22} color={colors.onGradient} />
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.headerSpacer}>
          <TesterModeButton style={styles.testerBtn} />
        </View>
      </View>
    </LinearGradient>
  );
}

function pinFromListing(listing) {
  const point = listing?.coordinates;
  if (point?.lat == null || point?.lng == null) return null;
  return { lat: Number(point.lat), lng: Number(point.lng) };
}

function pinFromPlace(place) {
  const point = place?.coords;
  if (point?.lat == null || point?.lng == null) return null;
  return { lat: Number(point.lat), lng: Number(point.lng) };
}

/** Pass `editListing` (a loaded listing) to reuse this form for editing. */
export default function IndividualPostListingScreen({ navigation, editListing = null }) {
  const listingId = editListing?.id || editListing?._id || null;
  const isEdit = Boolean(listingId);
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const allCategories = useCategories('product');
  const [aiCategory, setAiCategory] = useState(null);
  const categories = useMemo(
    () => withCategoryFirst(allCategories, aiCategory?.label, aiCategory),
    [allCategories, aiCategory]
  );
  const chipScrollRef = useRef(null);
  const scrollRef = useRef(null);
  const photoAnchorRef = useRef(null);
  const titleAnchorRef = useRef(null);
  const priceAnchorRef = useRef(null);
  const locationAnchorRef = useRef(null);
  const searchAnchorRef = useRef(null);
  const titleRef = useRef(null);
  const descAnchorRef = useRef(null);
  const descRef = useRef(null);
  const priceRef = useRef(null);
  const locationRef = useRef(null);
  const keyboardHeight = useKeyboardHeight();
  const [fieldErrors, setFieldErrors] = useState({});
  const [pickingIndex, setPickingIndex] = useState(null);
  const [photos, setPhotos] = useState(() =>
    isEdit ? hydrateMediaSlotsFromUris(editListing.photos || [], { includeVideoSlot: true }) : []
  );
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(null);
  const [title, setTitle] = useState(editListing?.title || '');
  const [description, setDescription] = useState(editListing?.description || '');
  const [searchWords, setSearchWords] = useState(
    Array.isArray(editListing?.searchWords) ? editListing.searchWords : []
  );
  const [category, setCategory] = useState(editListing?.category || 'Mobiles');
  const categoryTouchedRef = useRef(isEdit);
  const [condition, setCondition] = useState(editListing?.condition || 'Good');
  const [price, setPrice] = useState(editListing?.price != null ? String(editListing.price) : '');
  const priceTextRef = useRef(price);
  priceTextRef.current = price;
  const [location, setLocation] = useState(
    () => editListing?.location || (isEdit ? '' : getHomePlace()?.location || '')
  );
  const [pin, setPin] = useState(() => pinFromListing(editListing) || (isEdit ? null : pinFromPlace(getHomePlace())));
  const [negotiable, setNegotiable] = useState(true);
  const [meetup, setMeetup] = useState(editListing?.meetupOption || 'Public place');
  const [markSold, setMarkSold] = useState(editListing?.status === 'sold');
  const { quota, blocked: quotaBlocked, reload: reloadQuota, setQuota } = usePostQuota('individual', { enabled: !isEdit });
  const [limitModal, setLimitModal] = useState(false);

  /** True when today's posts are used up; opens the limit modal instead of the picker. */
  const checkPostLimit = useCallback(async () => {
    if (isEdit || !quotaBlocked) return false;
    const fresh = await reloadQuota();
    if (fresh && (fresh.unlimited || fresh.remaining > 0)) return false;
    Keyboard.dismiss();
    setLimitModal(true);
    return true;
  }, [isEdit, quotaBlocked, reloadQuota]);

  const getCurrentLocation = useCallback(async ({ silent = false } = {}) => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (!silent) {
          setAlertConfig(
            showErrorAlert({
              title: 'Location permission',
              message: 'Allow location access to auto-fill your city.',
              onConfirm: () => setAlertConfig(null),
            })
          );
        }
        return;
      }
      const last = await Location.getLastKnownPositionAsync();
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }).catch(() => last);
      const coords = loc?.coords || last?.coords;
      if (!coords) {
        if (!silent) {
          setAlertConfig(
            showErrorAlert({
              title: 'Could not determine location',
              message: 'Please enter location manually.',
              onConfirm: () => setAlertConfig(null),
            })
          );
        }
        return;
      }
      const geocode = await Location.reverseGeocodeAsync({
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      const addr = geocode?.[0];
      if (!addr) {
        if (!silent) {
          setAlertConfig(
            showErrorAlert({
              title: 'Could not determine location',
              message: 'Please enter location manually.',
              onConfirm: () => setAlertConfig(null),
            })
          );
        }
        return;
      }
      setLocation(formatCityDistrict(addr, 'Kathmandu'));
      setPin({ lat: coords.latitude, lng: coords.longitude });
    } catch (e) {
      if (!silent) {
        setAlertConfig(
          showErrorAlert({
            title: 'Location error',
            message: 'Could not fetch location. Please enter manually.',
            onConfirm: () => setAlertConfig(null),
          })
        );
      }
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    if (categoryTouchedRef.current) return;
    const first = categories[0]?.label;
    if (first) setCategory(first);
  }, [categories]);

  const autoLocationRef = useRef(false);
  useEffect(() => {
    if (autoLocationRef.current) return;
    autoLocationRef.current = true;
    if (isEdit && editListing?.location) return;

    const applyPlace = (place) => {
      if (!place?.location) return false;
      setLocation(place.location);
      const nextPin = pinFromPlace(place);
      if (nextPin) setPin(nextPin);
      return true;
    };

    if (applyPlace(getHomePlace())) return;

    let cancelled = false;
    loadHomeListingsCache().then((cache) => {
      if (cancelled) return;
      if (applyPlace(cache)) return;
      getCurrentLocation({ silent: true });
    });
    return () => {
      cancelled = true;
    };
  }, [getCurrentLocation, isEdit, editListing?.location]);

  const mainPhoto = photos[0]?.type !== 'video' ? photos[0]?.uri ?? null : null;
  const extraPhotos = photos.slice(1);
  const photoCount = countListingPhotos(photos);
  const videoCount = countListingVideos(photos);

  const openMediaPreview = (index) => {
    const item = photos[index];
    if (item?.uri) setPreviewIndex(index);
  };

  const handleBack = () => {
    if (previewIndex != null) {
      setPreviewIndex(null);
      return;
    }
    if (limitModal) {
      setLimitModal(false);
      return;
    }
    if (alertConfig) {
      setAlertConfig(null);
      return;
    }
    if (navigation.getState?.()?.type === 'tab') {
      navigation.navigate('Home');
      return;
    }
    if (navigation.canGoBack()) navigation.goBack();
  };

  const requireCover = () => {
    if (mainPhoto) return true;
    Keyboard.dismiss();
    setFieldErrors((current) => ({ ...current, photo: 'Add a cover photo first' }));
    revealField(photoAnchorRef);
    return false;
  };

  const pickPhoto = useCallback(async (index) => {
    console.log('pickPhoto called, index:', index);
    if (index !== 0 && !requireCover()) return;
    if (index === 0 && !mainPhoto && (await checkPostLimit())) return;
    setPickingIndex(index);
    let pickedUri = null;
    try {
      console.log('Calling pickListingPhoto...');
      const uri = await pickListingPhoto(index === 0 ? 'main' : 'extra');
      console.log('pickListingPhoto returned:', uri);
      if (!uri) {
        setPickingIndex(null);
        return;
      }
      pickedUri = uri;
      if (index === 0) clearFieldError('photo');
      setPhotos((prev) => {
        const next = [...(prev || [])];
        while (next.length <= index) next.push(null);
        next[index] = { id: `${Date.now()}-${index}`, uri, type: 'image' };
        return next.slice(0, MAX_MEDIA_SLOTS);
      });
    } catch (error) {
      console.error('Error picking photo:', error);
      setAlertConfig(
        showErrorAlert({
          title: 'Photo selection failed',
          message: 'Could not select photo. Please try again.',
          onConfirm: () => setAlertConfig(null),
        })
      );
    } finally {
      setPickingIndex(null);
    }
    if (index === 0 && pickedUri && !isEdit) {
      // Open the keyboard for price only once AI is done, so it does not jump while the photo is read.
      const focusPrice = () => {
        if (priceTextRef.current.trim() || TextInput.State?.currentlyFocusedInput?.()) return;
        revealField(priceAnchorRef, priceRef);
      };
      if (ai.limitReached) {
        setTimeout(focusPrice, 350);
      } else {
        aiFillDetails({ silent: true, photoUri: pickedUri, onlyEmpty: true }).then((result) => {
          if (result !== 'blocked') setTimeout(focusPrice, 250);
        });
      }
    }
  }, [requireCover, clearFieldError, revealField, priceAnchorRef, priceRef, ai, aiFillDetails, isEdit, mainPhoto, checkPostLimit]);

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

  const ai = useListingAiFill({
    categories,
    conditions: CONDITIONS,
    fields: {
      setTitle,
      setDescription,
      setSearchWords,
      setCategory: (value, item) => {
        categoryTouchedRef.current = true;
        setCategory(value);
        setAiCategory(item || { label: value, icon: 'pricetag-outline', color: colors.primary });
        chipScrollRef.current?.scrollTo({ x: 0, animated: true });
      },
      setCondition,
      setPrice,
    },
    onTitleFilled: () => clearFieldError('title'),
    onRemoveFlaggedPhoto: (flaggedUri) => {
      if (previewIndex != null) setPreviewIndex(null);
      setPhotos((prev) => (prev || []).map((item) => (item?.uri === flaggedUri ? null : item)));
      setFieldErrors((current) => ({ ...current, photo: 'Choose another photo' }));
    },
    setAlertConfig,
  });
  const priceNotice = priceWarning(price, ai.aiPrice);
  const imageFlag =
    ai.imageFlag && photos.some((item) => item?.uri === ai.imageFlag.uri)
      ? { issue: ai.imageFlag.issue, reason: ai.imageFlag.reason }
      : null;

  const aiFillDetails = (options = {}) =>
    ai.fill({
      ...options,
      photoUri:
        options.photoUri ||
        mainPhoto ||
        photos.find((item) => item?.type !== 'video' && item?.uri)?.uri ||
        null,
    });

  const clearFieldError = (key) => {
    setFieldErrors((current) => (current[key] ? { ...current, [key]: '' } : current));
  };

  const revealField = (anchorRef, inputRef) => {
    const run = () => scrollFieldToTop(scrollRef, anchorRef);
    setTimeout(run, 50);
    setTimeout(run, 280);
    if (inputRef) setTimeout(() => inputRef.current?.focus?.(), 40);
  };

  const focusField = () => {
    setTimeout(() => revealFocusedInput(scrollRef), 120);
  };

  const publish = async () => {
    if (submitting) return;
    if (await checkPostLimit()) return;
    const next = {};
    if (!mainPhoto) next.photo = 'Add a cover photo';
    if (!title.trim()) next.title = 'Enter a title';
    if (!price.trim()) next.price = 'Enter a price';
    if (!location.trim()) next.location = 'Enter a location';
    setFieldErrors(next);
    if (next.photo) {
      Keyboard.dismiss();
      revealField(photoAnchorRef);
      return;
    }
    if (next.title) {
      revealField(titleAnchorRef, titleRef);
      return;
    }
    if (next.price) {
      revealField(priceAnchorRef, priceRef);
      return;
    }
    if (next.location) {
      revealField(locationAnchorRef, locationRef);
      return;
    }
    setSubmitting(true);

    const localPhotos = photos.filter((item) => item?.uri).map((item) => item.uri);
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

    const payload = {
      title: title.trim(),
      description: description.trim(),
      searchWords,
      price,
      category,
      condition,
      photos: uploaded.urls,
      location: location.trim(),
      coordinates: coordinatesForPlace(pin, location),
      meetupOption: meetup,
      ...(ai.aiPrice ? { priceEstimate: ai.aiPrice } : {}),
      ...(imageFlag ? { imageFlag } : {}),
    };

    if (isEdit) {
      const { data: saved, error } = await api.updateListing(listingId, { ...payload, markSold });
      setSubmitting(false);
      if (error) {
        setAlertConfig(
          showErrorAlert({
            title: 'Could not save',
            message: error,
            onConfirm: () => setAlertConfig(null),
          })
        );
        return;
      }
      noteUserListedCategory(category);
      refreshUserCategoryRank({ force: true }).catch(() => {});
      if (saved?.moderation?.status === 'pending') {
        setAlertConfig(manualReviewAlert(saved.moderation.reason, () => navigation.goBack()));
        return;
      }
      navigation.goBack();
      return;
    }

    const { data, error } = await api.createListing({ ...payload, sellerType: 'individual' });

    setSubmitting(false);
    if (data?.code === 'DAILY_LISTING_LIMIT') {
      if (data.quota) setQuota(data.quota);
      Keyboard.dismiss();
      setLimitModal(true);
      return;
    }
    if (error) {
      const isProhibited = /prohibited|weapon|gun|restricted/i.test(String(error));
      setAlertConfig(
        showErrorAlert({
          title: isProhibited ? 'Listing not allowed' : 'Could not post listing',
          message: isProhibited
            ? `${error}\n\nWeapons, adult content, and other prohibited items cannot be listed on KinBech.`
            : error,
          onConfirm: () => setAlertConfig(null),
        })
      );
      return;
    }
    noteUserListedCategory(category);
    refreshUserCategoryRank({ force: true }).catch(() => {});
    reloadQuota();
    const inReview = data.moderation?.status === 'pending' || data.listing?.status === 'pending';
    const openMyListings = () =>
      navigation.reset({
        index: 1,
        routes: [
          { name: ROUTES.MAIN_TABS, params: { screen: ROUTES.HOME } },
          { name: ROUTES.MY_LISTINGS, params: { initialTab: inReview ? 'pending' : 'active' } },
        ],
      });
    if (data.moderation?.status === 'pending') {
      setAlertConfig(manualReviewAlert(data.moderation.reason, openMyListings));
      return;
    }
    setAlertConfig(postedAlert(inReview, openMyListings));
  };

  const postedAlert = (inReview, onDone) => {
    const done = () => {
      setAlertConfig(null);
      onDone();
    };
    return {
      type: 'success',
      title: inReview ? 'Sent for review' : 'Listing is live!',
      message: inReview
        ? 'It goes live after a quick check. You can see it in My Listings.'
        : 'Buyers nearby can see it now. You can manage it in My Listings.',
      primaryButton: { text: 'OK' },
      onClose: done,
    };
  };

  const manualReviewAlert = (reason, onDone) => {
    const done = () => {
      setAlertConfig(null);
      onDone();
    };
    return {
      type: 'warning',
      title: 'Sent for manual review',
      message: `${String(reason || '').replace(/\s*Held for manual review\.?\s*$/i, '').trim()}\n\nYour listing will go live after our team checks it.`.trim(),
      primaryButton: { text: 'OK' },
      onClose: done,
    };
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

  if (!colors) return null;

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <CompactHeader
        insets={insets}
        onBack={handleBack}
        colors={colors}
        styles={styles}
        title={isEdit ? 'Edit listing' : 'Sell item'}
      />

      <View style={styles.flex}>
        <FormScroll
          ref={scrollRef}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 12 }]}
        >
          {!isEdit ? (
            <PostQuotaBanner quota={quota} onUpgrade={() => navigation.navigate(ROUTES.SUBSCRIPTION)} />
          ) : null}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Photos</Text>
            <View style={styles.mediaCountRow}>
              <View style={styles.countChip}>
                <Icon name="image" size={11} color={colors.primary} />
                <Text style={styles.countChipText}>
                  {photoCount}/{MAX_LISTING_PHOTOS}
                </Text>
              </View>
              <View style={[styles.countChip, styles.countChipVideo]}>
                <Icon name="videocam" size={11} color="#E53935" />
                <Text style={[styles.countChipText, { color: '#E53935' }]}>
                  {videoCount}/{MAX_LISTING_VIDEOS}
                </Text>
              </View>
              <AiFillButton filling={ai.filling} onPress={() => aiFillDetails()} />
            </View>
          </View>
          <AiFillNotice filling={ai.filling} error={ai.error} />

          <View ref={photoAnchorRef} collapsable={false}>
          <View style={styles.photoRow}>
            <Pressable
              style={[
                styles.photoSlot,
                styles.photoSlotCover,
                fieldErrors.photo && styles.photoSlotCoverError,
              ]}
              onPress={() => {
                console.log('Cover photo pressed, hasPhoto:', !!photos[0]?.uri);
                if (photos[0]?.uri) openMediaPreview(0);
                else pickPhoto(0);
              }}
              disabled={pickingIndex === 0}
            >
              {mainPhoto ? (
                <>
                  <Image source={{ uri: resolveMediaUrl(mainPhoto) }} style={styles.slotImage} resizeMode="cover" />
                  <View style={styles.coverBadge} pointerEvents="none">
                    <Text style={styles.coverBadgeText}>Cover</Text>
                  </View>
                  <Pressable style={styles.removeBadge} onPress={() => removePhoto(0)} hitSlop={6}>
                    <Icon name="close" size={12} color="#fff" />
                  </Pressable>
                </>
              ) : pickingIndex === 0 ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  <Icon name="camera" size={20} color={colors.primary} />
                  <Text style={styles.slotLabel}>Cover</Text>
                </>
              )}
            </Pressable>

            {Array.from({ length: EXTRA_PHOTO_SLOTS + 1 }).map((_, index) => {
              const isVideoSlot = index === EXTRA_PHOTO_SLOTS;
              const photo = extraPhotos[index];
              const slotIndex = index + 1;
              const loading = pickingIndex === slotIndex;

              return (
                <View
                  key={index}
                  style={[styles.photoSlot, isVideoSlot && styles.photoSlotVideo]}
                >
                  {photo?.uri ? (
                    <>
                      <Pressable style={styles.slotFill} onPress={() => openMediaPreview(slotIndex)}>
                        {photo.type === 'video' ? (
                          <View style={styles.videoFill}>
                            <Icon name="play" size={16} color="#fff" />
                          </View>
                        ) : (
                          <Image source={{ uri: resolveMediaUrl(photo.uri) }} style={styles.slotImage} />
                        )}
                      </Pressable>
                      <Pressable
                        style={styles.removeBadge}
                        onPress={() => removePhoto(slotIndex)}
                        hitSlop={6}
                      >
                        <Icon name="close" size={11} color="#fff" />
                      </Pressable>
                    </>
                  ) : loading ? (
                    <ActivityIndicator size="small" color={isVideoSlot ? '#E53935' : colors.primary} />
                  ) : isVideoSlot ? (
                    <Pressable
                      style={styles.slotFill}
                      onPress={() => {
                        if (videoCount >= MAX_LISTING_VIDEOS) {
                          setAlertConfig(
                            showErrorAlert({
                              title: 'Video limit',
                              message: 'Only 1 video allowed. Remove existing first.',
                              onConfirm: () => setAlertConfig(null),
                            })
                          );
                          return;
                        }
                        if (!requireCover()) return;
                        pickVideo(slotIndex);
                      }}
                    >
                      <Icon name="videocam" size={16} color="#E53935" />
                      <Text style={styles.videoLabel}>{MAX_VIDEO_DURATION_SEC}s</Text>
                    </Pressable>
                  ) : (
                    <Pressable style={styles.slotFill} onPress={() => pickPhoto(slotIndex)}>
                      <Icon name="add" size={18} color={colors.primary} />
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
          {fieldErrors.photo ? <Text style={styles.fieldError}>{fieldErrors.photo}</Text> : null}
          </View>

          <View style={styles.pairRow}>
            <View style={styles.pairGrow}>
              <FloatingField
                label="Title"
                value={title}
                onChangeText={(text) => {
                  setTitle(text);
                  clearFieldError('title');
                }}
                placeholder="What are you selling?"
                colors={colors}
                styles={styles}
                inputRef={titleRef}
                anchorRef={titleAnchorRef}
                error={fieldErrors.title}
                onFocus={focusField}
              />
            </View>
            <View style={styles.pairPrice}>
              <FloatingField
                label="Price (NPR)"
                value={price}
                onChangeText={(text) => {
                  setPrice(text);
                  clearFieldError('price');
                }}
                placeholder="Price"
                keyboardType="numeric"
                colors={colors}
                styles={styles}
                inputRef={priceRef}
                anchorRef={priceAnchorRef}
                error={fieldErrors.price}
                onFocus={focusField}
              />
            </View>
          </View>
          {priceNotice ? (
            <Text style={styles.priceWarn}>{priceNotice}</Text>
          ) : ai.aiPrice && price.trim() === String(ai.aiPrice) ? (
            <Text style={styles.aiHint}>
              {ai.aiNewPrice && USED_PRICE_SHARE[condition]
                ? `AI: ${USED_PRICE_SHARE[condition] * 100}% of new price NPR ${ai.aiNewPrice.toLocaleString('en-IN')}, editable`
                : 'AI suggested, editable'}
            </Text>
          ) : null}

          <FloatingField
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Condition, age, and what is included"
            multiline
            colors={colors}
            styles={styles}
            inputRef={descRef}
            anchorRef={descAnchorRef}
            onFocus={focusField}
          />

          <View ref={searchAnchorRef} collapsable={false}>
            <SearchWordsField
              words={searchWords}
              onChange={setSearchWords}
              onFocus={focusField}
            />
          </View>

          <Text style={styles.fieldLabel}>Category</Text>
          <ScrollView
            ref={chipScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={styles.chipScroll}
            contentContainerStyle={styles.chipScrollContent}
          >
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
                  onPress={() => {
                    categoryTouchedRef.current = true;
                    setCategory(cat.label);
                  }}
                >
                  {cat.imageUrl ? (
                    <Image source={{ uri: cat.imageUrl }} style={styles.catIcon} />
                  ) : (
                    <Icon
                      name={cat.icon}
                      size={13}
                      color={active ? colors.onPrimary : colors.textSecondary}
                    />
                  )}
                  <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.conditionRow}>
            <View style={styles.conditionCol}>
              <Text style={styles.fieldLabel}>Condition</Text>
              <View style={styles.segmentRow}>
                {CONDITIONS.map((cond) => {
                  const active = condition === cond;
                  return (
                    <Pressable
                      key={cond}
                      style={[styles.segment, active && styles.segmentActive]}
                      onPress={() => {
                        const keepsAiPrice = ai.aiPrice && price.trim() === String(ai.aiPrice);
                        setCondition(cond);
                        if (!keepsAiPrice) return;
                        const next = ai.reprice(cond);
                        if (next) setPrice(String(next));
                      }}
                    >
                      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{cond}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {ai.aiCondition && condition === ai.aiCondition ? (
                <Text style={[styles.aiHint, styles.aiHintLeft]}>AI suggested, editable</Text>
              ) : null}
            </View>
            <View style={styles.negotiableCol}>
              <Text style={styles.fieldLabel}>Negotiable</Text>
              <View style={styles.negotiableBox}>
                <Switch
                  value={negotiable}
                  onValueChange={setNegotiable}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.surface}
                  style={styles.negotiableSwitch}
                />
              </View>
            </View>
          </View>

          <FloatingField
            label="Location"
            value={location}
            onChangeText={(text) => {
              setLocation(text);
              setPin(null);
              clearFieldError('location');
            }}
            placeholder="City or area"
            right={
              <Pressable onPress={() => getCurrentLocation()} disabled={locating} style={styles.locBtn}>
                {locating ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Icon name="locate" size={18} color={colors.primary} />
                )}
              </Pressable>
            }
            colors={colors}
            styles={styles}
            inputRef={locationRef}
            anchorRef={locationAnchorRef}
            error={fieldErrors.location}
            onFocus={focusField}
          />

          <Text style={styles.fieldLabel}>Meetup</Text>
          <View style={styles.chipWrap}>
            {MEETUP_OPTIONS.map((option) => {
              const active = meetup === option;
              return (
                <Pressable
                  key={option}
                  style={[styles.categoryChip, active && styles.categoryChipActive]}
                  onPress={() => setMeetup(option)}
                >
                  <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {isEdit ? (
            <View style={styles.editActions}>
              <View style={styles.soldRow}>
                <Text style={styles.soldLabel}>Mark as sold</Text>
                <Switch
                  value={markSold}
                  onValueChange={setMarkSold}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.surface}
                />
              </View>
              <Pressable style={styles.deleteBtn} onPress={handleDelete} hitSlop={6}>
                <Icon name="trash-outline" size={15} color={FORM_ERROR_COLOR} />
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            </View>
          ) : null}
        </FormScroll>

        {keyboardHeight === 0 ? (
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
            <Pressable style={styles.continueBtn} onPress={publish} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={styles.continueBtnText}>{isEdit ? 'Save changes' : 'Publish'}</Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </View>

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
      <PostLimitModal
        visible={limitModal}
        quota={quota}
        onClose={() => setLimitModal(false)}
        onSeePlans={() => {
          setLimitModal(false);
          navigation.navigate(ROUTES.SUBSCRIPTION, { reason: 'limit' });
        }}
        onContact={() => {
          setLimitModal(false);
          navigation.navigate(ROUTES.CONTACT_US);
        }}
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
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  headerSpacer: {
    width: 36,
    height: 36,
  },
  testerBtn: { width: 36, height: 36, borderRadius: 18 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: colors.onGradient,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  mediaCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  countChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
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
  ...formFieldStyles(colors),
  photoRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 10,
  },
  photoSlot: {
    flex: 1,
    height: 68,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.iconBackground,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoSlotCover: {
    flex: 1.35,
    height: 84,
  },
  photoSlotCoverError: {
    borderWidth: 2,
    borderColor: '#E53935',
    backgroundColor: 'rgba(229, 57, 53, 0.08)',
  },
  photoSlotVideo: {
    borderColor: 'rgba(229, 57, 53, 0.35)',
    backgroundColor: 'rgba(229, 57, 53, 0.06)',
  },
  slotImage: {
    width: '100%',
    height: '100%',
  },
  slotFill: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  slotLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 2,
  },
  videoFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#E53935',
  },
  coverBadge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  coverBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  removeBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  aiHint: {
    marginTop: -6,
    marginBottom: 10,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    textAlign: 'right',
  },
  aiHintLeft: {
    marginTop: 4,
    marginBottom: 0,
    textAlign: 'left',
  },
  priceWarn: {
    marginTop: -6,
    marginBottom: 10,
    fontSize: 11,
    fontWeight: '700',
    color: colors.warning || '#D97706',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  catIcon: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: colors.iconBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  categoryChipTextActive: {
    color: colors.onPrimary,
  },
  editActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
    marginBottom: 6,
  },
  soldRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  soldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(229, 57, 53, 0.4)',
    backgroundColor: 'rgba(229, 57, 53, 0.08)',
  },
  deleteText: {
    fontSize: 13,
    fontWeight: '700',
    color: FORM_ERROR_COLOR,
  },
  chipScroll: {
    marginHorizontal: -16,
    marginBottom: 10,
    flexGrow: 0,
  },
  chipScrollContent: {
    paddingHorizontal: 16,
    gap: 6,
  },
  conditionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  conditionCol: {
    flex: 1,
  },
  negotiableCol: {
    width: 84,
  },
  negotiableBox: {
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  negotiableSwitch: {
    transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }],
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 6,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.iconBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: colors.onPrimary,
  },
  pairRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pairGrow: {
    flex: 1,
  },
  pairPrice: {
    width: 90,
    flexShrink: 0,
  },
  locBtn: {
    paddingLeft: 6,
  },
  bottomBar: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  continueBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.onPrimary,
  },
});
