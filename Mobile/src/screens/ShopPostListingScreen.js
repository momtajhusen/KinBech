import { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { uploadMediaUris } from '../utils/mediaUpload';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { useCategories } from '../utils/categories';
import { AlertModal, showErrorAlert, showImageSafetyAlert } from '../components/AlertModal';
import VariantEditor from '../components/VariantEditor';
import { EXTRA_PHOTO_SLOTS, MAX_LISTING_PHOTOS, pickListingPhoto } from '../utils/listingPhotos';
import { normalizeVariantsForApi } from '../utils/listingVariants';

function resolveColor(colorRef, colors) {
  if (typeof colorRef === 'string' && colorRef.startsWith('colors.')) {
    const colorKey = colorRef.replace('colors.', '');
    return colors[colorKey] || colorRef;
  }
  return colorRef;
}

const TOTAL_STEPS = 3;
const STEP_LABELS = ['Photos', 'Details', 'Preview'];

const CONDITIONS = ['New', 'Good', 'Fair'];

function FloatingField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
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
      </View>
    </View>
  );
}

function ProgressHeader({ step, insets, onBack, colors, styles }) {
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
          <Text style={styles.headerTitle}>Post Shop Product</Text>
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

export default function ShopPostListingScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const categories = useCategories('product');
  const scrollRef = useRef(null);
  const titleRef = useRef(null);
  const descRef = useRef(null);
  const priceRef = useRef(null);
  const stockRef = useRef(null);
  const brandRef = useRef(null);
  const skuRef = useRef(null);
  const [step, setStep] = useState(1);
  const [pickingIndex, setPickingIndex] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);
  const [userShop, setUserShop] = useState(null);
  const [loadingShop, setLoadingShop] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Mobiles');
  const [condition, setCondition] = useState('New');
  const [price, setPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [stock, setStock] = useState('1');
  const [brand, setBrand] = useState('');
  const [sku, setSku] = useState('');
  const [isOnSale, setIsOnSale] = useState(false);
  const [selectedShopId, setSelectedShopId] = useState(null);
  const [hasVariants, setHasVariants] = useState(false);
  const [variantOptions, setVariantOptions] = useState([]);
  const [variants, setVariants] = useState([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data, error } = await api.getMyShop();
        if (!active) return;
        if (!error && data?.shop) {
          setUserShop(data.shop);
          setSelectedShopId(data.shop._id);
        }
      } catch (error) {
        console.log('Error fetching shop:', error);
      } finally {
        if (active) setLoadingShop(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleBack = () => {
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

  const mainPhoto = photos[0]?.uri ?? null;
  const extraPhotos = photos.slice(1);

  const pickPhoto = async (index) => {
    setPickingIndex(index);
    try {
      const uri = await pickListingPhoto(index === 0 ? 'main' : 'extra');
      if (!uri) return;
      setPhotos((prev) => {
        const next = [...prev];
        next[index] = { id: `${Date.now()}-${index}`, uri, type: 'image' };
        return next.slice(0, MAX_LISTING_PHOTOS);
      });
    } finally {
      setPickingIndex(null);
    }
  };

  const removePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const validateStep1 = () => {
    if (!userShop) {
      Alert.alert('No Shop Found', 'You need to create a shop first to post shop products.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Create Shop', onPress: () => navigation.navigate(ROUTES.CREATE_SHOP) },
      ]);
      return false;
    }
    if (!mainPhoto) {
      setAlertConfig(
        showErrorAlert({
          title: 'Main photo required',
          message: 'Add a clear main photo for your product.',
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
          message: 'Enter a title for your product.',
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
    if (hasVariants) {
      if (!variants.length) {
        setAlertConfig(
          showErrorAlert({
            title: 'Variants required',
            message: 'Generate at least one variant combination with stock.',
            onConfirm: () => setAlertConfig(null),
          })
        );
        return false;
      }
      const totalStock = variants.reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0);
      if (totalStock < 1) {
        setAlertConfig(
          showErrorAlert({
            title: 'Stock required',
            message: 'Add stock for at least one variant.',
            onConfirm: () => setAlertConfig(null),
          })
        );
        return false;
      }
    } else if (!stock || Number(stock) < 1) {
      setAlertConfig(
        showErrorAlert({
          title: 'Stock required',
          message: 'Enter available stock quantity.',
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
    if (submitting) return;
    setSubmitting(true);

    const localPhotos = photos.map((photo) => photo?.uri).filter(Boolean);
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
      price,
      category,
      condition,
      photos: uploaded.urls,
      sellerType: 'shop',
      shopId: selectedShopId,
      brand: brand.trim(),
      sku: sku.trim(),
      originalPrice: originalPrice ? Number(originalPrice) : null,
      isOnSale,
      hasVariants,
    };

    if (hasVariants) {
      payload.variantOptions = variantOptions;
      payload.variants = normalizeVariantsForApi(variants, parsedBasePrice);
    } else {
      payload.stock = Number(stock);
    }

    const { data, error } = await api.createListing(payload);

    setSubmitting(false);
    if (error) {
      const isProhibited = /prohibited|weapon|gun|restricted/i.test(String(error));
      setAlertConfig(
        showErrorAlert({
          title: isProhibited ? 'Product not allowed' : 'Could not post product',
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
        location: data.listing.location || userShop?.location || '',
        imageUrl: data.listing.photos?.[0] || mainPhoto,
        condition: data.listing.condition,
        category: data.listing.category,
      },
    });
  };

  const previewPrice = useMemo(() => {
    const numeric = Number(String(price).replace(/[^\d]/g, ''));
    if (!numeric) return 'Rs —';
    if (hasVariants && variants.length) {
      const prices = variants
        .map((variant) => {
          const custom = Number(String(variant.price || '').replace(/[^\d]/g, ''));
          return Number.isFinite(custom) && custom > 0 ? custom : numeric;
        })
        .filter((value) => value > 0);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      if (min !== max) {
        return `Rs ${min.toLocaleString('en-NP')} – ${max.toLocaleString('en-NP')}`;
      }
    }
    return `Rs ${numeric.toLocaleString('en-NP')}`;
  }, [price, hasVariants, variants]);

  const previewStock = useMemo(() => {
    if (hasVariants) {
      return variants.reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0);
    }
    return Number(stock) || 0;
  }, [hasVariants, variants, stock]);

  if (!colors) return null;

  if (loadingShop) {
    return (
      <View style={styles.root}>
        <ThemeStatusBar variant="header" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading shop…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <ProgressHeader step={step} insets={insets} onBack={handleBack} colors={colors} styles={styles} />

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
                  <Text style={styles.sectionTitle}>Product photos</Text>
                  <Text style={styles.sectionHint}>Add a clear cover photo first</Text>
                </View>
                <View style={styles.countChip}>
                  <Ionicons name="image" size={12} color={colors.primary} />
                  <Text style={styles.countChipText}>
                    {photos.filter(Boolean).length}/{MAX_LISTING_PHOTOS}
                  </Text>
                </View>
              </View>

              {userShop ? (
                <View style={styles.shopInfoCard}>
                  <Ionicons name="storefront" size={18} color={colors.primary} />
                  <Text style={styles.shopInfoText} numberOfLines={1}>
                    Posting to {userShop.name}
                  </Text>
                </View>
              ) : (
                <Pressable
                  style={styles.shopMissingCard}
                  onPress={() => navigation.navigate(ROUTES.CREATE_SHOP)}
                >
                  <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
                  <Text style={styles.shopMissingText}>Create a shop first to post products</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                </Pressable>
              )}

              <Pressable
                style={styles.mainPhotoBox}
                onPress={() => pickPhoto(0)}
                disabled={pickingIndex === 0}
              >
                {mainPhoto ? (
                  <>
                    <Image source={{ uri: mainPhoto }} style={styles.mainPhotoImage} />
                    <View style={styles.mainBadge}>
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
                  const loading = pickingIndex === slotIndex;
                  return (
                    <View key={index} style={styles.extraBox}>
                      {photo ? (
                        <>
                          <Image source={{ uri: photo.uri }} style={styles.extraPhotoImage} />
                          <Pressable
                            style={styles.removeBadgeSmall}
                            onPress={() => removePhoto(slotIndex)}
                            hitSlop={8}
                          >
                            <Ionicons name="close" size={11} color="#fff" />
                          </Pressable>
                        </>
                      ) : loading ? (
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
          )}

          {step === 2 && (
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
          )}

          {step === 3 && (
            <>
              <Text style={styles.sectionTitle}>Preview & publish</Text>
              <Text style={styles.sectionHint}>Check everything before it goes live</Text>

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
                  <Image source={{ uri: mainPhoto }} style={styles.previewImage} />
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
            </>
          )}
        </ScrollView>

        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable style={styles.continueBtn} onPress={goNext} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.continueBtnText}>
                {step === TOTAL_STEPS ? 'Publish product' : 'Continue'}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

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
    marginBottom: 16,
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
  shopMissingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shopMissingText: {
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
  extraPhotoImage: {
    width: '100%',
    height: '100%',
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
  },
  extraSlotFill: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
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
    marginBottom: 14,
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
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginBottom: 12,
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
    marginTop: 8,
    marginBottom: 8,
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
  variantToggleCopy: {
    flex: 1,
  },
  variantTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  variantHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  variantOptionBlock: {
    marginTop: 14,
  },
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
  variantValueChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  optionInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
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
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
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
  suggestionChipText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  suggestionChipTextActive: {
    color: colors.primary,
  },
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
  generateBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  variantRowsWrap: {
    marginTop: 14,
    gap: 10,
  },
  variantRowsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  variantRowsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  variantRowsMeta: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  variantRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    backgroundColor: colors.background,
  },
  variantRowLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  variantRowFields: {
    flexDirection: 'row',
    gap: 8,
  },
  variantFieldCol: {
    width: 88,
  },
  variantFieldColWide: {
    flex: 1,
  },
  variantFieldLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  variantFieldInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  variantEmptyText: {
    marginTop: 12,
    fontSize: 12,
    color: colors.textSecondary,
  },
});
