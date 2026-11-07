import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormScroll, revealFocusedInput, scrollFieldToTop, useKeyboardHeight } from '../components/FormScroll';
import { openItemDetail, ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { uploadMediaUris } from '../utils/mediaUpload';
import { useTheme, useThemedStyles, ThemeStatusBar, formFieldStyles, formInputStyle, formLabelStyle, FORM_ERROR_COLOR } from '../theme';
import {
  mapApiCategory,
  noteUserListedCategory,
  refreshUserCategoryRank,
  upsertCategoryMemory,
  useCategories,
  withCategoryFirst,
} from '../utils/categories';
import { AlertModal, showErrorAlert, showImageSafetyAlert } from '../components/AlertModal';
import ListingLiveModal from '../components/ListingLiveModal';
import PublishConfirmModal from '../components/PublishConfirmModal';
import AiItemCheckModal from '../components/AiItemCheckModal';
import ListingDetailsModal from '../components/ListingDetailsModal';
import SellVoiceBar, { VoiceToggle } from '../components/SellVoiceBar';
import { useListingDetailsStep } from '../hooks/useListingDetailsStep';
import { useSellVoice } from '../hooks/useSellVoice';
import { useSellVoiceSetting } from '../hooks/useSellVoiceSetting';
import { readDetails } from '../utils/listingDetails';
import { describeControls, detailsForVoice, runVoiceTurn } from '../utils/sellVoiceControls';
import VariantEditor from '../components/VariantEditor';
import { AiFillButton, AiFillNotice } from '../components/AiFillStatus';
import { analysedPhotoKey, useListingAiFill } from '../hooks/useListingAiFill';
import PostQuotaBanner from '../components/PostQuotaBanner';
import TesterModeButton from '../components/TesterModeButton';
import PostLimitModal from '../components/PostLimitModal';
import { usePostQuota } from '../hooks/usePostQuota';
import useOwnDuplicateCheck from '../hooks/useOwnDuplicateCheck';
import {
  EXTRA_PHOTO_SLOTS,
  hydrateMediaSlotsFromUris,
  MAX_LISTING_PHOTOS,
  pickListingPhoto,
} from '../utils/listingPhotos';
import { resolveMediaUrl } from '../utils/listing';
import { normalizeVariantsForApi } from '../utils/listingVariants';
function resolveColor(colorRef, colors) {
  if (typeof colorRef === 'string' && colorRef.startsWith('colors.')) {
    const colorKey = colorRef.replace('colors.', '');
    return colors[colorKey] || colorRef;
  }
  return colorRef;
}

const CONDITIONS = ['New', 'Good', 'Fair'];
// Room at the end of the form so the floating voice bar never covers the last field.
const VOICE_BAR_SPACE = 72;

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

function variantsFromListing(listing) {
  return (listing?.variants || []).map((variant, index) => ({
    ...variant,
    id: variant.id || `variant-${index + 1}`,
    price: variant.price != null ? String(variant.price) : '',
    stock: String(variant.stock ?? 0),
  }));
}

/** Pass `editListing` (a loaded listing) to reuse this form for editing. */
export default function ShopPostListingScreen({ navigation, editListing = null }) {
  const listingId = editListing?.id || editListing?._id || null;
  const isEdit = Boolean(listingId);
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const allCategories = useCategories('product');
  const [shopCategories, setShopCategories] = useState(null);
  const [shopCategoriesLoading, setShopCategoriesLoading] = useState(true);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [aiCategory, setAiCategory] = useState(null);
  const chipScrollRef = useRef(null);
  const scrollRef = useRef(null);
  const photoAnchorRef = useRef(null);
  const titleAnchorRef = useRef(null);
  const priceAnchorRef = useRef(null);
  const stockAnchorRef = useRef(null);
  const variantAnchorRef = useRef(null);
  const descAnchorRef = useRef(null);
  const originalAnchorRef = useRef(null);
  const brandAnchorRef = useRef(null);
  const skuAnchorRef = useRef(null);
  const keyboardHeight = useKeyboardHeight();
  const [fieldErrors, setFieldErrors] = useState({});
  const titleRef = useRef(null);
  const descRef = useRef(null);
  const priceRef = useRef(null);
  const stockRef = useRef(null);
  const brandRef = useRef(null);
  const skuRef = useRef(null);
  const [pickingIndex, setPickingIndex] = useState(null);
  const [photos, setPhotos] = useState(() =>
    isEdit
      ? hydrateMediaSlotsFromUris(editListing.photos || [], { includeVideoSlot: false }).filter(Boolean)
      : []
  );
  const [submitting, setSubmitting] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);
  const [userShop, setUserShop] = useState(() =>
    editListing?.shopId && typeof editListing.shopId === 'object' ? editListing.shopId : null
  );
  const [loadingShop, setLoadingShop] = useState(true);
  const [title, setTitle] = useState(editListing?.title || '');
  const [description, setDescription] = useState(editListing?.description || '');
  const [searchWords, setSearchWords] = useState(
    Array.isArray(editListing?.searchWords) ? editListing.searchWords : []
  );
  const [category, setCategory] = useState(editListing?.category || 'Mobiles');
  const categoryTouchedRef = useRef(isEdit);
  const [condition, setCondition] = useState(editListing?.condition || 'New');
  const [price, setPrice] = useState(editListing?.price != null ? String(editListing.price) : '');
  const priceTextRef = useRef(price);
  priceTextRef.current = price;
  // No automatic keyboard while the details card is open or the voice helper is talking.
  const holdFocusRef = useRef(false);
  const voiceOnRef = useRef(false);
  const [voicePhoto, setVoicePhoto] = useState(null);
  const [voiceOn, setVoiceOn] = useSellVoiceSetting({ askMic: !isEdit });
  const [originalPrice, setOriginalPrice] = useState(
    editListing?.originalPrice != null && editListing.originalPrice !== ''
      ? String(editListing.originalPrice)
      : ''
  );
  const [stock, setStock] = useState(isEdit ? String(editListing.stock ?? 1) : '1');
  const [brand, setBrand] = useState(editListing?.brand || '');
  const [sku, setSku] = useState(editListing?.sku || '');
  const [isOnSale, setIsOnSale] = useState(Boolean(editListing?.isOnSale));
  const [selectedShopId, setSelectedShopId] = useState(null);
  const [hasVariants, setHasVariants] = useState(Boolean(editListing?.hasVariants));
  const [variantOptions, setVariantOptions] = useState(editListing?.variantOptions || []);
  const [variants, setVariants] = useState(() => variantsFromListing(editListing));
  const [markSold, setMarkSold] = useState(editListing?.status === 'sold');
  const { quota, blocked: quotaBlocked, reload: reloadQuota, setQuota, minPrice } = usePostQuota('shop', {
    shopId: selectedShopId,
    enabled: !isEdit && !loadingShop && Boolean(selectedShopId),
  });
  const [limitModal, setLimitModal] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const reopenConfirmRef = useRef(false);
  useEffect(
    () =>
      navigation.addListener('focus', () => {
        if (!reopenConfirmRef.current) return;
        reopenConfirmRef.current = false;
        setConfirmOpen(true);
      }),
    [navigation]
  );

  /** True when today's posts are used up; opens the limit modal instead of the picker. */
  const checkPostLimit = useCallback(async () => {
    if (isEdit || !quotaBlocked) return false;
    const fresh = await reloadQuota();
    if (fresh && (fresh.unlimited || fresh.remaining > 0)) return false;
    Keyboard.dismiss();
    setLimitModal(true);
    return true;
  }, [isEdit, quotaBlocked, reloadQuota]);

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

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await api.getMyShopCategories();
      if (!active) return;
      if (!error) {
        const list = (data?.categories || []).map(mapApiCategory);
        list.forEach((item) => upsertCategoryMemory('product', item));
        setShopCategories(list);
      }
      setShopCategoriesLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const categories = useMemo(() => {
    const base = shopCategories?.length && !showAllCategories ? shopCategories : allCategories;
    let list = base;
    if (categoryTouchedRef.current && category && !base.some((item) => item.label === category)) {
      const current = allCategories.find((item) => item.label === category) || {
        label: category,
        icon: 'pricetag-outline',
        color: colors.primary,
      };
      list = [current, ...base];
    }
    return withCategoryFirst(list, aiCategory?.label, aiCategory);
  }, [shopCategories, showAllCategories, allCategories, category, aiCategory, colors.primary]);

  useEffect(() => {
    if (categoryTouchedRef.current) return;
    const first = categories[0]?.label;
    if (first) setCategory(first);
  }, [categories]);

  const handleBack = () => {
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

  const mainPhoto = photos[0]?.uri ?? null;
  const extraPhotos = photos.slice(1);

  const repeatCheck = useOwnDuplicateCheck();
  const uploadedRef = useRef(null);
  const ai = useListingAiFill({
    minPrice,
    categories,
    conditions: CONDITIONS,
    forShop: true,
    fields: {
      setTitle,
      setDescription,
      setSearchWords,
      setCategory: (value, item) => {
        categoryTouchedRef.current = true;
        setCategory(value);
        setAiCategory(item || { label: value, icon: 'pricetag-outline', color: colors.primary });
        chipScrollRef.current?.scrollTo({ x: 0, animated: true });
        if (item) {
          setShopCategories((list) =>
            list?.length && !list.some((cat) => cat.label === value) ? [item, ...list] : list
          );
        }
      },
      setCondition,
    },
    onTitleFilled: () => clearFieldError('title'),
    onRemoveFlaggedPhoto: (flaggedUri) => {
      setPhotos((prev) => prev.filter((item) => item?.uri !== flaggedUri));
      setFieldErrors((current) => ({ ...current, photo: 'Choose another photo' }));
    },
    setAlertConfig,
  });
  const { keepOnlyPhoto } = ai;
  useEffect(() => {
    keepOnlyPhoto(mainPhoto);
  }, [mainPhoto, keepOnlyPhoto]);

  const detailsStep = useListingDetailsStep({
    ai,
    description,
    setDescription,
    photoUri: mainPhoto,
    onClosed: () => focusEmptyPrice(),
  });

  // The Hindi voice helper talks from the moment AI has read the cover photo until the listing is posted.
  const voiceActive = !isEdit && voiceOn && Boolean(mainPhoto) && voicePhoto === mainPhoto && !submitting && !alertConfig?.live;
  const voiceStage = ai.filling ? 'reading' : ai.pending ? 'check' : detailsStep.open ? 'details' : confirmOpen ? 'publish' : 'form';
  const applyVoiceSet = (set, descriptionAdd) => {
    if (set.title) {
      setTitle(set.title);
      clearFieldError('title');
    }
    if (set.category) {
      const item = categories.find((cat) => cat.label === set.category);
      categoryTouchedRef.current = true;
      setCategory(set.category);
      if (item) setAiCategory(item);
      chipScrollRef.current?.scrollTo({ x: 0, animated: true });
    }
    if (set.condition && CONDITIONS.includes(set.condition)) setCondition(set.condition);
    if (set.price) {
      setPrice(String(set.price));
      clearFieldError('price');
    }
    if (set.brand) setBrand(set.brand);
    if (set.stock) setStock(String(set.stock));
    if (descriptionAdd) {
      setDescription((current) => (current.trim() ? `${current.trim()}\n${descriptionAdd}` : descriptionAdd));
    }
  };

  // Everything on the screen the seller could tap right now, so the voice helper can tap it for them.
  const voiceControls = () => {
    const list = [];
    const add = (id, kind, label, run, extra = {}) => list.push({ id, kind, label, run, ...extra });
    const fieldAnchors = {
      photos: photoAnchorRef,
      title: titleAnchorRef,
      description: descAnchorRef,
      price: priceAnchorRef,
      original_price: originalAnchorRef,
      stock: stockAnchorRef,
      brand: brandAnchorRef,
      sku: skuAnchorRef,
    };
    const fieldInputs = { title: titleRef, description: descRef, price: priceRef, stock: stockRef, brand: brandRef, sku: skuRef };
    if (confirmOpen) {
      add('publish_now', 'button', 'Final review: "Publish now" — posts the listing', () => submitListing(), { later: true });
      add('edit_review', 'button', 'Final review: "Edit" — closes the review and goes back to the form', () => setConfirmOpen(false));
    } else if (!detailsStep.open && !ai.pending) {
      add('publish', 'button', 'Publish button — checks the form and opens the final review', () => publish());
    }
    if (detailsStep.open) {
      add('save_details', 'button', `${detailsStep.details.label} details card: save`, () => detailsStep.save(), { later: true });
      add('skip_details', 'button', `${detailsStep.details.label} details card: skip / close`, () => detailsStep.skip(), { later: true });
    } else if (detailsStep.known) {
      add('edit_details', 'button', `Open the ${detailsStep.known.label} details card to change details`, () => detailsStep.edit());
    }
    add('description', 'text', 'Description box: replace the whole description with this English text', (value) => setDescription(String(value)));
    add('original_price', 'number', 'Original price (MRP, shown crossed out)', (value) => setOriginalPrice(String(Math.round(value))), {
      value: originalPrice,
    });
    add('sku', 'text', 'SKU / product code', (value) => setSku(String(value)), { value: sku });
    add('on_sale', 'toggle', 'On sale switch', (value) => setIsOnSale(Boolean(value)), { value: isOnSale });
    add('all_categories', 'button', showAllCategories ? 'Show only my shop categories' : 'Show all categories', () =>
      setShowAllCategories((value) => !value)
    );
    add('show_field', 'select', 'Scroll the form to a section', (value) => revealField(fieldAnchors[value]), { options: Object.keys(fieldAnchors) });
    add('type_in', 'select', 'Open the keyboard in a field so the seller types it by hand', (value) => revealField(fieldAnchors[value], fieldInputs[value]), {
      options: Object.keys(fieldInputs),
      later: true,
    });
    if (!ai.filling) add('ai_refill', 'button', 'AI sparkle button — read the cover photo again and refill the form', () => ai.fill({ photoUri: mainPhoto }));
    add('change_cover', 'button', 'Take or choose a new cover photo', () => pickPhoto(0), { later: true });
    const freeSlot = Array.from({ length: MAX_LISTING_PHOTOS - 1 }, (_, i) => i + 1).find((i) => !photos[i]?.uri);
    if (freeSlot) add('add_photo', 'button', 'Add another photo', () => pickPhoto(freeSlot), { later: true });
    add('clear_form', 'button', 'Clear — removes the photo and empties the whole form', () => resetForm(), { later: true });
    add('back', 'button', 'Back — leave the sell screen', () => handleBack(), { later: true });
    return list;
  };

  const voice = useSellVoice({
    active: voiceActive,
    stage: voiceStage,
    paused: keyboardHeight > 0 || limitModal || (!!alertConfig && !alertConfig.live),
    buildTurn: () => ({
      forShop: true,
      form: { title, description, category, condition, price, brand, stock, originalPrice, sku, isOnSale },
      categories: categories.map((cat) => cat.label),
      conditions: CONDITIONS,
      aiPrice: ai.aiPrice,
      check: ai.pending ? ai.pending.suggestion : null,
      details: detailsForVoice(detailsStep, (known) => readDetails(known, description)),
      controls: describeControls(voiceControls()),
    }),
    applyTurn: (turn, when) =>
      runVoiceTurn(turn, when, {
        controls: voiceControls(),
        applySet: applyVoiceSet,
        detailsStep,
        savedDetails: detailsStep.known ? readDetails(detailsStep.known, description) : {},
        pending: ai.pending,
        answerCheck: answerAiCheck,
        confirmOpen,
        openPublish: publish,
        closePublish: () => setConfirmOpen(false),
        confirmPublish: () => {
          if (!repeatCheck.checking) submitListing();
        },
      }),
  });
  voiceOnRef.current = voiceActive && !voice.muted;
  holdFocusRef.current = detailsStep.openRef.current || voiceOnRef.current;
  const voiceBar = voiceActive ? <SellVoiceBar voice={voice} inline /> : null;
  const imageFlag =
    ai.imageFlag && photos.some((item) => item?.uri === ai.imageFlag.uri)
      ? { issue: ai.imageFlag.issue, reason: ai.imageFlag.reason }
      : null;

  const manualReviewAlert = (reason, onDone) => {
    const done = () => {
      setAlertConfig(null);
      onDone();
    };
    return {
      type: 'warning',
      title: 'Sent for manual review',
      message: `${String(reason || '').replace(/\s*Held for manual review\.?\s*$/i, '').trim()}\n\nYour product will go live after our team checks it.`.trim(),
      primaryButton: { text: 'OK' },
      onClose: done,
    };
  };

  const requireCover = () => {
    if (mainPhoto) return true;
    Keyboard.dismiss();
    setFieldErrors((current) => ({ ...current, photo: 'Add a cover photo first' }));
    revealField(photoAnchorRef);
    return false;
  };

  const pickPhoto = useCallback(async (index) => {
    if (index !== 0 && !requireCover()) return;
    if (index === 0 && !mainPhoto && (await checkPostLimit())) return;
    setPickingIndex(index);
    let pickedUri = null;
    try {
      const uri = await pickListingPhoto(index === 0 ? 'main' : 'extra');
      if (!uri) {
        setPickingIndex(null);
        return;
      }
      pickedUri = uri;
      if (index === 0) clearFieldError('photo');
      setPhotos((prev) => {
        const next = [...prev];
        next[index] = { id: `${Date.now()}-${index}`, uri, type: 'image' };
        return next.slice(0, MAX_LISTING_PHOTOS);
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
        if (priceTextRef.current.trim() || holdFocusRef.current || TextInput.State?.currentlyFocusedInput?.()) return;
        revealField(priceAnchorRef, priceRef);
      };
      if (ai.limitReached) {
        setVoicePhoto(pickedUri);
        setTimeout(focusPrice, 350);
      } else {
        ai.fill({ silent: true, photoUri: pickedUri, onlyEmpty: true }).then((result) => {
          if (result !== 'blocked') setVoicePhoto(pickedUri);
          if (result !== 'blocked' && result !== 'confirm') setTimeout(focusPrice, 250);
        });
      }
    }
  }, [requireCover, clearFieldError, revealField, priceAnchorRef, priceRef, ai, isEdit, mainPhoto, checkPostLimit]);

  const focusEmptyPrice = () =>
    setTimeout(() => {
      if (!priceTextRef.current.trim() && !holdFocusRef.current) revealField(priceAnchorRef, priceRef);
    }, 250);

  const answerAiCheck = (choice) => {
    ai.resolvePending(choice);
    if (choice === 'retake') {
      pickPhoto(0);
    } else if (choice === 'unsure') {
      // While the voice helper talks, the keyboard would only interrupt it.
      if (!voiceOnRef.current) revealField(titleAnchorRef, titleRef);
    } else {
      focusEmptyPrice();
    }
  };

  const removePhoto = (index) => {
    // Details come from the cover, so a new post starts over without it.
    if (index === 0 && !isEdit) {
      resetForm();
      return;
    }
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const formDirty = Boolean(
    photos.some((item) => item?.uri) ||
      title.trim() ||
      description.trim() ||
      price.trim() ||
      originalPrice.trim() ||
      brand.trim() ||
      sku.trim() ||
      searchWords.length ||
      hasVariants
  );

  const resetForm = () => {
    Keyboard.dismiss();
    ai.reset();
    setVoicePhoto(null);
    uploadedRef.current = null;
    setPhotos([]);
    setFieldErrors({});
    setTitle('');
    setDescription('');
    setSearchWords([]);
    categoryTouchedRef.current = false;
    setAiCategory(null);
    setShowAllCategories(false);
    setCategory((shopCategories?.length ? shopCategories : allCategories)[0]?.label || 'Mobiles');
    chipScrollRef.current?.scrollTo({ x: 0, animated: false });
    setCondition('New');
    setPrice('');
    setOriginalPrice('');
    setStock('1');
    setBrand('');
    setSku('');
    setIsOnSale(false);
    setHasVariants(false);
    setVariantOptions([]);
    setVariants([]);
    scrollRef.current?.scrollTo?.({ y: 0, animated: true });
  };

  const validateStep1 = () => {
    if (loadingShop) {
      Alert.alert('One moment', 'Your shop is still loading. Try again in a second.');
      return false;
    }
    if (!userShop) {
      Alert.alert('No Shop Found', 'You need to create a shop first to post shop products.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Create Shop', onPress: () => navigation.navigate(ROUTES.CREATE_SHOP) },
      ]);
      return false;
    }
    if (!mainPhoto) {
      setFieldErrors((current) => ({ ...current, photo: 'Add a cover photo' }));
      Keyboard.dismiss();
      revealField(photoAnchorRef);
      return false;
    }
    return true;
  };

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
    if (!validateStep1()) return;
    const next = {};
    if (!title.trim()) next.title = 'Enter a title';
    if (!price.trim()) next.price = 'Enter a price';
    else if (minPrice > 0 && Number(String(price).replace(/[^\d]/g, '')) < minPrice) next.price = `Minimum price is NPR ${minPrice}`;
    if (hasVariants) {
      const totalStock = variants.reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0);
      if (!variants.length || totalStock < 1) next.variants = 'Add variant stock';
    } else if (!stock || Number(stock) < 1) {
      next.stock = 'Enter stock';
    }
    setFieldErrors((current) => ({ ...current, title: '', price: '', stock: '', variants: '', ...next }));
    if (next.title) {
      revealField(titleAnchorRef, titleRef);
      return;
    }
    if (next.price) {
      revealField(priceAnchorRef, priceRef);
      return;
    }
    if (next.stock) {
      revealField(stockAnchorRef, stockRef);
      return;
    }
    if (next.variants) {
      Keyboard.dismiss();
      revealField(variantAnchorRef);
      return;
    }
    Keyboard.dismiss();
    if (isEdit) submitListing();
    else {
      repeatCheck.check({ title: title.trim(), category, price, photoUri: mainPhoto });
      setConfirmOpen(true);
    }
  };

  const submitListing = async () => {
    setConfirmOpen(false);
    setSubmitting(true);

    const localPhotos = photos.map((photo) => photo?.uri).filter(Boolean);
    const uploadKey = localPhotos.join('|');
    const uploaded = uploadedRef.current?.key === uploadKey
      ? uploadedRef.current.result
      : await uploadMediaUris(localPhotos, 'listings');
    if (!uploaded.error) uploadedRef.current = { key: uploadKey, result: uploaded };
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
      searchWords,
      price,
      category,
      condition,
      photos: uploaded.urls,
      ...(isEdit ? { markSold } : { sellerType: 'shop', shopId: selectedShopId }),
      brand: brand.trim(),
      sku: sku.trim(),
      originalPrice: originalPrice ? Number(originalPrice) : null,
      isOnSale,
      hasVariants,
      ...(imageFlag ? { imageFlag } : {}),
      aiPhotoKeys: ai.sessionPhotoKeys(),
      ...(repeatCheck.duplicate && !isEdit ? { confirmDuplicate: true } : {}),
    };

    if (hasVariants) {
      payload.variantOptions = variantOptions;
      payload.variants = normalizeVariantsForApi(variants, parsedBasePrice);
    } else {
      payload.stock = Number(stock);
    }

    if (isEdit) {
      const { data: saved, error } = await api.updateListing(listingId, payload);
      setSubmitting(false);
      if (!error) ai.endSession({ remote: false });
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

    const { data, error } = await api.createListing(payload);

    setSubmitting(false);
    if (!error && data?.listing) ai.endSession({ remote: false });
    if (data?.code === 'POSSIBLE_DUPLICATE' && data.existing) {
      repeatCheck.show(data.existing);
      setConfirmOpen(true);
      return;
    }
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
          title: isProhibited ? 'Product not allowed' : 'Could not post product',
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
    setAlertConfig(
      postedAlert(inReview, openMyListings, {
        title: payload.title,
        price: payload.price,
        photo: mainPhoto ? resolveMediaUrl(mainPhoto) : null,
      })
    );
  };

  const postedAlert = (inReview, onDone, listing) => {
    const done = () => {
      setAlertConfig(null);
      onDone();
    };
    return {
      live: true,
      inReview,
      listing,
      title: inReview ? 'Sent for review' : 'Product is live!',
      message: inReview
        ? 'It goes live after a quick check. You can see it in My Listings.'
        : 'Buyers nearby can see it now. You can manage it in My Listings.',
      onClose: done,
    };
  };

  const handleDelete = () => {
    if (!listingId) return;
    Alert.alert('Delete product', 'Remove this product permanently?', [
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
        title={isEdit ? 'Edit product' : 'Sell product'}
      />

      <View style={styles.flex}>
        <FormScroll
          ref={scrollRef}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 12 + (voiceActive ? VOICE_BAR_SPACE : 0) }]}
        >
          {loadingShop && !userShop ? (
            <View style={styles.shopInfoCard}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.shopInfoText} numberOfLines={1}>Loading your shop…</Text>
            </View>
          ) : userShop ? (
            <View style={styles.shopInfoCard}>
              <Icon name="storefront" size={16} color={colors.primary} />
              <Text style={styles.shopInfoText} numberOfLines={1}>
                {userShop.name}
              </Text>
            </View>
          ) : (
            <Pressable
              style={styles.shopMissingCard}
              onPress={() => navigation.navigate(ROUTES.CREATE_SHOP)}
            >
              <Icon name="alert-circle-outline" size={16} color={colors.warning} />
              <Text style={styles.shopMissingText}>Create a shop first</Text>
              <Icon name="chevron-forward" size={16} color={colors.textSecondary} />
            </Pressable>
          )}
          {!isEdit ? (
            <PostQuotaBanner quota={quota} onUpgrade={() => navigation.navigate(ROUTES.SUBSCRIPTION)} />
          ) : null}

          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Photos</Text>
              {!isEdit && formDirty ? (
                <Pressable onPress={resetForm} hitSlop={10}>
                  <Text style={styles.clearText}>Clear</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.mediaCountRow}>
              {!isEdit ? <VoiceToggle value={voiceOn} onChange={setVoiceOn} /> : null}
              <AiFillButton filling={ai.filling} onPress={() => ai.fill({ photoUri: mainPhoto })} />
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
                console.log('Cover photo pressed, hasPhoto:', !!mainPhoto);
                pickPhoto(0);
              }}
              disabled={pickingIndex === 0}
            >
              {mainPhoto ? (
                <>
                  <Image source={{ uri: resolveMediaUrl(mainPhoto) }} style={styles.slotImage} />
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

            {Array.from({ length: EXTRA_PHOTO_SLOTS }).map((_, index) => {
              const photo = extraPhotos[index];
              const slotIndex = index + 1;
              const loading = pickingIndex === slotIndex;
              return (
                <View key={index} style={styles.photoSlot}>
                  {photo ? (
                    <>
                      <Image source={{ uri: resolveMediaUrl(photo.uri) }} style={styles.slotImage} />
                      <Pressable
                        style={styles.removeBadge}
                        onPress={() => removePhoto(slotIndex)}
                        hitSlop={6}
                      >
                        <Icon name="close" size={11} color="#fff" />
                      </Pressable>
                    </>
                  ) : loading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
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
                label="Product title"
                value={title}
                onChangeText={(text) => {
                  setTitle(text);
                  clearFieldError('title');
                }}
                placeholder="Product name"
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

          <FloatingField
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Describe your product"
            multiline
            colors={colors}
            styles={styles}
            inputRef={descRef}
            anchorRef={descAnchorRef}
            onFocus={focusField}
          />

          <Text style={styles.fieldLabel}>Category</Text>
          {shopCategoriesLoading && !shopCategories ? (
            <View style={styles.categoryHintRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.categoryHint}>Finding categories for your store…</Text>
            </View>
          ) : null}
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
            {shopCategories?.length ? (
              <Pressable
                style={styles.categoryChip}
                onPress={() => setShowAllCategories((value) => !value)}
              >
                <Icon
                  name={showAllCategories ? 'remove' : 'add'}
                  size={13}
                  color={colors.textSecondary}
                />
                <Text style={styles.categoryChipText}>
                  {showAllCategories ? 'Store only' : 'More'}
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>

          <View style={styles.pairRow}>
            <View style={[styles.pairGrow, styles.floatingWrap]}>
              <Text style={styles.floatingLabel}>Condition</Text>
              <View style={styles.segmentRow}>
                {CONDITIONS.map((cond) => {
                  const active = condition === cond;
                  return (
                    <Pressable
                      key={cond}
                      style={[styles.segment, active && styles.segmentActive]}
                      onPress={() => setCondition(cond)}
                    >
                      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{cond}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            {!hasVariants ? (
              <View style={styles.pairPrice}>
                <FloatingField
                  label="Stock"
                  value={stock}
                  onChangeText={(text) => {
                    setStock(text);
                    clearFieldError('stock');
                  }}
                  placeholder="Qty"
                  keyboardType="numeric"
                  colors={colors}
                  styles={styles}
                  inputRef={stockRef}
                  anchorRef={stockAnchorRef}
                  error={fieldErrors.stock}
                  onFocus={focusField}
                />
              </View>
            ) : null}
          </View>

          <View ref={variantAnchorRef} collapsable={false}>
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
            onChangeVariants={(next) => {
              setVariants(next);
              clearFieldError('variants');
            }}
            colors={colors}
            styles={styles}
          />
          {fieldErrors.variants ? <Text style={styles.fieldError}>{fieldErrors.variants}</Text> : null}
          </View>

          <View style={styles.priceRow}>
            <View style={styles.priceCol}>
              <FloatingField
                label="Original price"
                value={originalPrice}
                onChangeText={setOriginalPrice}
                placeholder="Optional"
                keyboardType="numeric"
                colors={colors}
                styles={styles}
                anchorRef={originalAnchorRef}
                onFocus={focusField}
              />
            </View>
            <View style={styles.priceCol}>
              <FloatingField
                label="Brand"
                value={brand}
                onChangeText={setBrand}
                placeholder="Optional"
                colors={colors}
                styles={styles}
                inputRef={brandRef}
                anchorRef={brandAnchorRef}
                onFocus={focusField}
              />
            </View>
          </View>

          <View style={styles.pairRow}>
            <View style={styles.pairGrow}>
              <FloatingField
                label="SKU / product code"
                value={sku}
                onChangeText={setSku}
                placeholder="Optional"
                colors={colors}
                styles={styles}
                inputRef={skuRef}
                anchorRef={skuAnchorRef}
                onFocus={focusField}
              />
            </View>
            <View style={[styles.pairPrice, styles.floatingWrap]}>
              <Text style={styles.floatingLabel}>On sale</Text>
              <View style={styles.switchBox}>
                <Switch
                  value={isOnSale}
                  onValueChange={setIsOnSale}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.surface}
                  style={styles.switchSmall}
                />
              </View>
            </View>
          </View>

          {isEdit ? (
            <View style={styles.editActions}>
              <View style={styles.soldRow}>
                <Text style={styles.toggleLabel}>Mark as sold</Text>
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

          <Pressable style={styles.continueBtn} onPress={publish} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.continueBtnText}>{isEdit ? 'Save changes' : 'Publish'}</Text>
            )}
          </Pressable>
        </FormScroll>

        {keyboardHeight === 0 && voiceActive ? (
          <SellVoiceBar voice={voice} style={[styles.voiceFloat, { bottom: insets.bottom + 8 }]} />
        ) : null}
      </View>

      <AlertModal
        visible={!!alertConfig && !alertConfig.live}
        onClose={() => setAlertConfig(null)}
        {...(alertConfig?.live ? {} : alertConfig || {})}
      />
      <ListingLiveModal visible={!!alertConfig?.live} {...(alertConfig?.live ? alertConfig : {})} />
      <AiItemCheckModal
        visible={!!ai.pending}
        photo={ai.pending?.photoUri || null}
        suggestion={ai.pending?.suggestion}
        onChoose={answerAiCheck}
        voiceBar={voiceBar}
      />
      <ListingDetailsModal
        visible={detailsStep.open}
        details={detailsStep.details}
        values={detailsStep.values}
        onChange={detailsStep.setValue}
        onSave={detailsStep.save}
        onSkip={detailsStep.skip}
        voiceBar={voiceBar}
      />
      <PublishConfirmModal
        voiceBar={voiceBar}
        visible={confirmOpen}
        photo={mainPhoto ? resolveMediaUrl(mainPhoto) : null}
        photoCount={photos.filter((photo) => photo?.uri).length}
        title={title.trim()}
        price={price}
        description={description.trim()}
        details={[
          { icon: 'pricetag-outline', label: 'Category', value: category },
          { icon: 'sparkles-outline', label: 'Condition', value: condition },
          {
            icon: 'cube-outline',
            label: 'Stock',
            value: String(hasVariants
              ? variants.reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0)
              : Number(stock) || 0),
          },
          { icon: 'storefront-outline', label: 'Brand', value: brand.trim() },
        ]}
        onEdit={() => setConfirmOpen(false)}
        onConfirm={submitListing}
        duplicate={repeatCheck.duplicate}
        photoFlag={imageFlag}
        checking={repeatCheck.checking}
        onOpenDuplicate={() => {
          const existing = repeatCheck.duplicate;
          if (!existing) return;
          reopenConfirmRef.current = true;
          setConfirmOpen(false);
          openItemDetail(navigation, { listingId: existing.id || existing._id, item: existing });
        }}
        onSimilar={() => {
          reopenConfirmRef.current = true;
          setConfirmOpen(false);
          navigation.navigate(ROUTES.SIMILAR_PRODUCTS, {
            photoUri: mainPhoto,
            photoKey: analysedPhotoKey(mainPhoto),
            excludeId: isEdit ? listingId : undefined,
            title: title.trim(),
            category,
            description: description.trim(),
            price,
          });
        }}
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
  mediaCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.danger,
  },
  shopInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shopInfoText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  shopMissingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shopMissingText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 12,
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
    borderColor: FORM_ERROR_COLOR,
    backgroundColor: 'rgba(229, 57, 53, 0.08)',
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
  },
  slotLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 2,
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
    marginTop: 2,
  },
  catIcon: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  categoryHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  categoryHint: {
    fontSize: 12,
    color: colors.textTertiary,
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
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
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
  chipScroll: {
    marginHorizontal: -16,
    marginBottom: 10,
    flexGrow: 0,
  },
  chipScrollContent: {
    paddingHorizontal: 16,
    gap: 6,
  },
  switchBox: {
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchSmall: {
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
    height: 40,
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
  priceRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priceCol: {
    flex: 1,
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
  toggleLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  ...formFieldStyles(colors),
  voiceFloat: {
    position: 'absolute',
    left: 12,
    right: 12,
  },
  continueBtn: {
    marginTop: 6,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.onPrimary,
  },
  variantCard: {
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
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
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  variantHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  variantOptionBlock: {
    marginTop: 12,
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
  optionInput: { ...formInputStyle(colors), flex: 1 },
  optionAddBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
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
    marginTop: 12,
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
    marginTop: 12,
    gap: 8,
  },
  variantRowsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  variantRowsTitle: {
    fontSize: 13,
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
  variantFieldLabel: { ...formLabelStyle(colors), fontSize: 11 },
  variantFieldInput: formInputStyle(colors),
  variantEmptyText: {
    marginTop: 10,
    fontSize: 12,
    color: colors.textSecondary,
  },
});
