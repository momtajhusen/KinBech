import { useCallback, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { uploadMediaUris } from '../utils/mediaUpload';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { useCategories } from '../utils/categories';
import { formatCityDistrict } from '../utils/locations';
import { AlertModal, showErrorAlert, showImageSafetyAlert } from '../components/AlertModal';
import ListingMediaPreview from '../components/ListingMediaPreview';
import {
  EXTRA_PHOTO_SLOTS,
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

const TOTAL_STEPS = 3;
const STEP_LABELS = ['Photos', 'Details', 'Meetup'];
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

function ProgressHeader({ step, insets, onBack, colors, styles, title }) {
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
        {STEP_LABELS.map((label, index) => {
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
              {index < STEP_LABELS.length - 1 ? (
                <View style={[styles.stepConnector, done && styles.stepConnectorDone]} />
              ) : null}
            </View>
          );
        })}
      </View>
    </LinearGradient>
  );
}

export default function IndividualPostListingScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const categories = useCategories('product');
  const scrollRef = useRef(null);
  const titleRef = useRef(null);
  const descRef = useRef(null);
  const priceRef = useRef(null);
  const locationRef = useRef(null);
  const [step, setStep] = useState(1);
  const [pickingIndex, setPickingIndex] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Mobiles');
  const [condition, setCondition] = useState('Good');
  const [price, setPrice] = useState('');
  const [location, setLocation] = useState('');
  const [negotiable, setNegotiable] = useState(true);
  const [meetup, setMeetup] = useState('Public place');

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
          })
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
          })
        );
        return;
      }
      setLocation(formatCityDistrict(addr, 'Kathmandu'));
    } catch (e) {
      setAlertConfig(
        showErrorAlert({
          title: 'Location error',
          message: 'Could not fetch location. Please enter manually.',
          onConfirm: () => setAlertConfig(null),
        })
      );
    } finally {
      setLocating(false);
    }
  }, []);

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
        return next.slice(0, MAX_MEDIA_SLOTS);
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
          message: 'Add a clear main photo for your listing.',
          onConfirm: () => setAlertConfig(null),
        })
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
          message: 'Enter a title for your item.',
          onConfirm: () => setAlertConfig(null),
        })
      );
      return false;
    }
    if (!price.trim()) {
      setAlertConfig(
        showErrorAlert({
          title: 'Price required',
          message: 'Enter a price in NPR.',
          onConfirm: () => setAlertConfig(null),
        })
      );
      return false;
    }
    return true;
  };

  const validateStep3 = () => {
    if (!location.trim()) {
      setAlertConfig(
        showErrorAlert({
          title: 'Location required',
          message: 'Enter your location.',
          onConfirm: () => setAlertConfig(null),
        })
      );
      return false;
    }
    return true;
  };

  const goNext = async () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    if (step < TOTAL_STEPS) {
      setStep((value) => value + 1);
      return;
    }
    if (!validateStep3() || submitting) return;
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

    const { data, error } = await api.createListing({
      title: title.trim(),
      description: description.trim(),
      price,
      category,
      condition,
      photos: uploaded.urls,
      location: location.trim(),
      meetupOption: meetup,
      sellerType: 'individual',
    });

    setSubmitting(false);
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
    navigation.navigate(ROUTES.LISTING_SUCCESS, {
      listing: {
        id: data.listing.id,
        title: data.listing.title,
        price: String(data.listing.price),
        location: data.listing.location,
        imageUrl: data.listing.photos?.[0] || mainPhoto,
        condition: data.listing.condition,
        category: data.listing.category,
      },
    });
  };

  const previewPrice = useMemo(() => {
    const numeric = Number(String(price).replace(/[^\d]/g, ''));
    if (!numeric) return 'Rs —';
    return `Rs ${numeric.toLocaleString('en-NP')}`;
  }, [price]);

  if (!colors) return null;

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <ProgressHeader
        step={step}
        insets={insets}
        onBack={handleBack}
        colors={colors}
        styles={styles}
        title="Post in 30 seconds"
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
          {step === 1 && (
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
                  const loading = pickingIndex === slotIndex;

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
                      ) : loading ? (
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
                                })
                              );
                              return;
                            }
                            if (!mainPhoto) {
                              setAlertConfig(
                                showErrorAlert({
                                  title: 'Cover photo first',
                                  message: 'Add a cover photo before adding a video.',
                                  onConfirm: () => setAlertConfig(null),
                                })
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
          )}

          {step === 2 && (
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
                        <Image source={{ uri: cat.imageUrl }} style={{ width: 16, height: 16, borderRadius: 4 }} />
                      ) : (
                        <Ionicons
                          name={cat.icon}
                          size={16}
                          color={active ? colors.onPrimary : colors.textSecondary}
                        />
                      )}
                      <Text
                        style={[
                          styles.categoryChipText,
                          active && styles.categoryChipTextActive,
                        ]}
                      >
                        {cat.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

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
                        style={[
                          styles.categoryChipText,
                          active && styles.categoryChipTextActive,
                        ]}
                      >
                        {cond}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

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

              <View style={styles.toggleRow}>
                <View>
                  <Text style={styles.toggleLabel}>Price negotiable</Text>
                  <Text style={styles.toggleHint}>Buyers can make an offer</Text>
                </View>
                <Switch
                  value={negotiable}
                  onValueChange={setNegotiable}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.surface}
                />
              </View>
            </>
          )}

          {step === 3 && (
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
                        style={[
                          styles.categoryChipText,
                          active && styles.categoryChipTextActive,
                        ]}
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
            </>
          )}
        </ScrollView>

        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable style={styles.continueBtn} onPress={goNext} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.continueBtnText}>
                {step === TOTAL_STEPS ? 'Publish' : 'Continue'}
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
  previewCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    marginTop: 8,
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
  previewPrice: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 4,
  },
  previewLocation: {
    fontSize: 13,
    color: colors.textSecondary,
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
});
