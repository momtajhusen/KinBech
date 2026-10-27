import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GradientButton from '../components/GradientButton';
import { FormScroll } from '../components/FormScroll';
import { EditField, EditSection, FieldRow } from '../components/ProfileEditKit';
import { AlertModal, showErrorAlert, showImageSafetyAlert, showSuccessAlert } from '../components/AlertModal';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { uploadMediaUri } from '../utils/mediaUpload';
import { resolveMediaUrl } from '../utils/listing';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { useCategories } from '../utils/categories';
import { coordsForPlaceName, formatCityDistrict } from '../utils/locations';

const HOUR_PRESETS = ['9:00 AM - 8:00 PM', '10:00 AM - 7:00 PM', '7:00 AM - 9:00 PM', 'Open 24 hours'];

/** Street-level part of a reverse geocode, e.g. "Bhanu Chowk, Main Road". */
function streetFromGeocode(addr) {
  if (!addr) return '';
  const parts = [addr.name, addr.street].filter(Boolean);
  const unique = parts.filter((part, index) => parts.indexOf(part) === index && !/^\d+$/.test(part));
  return unique.join(', ');
}

export default function CreateShopScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { category: initialCategory, preference } = route.params || {};
  const { user, saveSession } = useAuth();
  const shopCategories = useCategories('shop');
  const addressTouched = useRef(false);

  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const [logoUri, setLogoUri] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState(initialCategory || '');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState('');
  const [location, setLocation] = useState(user?.location || '');
  const [openingHours, setOpeningHours] = useState('9:00 AM - 8:00 PM');
  const [coords, setCoords] = useState(null);
  const [panNumber, setPanNumber] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [existingShop, setExistingShop] = useState(null);

  const closeAlert = () => setAlertConfig(null);
  const showError = (title, message) => setAlertConfig(showErrorAlert({ title, message, onConfirm: closeAlert }));

  const detectLocation = useCallback(async ({ silent = false } = {}) => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (!silent) {
          setAlertConfig(showErrorAlert({
            title: 'Location permission',
            message: 'Allow location access to fill your shop location automatically.',
            onConfirm: () => setAlertConfig(null),
          }));
        }
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const geocode = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      const addr = geocode?.[0];
      const place = formatCityDistrict(addr);
      if (place) setLocation(place);
      setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      const street = streetFromGeocode(addr);
      if (street && !addressTouched.current) setAddress(street);
    } catch {
      if (!silent) {
        setAlertConfig(showErrorAlert({
          title: 'Location error',
          message: 'Could not fetch your location. Type your city or area instead.',
          onConfirm: () => setAlertConfig(null),
        }));
      }
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await api.getMyShop();
      if (!active) return;
      const shop = data?.shop;
      if (!shop) {
        detectLocation({ silent: true });
        return;
      }
      setExistingShop(shop);
      setLogoUri(shop.logo || '');
      setName(shop.name || '');
      setCategory(shop.category || initialCategory || '');
      setDescription(shop.description || '');
      setPhone(shop.phone || '');
      if (shop.address) {
        addressTouched.current = true;
        setAddress(shop.address);
      }
      setLocation(shop.location || '');
      setOpeningHours(shop.openingHours || '9:00 AM - 8:00 PM');
      setPanNumber(shop.panNumber || '');
      setVatNumber(shop.vatNumber || '');
      if (shop.coordinates?.lat != null) {
        setCoords({ lat: shop.coordinates.lat, lng: shop.coordinates.lng });
      } else if (!shop.location) {
        detectLocation({ silent: true });
      }
    })();
    return () => {
      active = false;
    };
  }, [initialCategory, detectLocation]);

  const pickLogo = async (source = 'library') => {
    try {
      const fromCamera = source === 'camera';
      const { status } = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showError('Permission required', fromCamera
          ? 'Allow camera access to take a logo photo.'
          : 'Allow photo access to upload your shop logo.');
        return;
      }
      const options = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 };
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled && result.assets[0]) setLogoUri(result.assets[0].uri);
    } catch {
      showError('Error', 'Could not pick the image. Please try again.');
    }
  };

  const handleBack = useCallback(() => {
    if (alertConfig) {
      setAlertConfig(null);
      return;
    }
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation, alertConfig]);

  const steps = [
    { label: 'Logo', done: Boolean(logoUri) },
    { label: 'Name', done: Boolean(name.trim()) },
    { label: 'Category', done: Boolean(category) },
    { label: 'Location', done: Boolean(location.trim()) },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);
  const isEdit = Boolean(existingShop);

  const nameError = submitted && !name.trim() ? 'Please enter your shop name' : '';
  const categoryError = submitted && !category;
  const locationError = submitted && !location.trim() ? 'Please add your city or area' : '';

  const handleSubmit = async () => {
    setSubmitted(true);
    if (!name.trim()) {
      showError('Shop name required', 'Enter your shop name.');
      return;
    }
    if (!category) {
      showError('Category required', 'Choose what your shop sells.');
      return;
    }
    if (!location.trim()) {
      showError('Location required', 'Add your shop location so nearby buyers can find you.');
      return;
    }

    setSubmitting(true);

    let logo = logoUri || '';
    if (logo && !/^https?:\/\//i.test(logo)) {
      const uploaded = await uploadMediaUri(logo, 'shops');
      if (uploaded.error) {
        setSubmitting(false);
        setAlertConfig(
          uploaded.isSafetyBlock || uploaded.errorCode
            ? showImageSafetyAlert({ code: uploaded.errorCode, message: uploaded.error, issues: uploaded.issues, onConfirm: closeAlert })
            : showErrorAlert({ title: 'Logo upload failed', message: uploaded.error, onConfirm: closeAlert })
        );
        return;
      }
      logo = uploaded.url;
      setLogoUri(logo);
    }

    const payload = {
      name: name.trim(),
      category,
      description: description.trim(),
      phone: phone.trim(),
      address: (address || location).trim(),
      location: location.trim(),
      openingHours: openingHours.trim() || '9:00 AM - 8:00 PM',
      logo: logo || undefined,
      panNumber: panNumber.trim(),
      vatNumber: vatNumber.trim(),
      coordinates: (coords?.lat != null ? coords : null) || coordsForPlaceName(location),
    };

    const shopId = existingShop?._id || existingShop?.id;
    const { error } = shopId
      ? await api.updateShop(shopId, payload)
      : await api.createShop(payload);

    if (error) {
      setSubmitting(false);
      showError(shopId ? 'Could not update shop' : 'Could not create shop', error);
      return;
    }

    // The seller mode switches only once the store exists (the backend refuses Shop without one).
    const current = user?.sellerTypePreference || 'individual';
    if (!shopId && preference === 'shop' && current !== 'shop') {
      const modeRes = await api.updateMe({ sellerTypePreference: 'shop' });
      if (modeRes.data?.token) await saveSession(modeRes.data.token, modeRes.data.user);
      if (modeRes.error) {
        setSubmitting(false);
        showError('Store created', `Your store is saved, but the seller mode could not change: ${modeRes.error}`);
        return;
      }
    }
    setSubmitting(false);

    setAlertConfig(showSuccessAlert({
      title: shopId ? 'Shop Updated!' : 'Shop Created!',
      message: shopId
        ? 'Your shop details have been saved.'
        : 'Your shop has been created. Add PAN/VAT documents anytime for a verified badge.',
      onConfirm: () => {
        setAlertConfig(null);
        if (shopId) navigation.navigate(ROUTES.SHOP_VERIFICATION);
        else navigation.navigate(ROUTES.SHOP_POST_LISTING);
      },
    }));
  };

  const logoSrc = logoUri ? resolveMediaUrl(logoUri) || logoUri : '';

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: insets.top }} />
      <FormScroll contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
        <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              {navigation.canGoBack() ? (
                <Pressable onPress={handleBack} hitSlop={12} style={styles.backBtn}>
                  <Icon name="chevron-back" size={22} color={colors.onGradient} />
                </Pressable>
              ) : null}
              <View style={styles.headerBadge}>
                <Icon name="storefront" size={12} color={colors.onGradient} />
                <Text style={styles.headerBadgeText}>{isEdit ? 'YOUR STORE' : 'NEW STORE'}</Text>
              </View>
            </View>
            <Text style={styles.headerPct}>{pct}% done</Text>
          </View>
          <Text style={styles.title}>{isEdit ? 'Edit your shop' : 'Create your shop'}</Text>
          <Text style={styles.subtitle}>A clear logo, name and location help nearby buyers trust and find your store.</Text>
          <View style={styles.progressTrack}>
            {steps.map((step) => (
              <View key={step.label} style={[styles.progressSeg, step.done && styles.progressSegDone]} />
            ))}
          </View>
          <View style={styles.stepRow}>
            {steps.map((step) => (
              <View key={step.label} style={styles.step}>
                <Icon
                  name={step.done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={12}
                  color={step.done ? colors.onGradient : 'rgba(255,255,255,0.7)'}
                />
                <Text style={[styles.stepText, step.done && styles.stepTextDone]}>{step.label}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        <View style={styles.previewCard}>
          <View style={styles.previewRow}>
            <Pressable onPress={() => pickLogo('library')} style={styles.logoWrap}>
              <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.logoRing}>
                <View style={styles.logoInner}>
                  {logoSrc ? (
                    <Image source={{ uri: logoSrc }} style={styles.logoImage} />
                  ) : (
                    <Icon name="storefront" size={34} color={colors.textMuted} />
                  )}
                </View>
              </LinearGradient>
              <View style={styles.cameraBadge}>
                <Icon name={logoSrc ? 'pencil' : 'camera'} size={13} color={colors.onGradient} />
              </View>
            </Pressable>
            <View style={styles.flex1}>
              <Text style={styles.previewEyebrow}>Your store preview</Text>
              <Text style={[styles.previewName, !name.trim() && styles.previewPlaceholder]} numberOfLines={1}>
                {name.trim() || 'Your shop name'}
              </Text>
              <View style={styles.previewMeta}>
                <Icon name={category ? 'pricetag-outline' : 'location-outline'} size={12} color={colors.textMuted} />
                <Text style={styles.previewMetaText} numberOfLines={1}>
                  {category ? `${category}${location ? ` · ${location}` : ''}` : location || 'Add your location'}
                </Text>
              </View>
              <View style={styles.previewPills}>
                <View style={[styles.pill, { backgroundColor: `${colors.primary}1A` }]}>
                  <Icon name="time-outline" size={10} color={colors.primary} />
                  <Text style={[styles.pillText, { color: colors.primary }]} numberOfLines={1}>{openingHours || 'Hours'}</Text>
                </View>
              </View>
            </View>
          </View>
          <View style={styles.photoActions}>
            <Pressable style={styles.photoBtn} onPress={() => pickLogo('library')}>
              <Icon name="images-outline" size={16} color={colors.primary} />
              <Text style={styles.photoBtnText}>{logoSrc ? 'Change logo' : 'Upload logo'}</Text>
            </Pressable>
            <Pressable style={styles.photoBtn} onPress={() => pickLogo('camera')}>
              <Icon name="camera-outline" size={16} color={colors.primary} />
              <Text style={styles.photoBtnText}>Camera</Text>
            </Pressable>
            {logoSrc ? (
              <Pressable style={[styles.photoBtn, styles.photoBtnIconOnly]} onPress={() => setLogoUri('')} hitSlop={4}>
                <Icon name="trash-outline" size={16} color={colors.danger} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <EditSection icon="storefront-outline" title="Store details" subtitle="What buyers see on your store page">
          <EditField
            label="Shop name"
            icon="storefront-outline"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Mobile Hub"
            autoCapitalize="words"
            maxLength={60}
            error={nameError}
            right={name.trim().length > 1 ? <Icon name="checkmark-circle" size={18} color={colors.success} /> : null}
          />

          <View>
            <View style={styles.labelRow}>
              <Text style={styles.label}>What does your shop sell?</Text>
              {categoryError ? <Text style={styles.labelError}>Pick a category</Text> : null}
            </View>
            <View style={styles.catGrid}>
              {shopCategories.map((cat) => {
                const active = category === cat.label;
                const tint = cat.tint || colors.primary;
                return (
                  <Pressable
                    key={cat.label}
                    onPress={() => setCategory(cat.label)}
                    style={[
                      styles.catChip,
                      active && { borderColor: tint, backgroundColor: `${tint}1A` },
                      categoryError && { borderColor: colors.danger },
                    ]}
                  >
                    <View style={[styles.catIcon, { backgroundColor: active ? tint : `${tint}1F` }]}>
                      {cat.imageUrl && !active ? (
                        <Image source={{ uri: cat.imageUrl }} style={styles.catImage} />
                      ) : (
                        <Icon name={active ? 'checkmark' : cat.icon || 'pricetag-outline'} size={13} color={active ? '#fff' : tint} />
                      )}
                    </View>
                    <Text style={[styles.catText, active && { color: tint }]}>{cat.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <EditField
            label="About your shop"
            icon="document-text-outline"
            value={description}
            onChangeText={setDescription}
            placeholder="What you sell, brands you carry, warranty or delivery info…"
            multiline
            maxLength={500}
          />
        </EditSection>

        <EditSection icon="location-outline" title="Location & contact" subtitle="Filled from your GPS. Edit anything that looks off.">
          <EditField
            label="City or area"
            icon="location-outline"
            value={location}
            onChangeText={(text) => {
              setLocation(text);
              setCoords(null);
            }}
            placeholder="e.g. Barahathawa, Sarlahi"
            autoCapitalize="words"
            error={locationError}
            hint={coords ? 'Detected from your GPS. Nearby buyers will see your shop.' : 'Type your city or tap Detect'}
            right={
              <Pressable onPress={() => detectLocation()} style={styles.gpsBtn} disabled={locating}>
                {locating ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Icon name={coords ? 'locate' : 'navigate'} size={13} color={colors.primary} />
                )}
                <Text style={styles.gpsBtnText}>{coords ? 'GPS' : 'Detect'}</Text>
              </Pressable>
            }
          />
          <EditField
            label="Street address"
            icon="map-outline"
            value={address}
            onChangeText={(text) => {
              addressTouched.current = true;
              setAddress(text);
            }}
            placeholder={location ? `Street, ${location}` : 'Street, landmark'}
            hint="Leave empty to use your city or area"
          />
          <EditField
            label="Shop phone"
            icon="call-outline"
            value={phone}
            onChangeText={(value) => setPhone(value.replace(/[^\d+]/g, '').slice(0, 14))}
            placeholder="98XXXXXXXX"
            keyboardType="phone-pad"
            hint="Hidden from buyers until you turn on Show phone number in Privacy"
          />
          <View>
            <EditField
              label="Opening hours"
              icon="time-outline"
              value={openingHours}
              onChangeText={setOpeningHours}
              placeholder="9:00 AM - 8:00 PM"
            />
            <View style={styles.presetRow}>
              {HOUR_PRESETS.map((preset) => {
                const active = openingHours === preset;
                return (
                  <Pressable key={preset} onPress={() => setOpeningHours(preset)} style={[styles.preset, active && styles.presetActive]}>
                    <Text style={[styles.presetText, active && styles.presetTextActive]}>{preset}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </EditSection>

        <EditSection
          icon="ribbon-outline"
          tint={colors.warning}
          title="Tax details (optional)"
          subtitle="Add PAN or VAT now or later for a verified store badge"
        >
          <FieldRow>
            <EditField
              label="PAN number"
              icon="card-outline"
              value={panNumber}
              onChangeText={setPanNumber}
              placeholder="123456789"
              keyboardType="number-pad"
              autoCapitalize="characters"
            />
            <EditField
              label="VAT number"
              icon="receipt-outline"
              value={vatNumber}
              onChangeText={setVatNumber}
              placeholder="Optional"
              autoCapitalize="characters"
            />
          </FieldRow>
          {isEdit ? (
            <Pressable style={styles.verifyLink} onPress={() => navigation.navigate(ROUTES.SHOP_VERIFICATION)}>
              <Icon name="shield-checkmark-outline" size={18} color={colors.primary} />
              <Text style={styles.verifyLinkText}>Upload documents & request verification</Text>
              <Icon name="chevron-forward" size={16} color={colors.primary} />
            </Pressable>
          ) : null}
        </EditSection>

        <View style={styles.noteCard}>
          <Icon name="information-circle" size={20} color={colors.info} />
          <Text style={styles.noteText}>
            You can change these details, add a banner and submit documents later from your store dashboard.
          </Text>
        </View>

        <View>
          <GradientButton
            title={submitting ? 'Saving…' : isEdit ? 'Save shop' : 'Create my shop'}
            icon={submitting ? undefined : 'arrow-forward'}
            disabled={submitting}
            onPress={handleSubmit}
          />
          <Text style={styles.submitHint}>
            {doneCount === steps.length
              ? 'All set. Your shop is ready to go live!'
              : `${steps.length - doneCount} step${steps.length - doneCount === 1 ? '' : 's'} left${logoUri ? '' : ' · logo is optional'}`}
          </Text>
        </View>
      </FormScroll>

      <AlertModal visible={!!alertConfig} onClose={closeAlert} {...(alertConfig || {})} />
    </View>
  );
}

const createStyles = (colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 14 },
  header: {
    marginHorizontal: -16,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  headerBadgeText: { fontSize: 11.5, fontWeight: '800', color: colors.onGradient, letterSpacing: 0.3 },
  headerPct: { fontSize: 13, fontWeight: '800', color: colors.onGradient },
  title: { fontSize: 25, fontWeight: '800', color: colors.onGradient },
  subtitle: { marginTop: 4, fontSize: 13.5, lineHeight: 19, color: 'rgba(255,255,255,0.86)' },
  progressTrack: { flexDirection: 'row', gap: 5, marginTop: 16 },
  progressSeg: { flex: 1, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  progressSegDone: { backgroundColor: colors.onGradient },
  stepRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 9 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  stepTextDone: { color: colors.onGradient },
  previewCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logoWrap: { width: 84, height: 84 },
  logoRing: { width: 84, height: 84, borderRadius: 24, padding: 3 },
  logoInner: {
    flex: 1,
    borderRadius: 21,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: { width: '100%', height: '100%' },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.surface,
  },
  previewEyebrow: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  previewName: { marginTop: 3, fontSize: 18, fontWeight: '800', color: colors.text },
  previewPlaceholder: { color: colors.textTertiary },
  previewMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  previewMetaText: { flex: 1, fontSize: 12.5, color: colors.textMuted },
  previewPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    maxWidth: '100%',
  },
  pillText: { fontSize: 10.5, fontWeight: '800' },
  photoActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoBtnText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  photoBtnIconOnly: { flex: 0, width: 38 },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    paddingHorizontal: 9,
    marginRight: -6,
    borderRadius: 9,
    backgroundColor: `${colors.primary}1A`,
  },
  gpsBtnText: { fontSize: 11.5, fontWeight: '800', color: colors.primary },
  label: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  labelError: { fontSize: 11, fontWeight: '700', color: colors.danger, marginBottom: 6 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 5,
    paddingRight: 11,
    paddingVertical: 5,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  catIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  catImage: { width: 16, height: 16, borderRadius: 4 },
  catText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  preset: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  presetActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}14` },
  presetText: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  presetTextActive: { color: colors.primary },
  verifyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: `${colors.primary}10`,
  },
  verifyLinkText: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.primary },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: `${colors.info}14`,
  },
  noteText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  submitHint: { marginTop: 8, textAlign: 'center', fontSize: 11.5, color: colors.textMuted },
});
