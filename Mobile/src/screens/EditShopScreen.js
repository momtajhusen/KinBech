import { useCallback, useEffect, useState } from 'react';
import Icon from '../components/Icon';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertModal, showErrorAlert, showSuccessAlert, showImageSafetyAlert } from '../components/AlertModal';
import EmptyState from '../components/EmptyState';
import { FormScroll, KeyboardForm } from '../components/FormScroll';
import { ChipSelect, EditField, EditSection, FieldRow } from '../components/ProfileEditKit';
import ScreenLoader from '../components/ScreenLoader';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { useCategories } from '../utils/categories';
import { resolveMediaUrl } from '../utils/listing';
import { coordsForPlaceName, formatCityDistrict } from '../utils/locations';
import { uploadMediaUri } from '../utils/mediaUpload';
import { pickFromLibrary } from '../utils/pickImage';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

const LOGO = 88;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PAYMENTS = ['Cash', 'eSewa', 'Khalti', 'Fonepay', 'Bank transfer', 'Card'];
const PAYMENT_ICONS = {
  Cash: 'cash-outline',
  eSewa: 'wallet-outline',
  Khalti: 'wallet-outline',
  Fonepay: 'qr-code-outline',
  'Bank transfer': 'business-outline',
  Card: 'card-outline',
};
const SOCIALS = [
  { key: 'facebook', label: 'Facebook', icon: 'logo-facebook', placeholder: 'facebook.com/yourstore' },
  { key: 'instagram', label: 'Instagram', icon: 'logo-instagram', placeholder: '@yourstore' },
  { key: 'tiktok', label: 'TikTok', icon: 'logo-tiktok', placeholder: '@yourstore' },
  { key: 'youtube', label: 'YouTube', icon: 'logo-youtube', placeholder: 'youtube.com/@yourstore' },
];
const VERIFY_COPY = {
  approved: { label: 'Verified', icon: 'shield-checkmark', tone: 'success' },
  pending: { label: 'Under review', icon: 'time-outline', tone: 'warning' },
  rejected: { label: 'Rejected', icon: 'close-circle-outline', tone: 'danger' },
  none: { label: 'Not verified', icon: 'shield-outline', tone: 'textMuted' },
};

const EMPTY_FORM = {
  name: '',
  tagline: '',
  category: '',
  description: '',
  establishedYear: '',
  phone: '',
  whatsapp: '',
  email: '',
  website: '',
  address: '',
  location: '',
  openingHours: '9:00 AM - 8:00 PM',
  openDays: DAYS,
  deliveryAvailable: false,
  deliveryAreas: '',
  paymentMethods: ['Cash'],
  returnPolicy: '',
  socialLinks: { facebook: '', instagram: '', tiktok: '', youtube: '' },
};

function formFromShop(shop) {
  return {
    name: shop.name || '',
    tagline: shop.tagline || '',
    category: shop.category || '',
    description: shop.description || '',
    establishedYear: shop.establishedYear ? String(shop.establishedYear) : '',
    phone: shop.phone || '',
    whatsapp: shop.whatsapp || '',
    email: shop.email || '',
    website: shop.website || '',
    address: shop.address || '',
    location: shop.location || '',
    openingHours: shop.openingHours || EMPTY_FORM.openingHours,
    openDays: shop.openDays?.length ? shop.openDays : DAYS,
    deliveryAvailable: Boolean(shop.deliveryAvailable),
    deliveryAreas: shop.deliveryAreas || '',
    paymentMethods: shop.paymentMethods?.length ? shop.paymentMethods : ['Cash'],
    returnPolicy: shop.returnPolicy || '',
    socialLinks: { ...EMPTY_FORM.socialLinks, ...(shop.socialLinks || {}) },
  };
}

function toggle(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function EditShopScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const shopCategories = useCategories('shop');
  const { user, saveSession } = useAuth();

  const [ownerName, setOwnerName] = useState(user?.name || '');
  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [coords, setCoords] = useState(null);
  const [logoUri, setLogoUri] = useState('');
  const [errors, setErrors] = useState({});

  const closeAlert = () => setAlertConfig(null);
  const fail = (title, message) => setAlertConfig(showErrorAlert({ title, message, onConfirm: closeAlert }));
  const set = (key) => (value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  };
  const setSocial = (key) => (value) =>
    setForm((prev) => ({ ...prev, socialLinks: { ...prev.socialLinks, [key]: value } }));

  const load = useCallback(async () => {
    const { data } = await api.getMyShop();
    const next = data?.shop || null;
    setShop(next);
    if (next) {
      setForm(formFromShop(next));
      setLogoUri(next.logo || '');
      if (next.coordinates?.lat != null) setCoords({ lat: next.coordinates.lat, lng: next.coordinates.lng });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pickImage = async (kind) => {
    try {
      const picked = await pickFromLibrary({ aspect: [1, 1], quality: 0.85, maxWidth: 800 });
      if (picked.error === 'permission') {
        fail('Permission Required', 'Allow photo access to update your store images.');
        return;
      }
      if (!picked.uri) return;
      setLogoUri(picked.uri);
    } catch {
      fail('Error', 'Could not open your photos. Please try again.');
    }
  };

  const getCurrentLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        fail('Location permission', 'Allow location access to auto-fill your city.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const geocode = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      if (geocode?.[0]) set('location')(formatCityDistrict(geocode[0], 'Kathmandu'));
      setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    } catch {
      fail('Location error', 'Could not fetch location. Please enter it manually.');
    } finally {
      setLocating(false);
    }
  };

  const uploadImage = async (uri) => {
    if (!uri) return { url: '' };
    const uploaded = await uploadMediaUri(uri, 'shops');
    if (uploaded.error) {
      setAlertConfig(
        uploaded.isSafetyBlock || uploaded.errorCode
          ? showImageSafetyAlert({
              code: uploaded.errorCode,
              message: uploaded.error,
              issues: uploaded.issues,
              onConfirm: closeAlert,
            })
          : showErrorAlert({ title: 'Image upload failed', message: uploaded.error, onConfirm: closeAlert })
      );
      return null;
    }
    return { url: uploaded.url };
  };

  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = 'Store name is required';
    if (!ownerName.trim()) next.ownerName = 'Your name is required';
    if (!form.location.trim()) next.location = 'City / area is required';
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = 'Enter a valid email';
    const year = form.establishedYear.trim();
    if (year && (!/^\d{4}$/.test(year) || Number(year) < 1900 || Number(year) > new Date().getFullYear())) {
      next.establishedYear = 'Enter a valid year';
    }
    if (!form.openDays.length) next.openDays = 'Pick at least one day';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      fail('Check your details', 'Please fix the highlighted fields.');
      return;
    }
    setSaving(true);
    const logo = await uploadImage(logoUri);
    if (!logo) return setSaving(false);

    const payload = {
      ...form,
      name: form.name.trim(),
      tagline: form.tagline.trim(),
      description: form.description.trim(),
      establishedYear: form.establishedYear.trim() ? Number(form.establishedYear) : null,
      location: form.location.trim(),
      logo: logo.url,
      coordinates: coords || coordsForPlaceName(form.location),
    };
    const { error } = await api.updateShop(shop._id || shop.id, payload);
    if (error) {
      setSaving(false);
      fail('Could not save store', error);
      return;
    }

    const point = payload.coordinates;
    const me = await api.updateMe({
      name: ownerName.trim(),
      avatarUrl: logo.url,
      location: payload.location,
      ...(point?.lat != null ? { coordinates: { latitude: point.lat, longitude: point.lng } } : {}),
    });
    setSaving(false);
    if (me.error) {
      fail('Store saved, profile not updated', me.error);
      return;
    }
    if (me.data?.token) await saveSession(me.data.token, me.data.user);
    setAlertConfig(
      showSuccessAlert({
        title: 'Store updated',
        message: 'Your store profile is live with the new details.',
        onConfirm: () => {
          closeAlert();
          navigation.goBack();
        },
      })
    );
  };

  if (loading) return <ScreenLoader />;

  if (!shop) {
    return (
      <View style={styles.root}>
        <ThemeStatusBar variant="header" />
        <EmptyState
          icon="storefront-outline"
          title="No store yet"
          body="Create your store first, then come back to customise it."
          buttonLabel="Create store"
          onButtonPress={() => navigation.replace(ROUTES.CREATE_SHOP)}
        />
      </View>
    );
  }

  const checks = [
    logoUri,
    form.tagline,
    form.description,
    form.phone,
    form.whatsapp,
    form.email || form.website,
    form.address,
    form.location,
    Object.values(form.socialLinks).some(Boolean),
  ];
  const completion = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  const verify = VERIFY_COPY[shop.verificationStatus] || VERIFY_COPY.none;
  const verifyColor = colors[verify.tone];

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <KeyboardForm>
        <FormScroll contentContainerStyle={{ paddingBottom: 24 }}>
          <View style={{ height: insets.top + 120 }}>
            <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill} />
            <View style={[styles.coverBar, { top: insets.top + 8 }]}>
              <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.roundBtn}>
                <Icon name="chevron-back" size={20} color="#fff" />
              </Pressable>
              <Text style={styles.coverTitle}>Edit store</Text>
              <View style={styles.roundGhost} />
            </View>
          </View>

          <View style={styles.identity}>
            <Pressable onPress={() => pickImage('logo')} style={styles.logoWrap}>
              <View style={styles.logo}>
                {logoUri ? (
                  <Image source={{ uri: resolveMediaUrl(logoUri) || logoUri }} style={styles.fill} />
                ) : (
                  <Icon name="storefront" size={34} color={colors.primary} />
                )}
              </View>
              <View style={styles.logoCamera}>
                <Icon name="camera" size={13} color="#fff" />
              </View>
            </Pressable>
            <View style={styles.identityText}>
              <View style={styles.nameRow}>
                <Text style={styles.previewName} numberOfLines={1}>
                  {form.name.trim() || 'Your store'}
                </Text>
                {shop.isVerified ? <Icon name="shield-checkmark" size={15} color={colors.primary} /> : null}
              </View>
              <Text style={styles.previewTagline} numberOfLines={1}>
                {form.tagline.trim() || form.category || 'Add a short tagline'}
              </Text>
            </View>
          </View>

          <View style={styles.progressCard}>
            <View style={styles.progressHead}>
              <Text style={styles.progressTitle}>Store profile {completion}% complete</Text>
              <Text style={styles.progressHint}>{completion >= 100 ? 'Looks great!' : 'Complete stores get more chats'}</Text>
            </View>
            <View style={styles.progressTrack}>
              <LinearGradient
                colors={colors.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressFill, { width: `${Math.max(6, completion)}%` }]}
              />
            </View>
          </View>

          <View style={styles.sections}>
            <EditSection icon="storefront-outline" title="Store details" subtitle="Name, category and what you sell">
              <EditField
                label="Store name"
                icon="storefront-outline"
                value={form.name}
                onChangeText={set('name')}
                placeholder="Your business name"
                autoCapitalize="words"
                error={errors.name}
              />
              <EditField
                label="Tagline"
                icon="sparkles-outline"
                value={form.tagline}
                onChangeText={set('tagline')}
                placeholder="e.g. Genuine phones & accessories since 2015"
                maxLength={80}
              />
              <View>
                <Text style={styles.fieldLabel}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
                  {shopCategories.map((cat) => {
                    const active = form.category === cat.label;
                    return (
                      <Pressable
                        key={cat.label}
                        onPress={() => set('category')(cat.label)}
                        style={[styles.catChip, active && styles.catChipActive]}
                      >
                        {cat.imageUrl ? (
                          <Image source={{ uri: cat.imageUrl }} style={styles.catImage} />
                        ) : (
                          <Icon name={cat.icon} size={13} color={active ? colors.onPrimary : colors.textSecondary} />
                        )}
                        <Text style={[styles.catText, active && styles.catTextActive]}>{cat.label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
              <EditField
                label="About your store"
                value={form.description}
                onChangeText={set('description')}
                placeholder="What do you sell? What makes your store special?"
                multiline
                maxLength={500}
              />
              <EditField
                label="Established in"
                icon="calendar-outline"
                value={form.establishedYear}
                onChangeText={(t) => set('establishedYear')(t.replace(/\D/g, '').slice(0, 4))}
                placeholder="e.g. 2015"
                keyboardType="number-pad"
                error={errors.establishedYear}
              />
            </EditSection>

            <EditSection
              icon="person-circle-outline"
              title="Owner details"
              subtitle="Your account uses the store logo as its photo"
              tint={colors.menuBlue}
            >
              <EditField
                label="Your name"
                icon="person-outline"
                value={ownerName}
                onChangeText={(t) => {
                  setOwnerName(t);
                  if (errors.ownerName) setErrors((prev) => ({ ...prev, ownerName: '' }));
                }}
                placeholder="Store owner's full name"
                autoCapitalize="words"
                error={errors.ownerName}
              />
              <EditField
                label={user?.phone ? 'Login phone' : 'Login email'}
                icon={user?.phone ? 'call-outline' : 'mail-outline'}
                value={user?.phone || user?.email || '—'}
                editable={false}
                right={
                  <View style={styles.verifiedTag}>
                    <Icon name="shield-checkmark" size={11} color={colors.success} />
                    <Text style={styles.verifiedText}>Verified</Text>
                  </View>
                }
              />
            </EditSection>

            <EditSection icon="call-outline" title="Contact" subtitle="How customers reach you" tint={colors.menuBlue}>
              <FieldRow>
                <EditField
                  label="Phone"
                  icon="call-outline"
                  value={form.phone}
                  onChangeText={set('phone')}
                  placeholder="98XXXXXXXX"
                  keyboardType="phone-pad"
                />
                <EditField
                  label="WhatsApp"
                  icon="logo-whatsapp"
                  value={form.whatsapp}
                  onChangeText={set('whatsapp')}
                  placeholder="98XXXXXXXX"
                  keyboardType="phone-pad"
                />
              </FieldRow>
              {form.phone && !form.whatsapp ? (
                <Pressable onPress={() => set('whatsapp')(form.phone)} style={styles.inlineAction}>
                  <Icon name="copy-outline" size={12} color={colors.primary} />
                  <Text style={styles.inlineActionText}>Use phone number for WhatsApp</Text>
                </Pressable>
              ) : null}
              {(form.phone || form.whatsapp) && !user?.preferences?.showPhone ? (
                <Pressable onPress={() => navigation.navigate(ROUTES.PRIVACY)} style={styles.phoneHiddenNote}>
                  <Icon name="eye-off-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.phoneHiddenText}>
                    Hidden from buyers. Turn on <Text style={styles.inlineActionText}>Show phone number</Text> in Privacy to show it.
                  </Text>
                </Pressable>
              ) : null}
              <EditField
                label="Email"
                icon="mail-outline"
                value={form.email}
                onChangeText={set('email')}
                placeholder="store@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                error={errors.email}
              />
              <EditField
                label="Website"
                icon="globe-outline"
                value={form.website}
                onChangeText={set('website')}
                placeholder="www.yourstore.com"
                keyboardType="url"
                autoCapitalize="none"
              />
            </EditSection>

            <EditSection icon="location-outline" title="Location" subtitle="Shown with directions on your store page" tint={colors.danger}>
              <EditField
                label="Street address"
                icon="home-outline"
                value={form.address}
                onChangeText={set('address')}
                placeholder="Shop no., building, street"
              />
              <EditField
                label="City / area"
                icon="location-outline"
                value={form.location}
                onChangeText={(t) => {
                  set('location')(t);
                  setCoords(null);
                }}
                placeholder="e.g. New Road, Kathmandu"
                autoCapitalize="words"
                error={errors.location}
                right={
                  <Pressable onPress={getCurrentLocation} disabled={locating} hitSlop={8} style={styles.gpsBtn}>
                    {locating ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <>
                        <Icon name="locate" size={13} color={colors.primary} />
                        <Text style={styles.gpsText}>GPS</Text>
                      </>
                    )}
                  </Pressable>
                }
              />
            </EditSection>

            <EditSection icon="time-outline" title="Business hours" subtitle="Buyers see if you're open now" tint={colors.warning}>
              <EditField
                label="Opening hours"
                icon="time-outline"
                value={form.openingHours}
                onChangeText={set('openingHours')}
                placeholder="e.g. 9:00 AM - 8:00 PM"
              />
              <View>
                <Text style={styles.fieldLabel}>Open on</Text>
                <View style={styles.daysRow}>
                  {DAYS.map((day) => {
                    const active = form.openDays.includes(day);
                    return (
                      <Pressable
                        key={day}
                        onPress={() => set('openDays')(DAYS.filter((d) => (d === day ? !active : form.openDays.includes(d))))}
                        style={[styles.dayChip, active && styles.dayChipActive]}
                      >
                        <Text style={[styles.dayText, active && styles.dayTextActive]}>{day}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {errors.openDays ? <Text style={styles.errorText}>{errors.openDays}</Text> : null}
              </View>
            </EditSection>

            <EditSection icon="bicycle-outline" title="Delivery & payment" subtitle="Set expectations before buyers chat" tint={colors.favorite}>
              <View style={styles.switchRow}>
                <View style={styles.flex1}>
                  <Text style={styles.switchTitle}>Home delivery available</Text>
                  <Text style={styles.switchSub}>Show a delivery badge on your store</Text>
                </View>
                <Switch
                  value={form.deliveryAvailable}
                  onValueChange={set('deliveryAvailable')}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#fff"
                />
              </View>
              {form.deliveryAvailable ? (
                <EditField
                  label="Delivery areas"
                  icon="map-outline"
                  value={form.deliveryAreas}
                  onChangeText={set('deliveryAreas')}
                  placeholder="e.g. Inside Kathmandu valley"
                />
              ) : null}
              <View>
                <Text style={styles.fieldLabel}>Payments accepted</Text>
                <ChipSelect
                  options={PAYMENTS}
                  selected={form.paymentMethods}
                  onToggle={(m) => set('paymentMethods')(toggle(form.paymentMethods, m))}
                  icons={PAYMENT_ICONS}
                />
              </View>
              <EditField
                label="Return / exchange policy"
                value={form.returnPolicy}
                onChangeText={set('returnPolicy')}
                placeholder="e.g. 7-day exchange with bill"
                multiline
                maxLength={300}
              />
            </EditSection>

            <EditSection icon="share-social-outline" title="Social links" subtitle="Let customers follow your store" tint={colors.menuBlue}>
              {SOCIALS.map((s) => (
                <EditField
                  key={s.key}
                  icon={s.icon}
                  value={form.socialLinks[s.key]}
                  onChangeText={setSocial(s.key)}
                  placeholder={s.placeholder}
                  autoCapitalize="none"
                />
              ))}
            </EditSection>

            <Pressable style={styles.verifyCard} onPress={() => navigation.navigate(ROUTES.SHOP_VERIFICATION)}>
              <View style={[styles.verifyIcon, { backgroundColor: `${verifyColor}1A` }]}>
                <Icon name={verify.icon} size={18} color={verifyColor} />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.verifyTitle}>Business verification</Text>
                <Text style={styles.verifySub}>PAN / VAT and documents for a verified badge</Text>
              </View>
              <View style={[styles.verifyPill, { backgroundColor: `${verifyColor}1A` }]}>
                <Text style={[styles.verifyPillText, { color: verifyColor }]}>{verify.label}</Text>
              </View>
            </Pressable>
          </View>
        </FormScroll>

        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
          <Pressable
            style={styles.previewBtn}
            onPress={() => navigation.navigate(ROUTES.SHOP_PROFILE, { shopId: shop._id || shop.id })}
          >
            <Icon name="eye-outline" size={17} color={colors.primary} />
            <Text style={styles.previewBtnText}>View</Text>
          </Pressable>
          <Pressable style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Icon name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.saveText}>Save store</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardForm>

      <AlertModal visible={!!alertConfig} onClose={closeAlert} {...(alertConfig || {})} />
    </View>
  );
}

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex1: {
    flex: 1,
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  coverBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roundBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  roundGhost: {
    width: 34,
  },
  coverTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    marginTop: -LOGO / 2,
    paddingHorizontal: 16,
  },
  logoWrap: {
    width: LOGO,
    height: LOGO,
  },
  logo: {
    width: LOGO,
    height: LOGO,
    borderRadius: 22,
    borderWidth: 4,
    borderColor: colors.background,
    backgroundColor: colors.pastelGreen,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoCamera: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.background,
  },
  identityText: {
    flex: 1,
    paddingBottom: 6,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  previewName: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  previewTagline: {
    marginTop: 1,
    fontSize: 12,
    color: colors.textMuted,
  },
  progressCard: {
    marginHorizontal: 16,
    marginTop: 14,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  progressHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  progressTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.text,
  },
  progressHint: {
    flexShrink: 1,
    fontSize: 11,
    color: colors.textMuted,
  },
  progressTrack: {
    height: 7,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: colors.iconBackground,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  sections: {
    padding: 16,
    gap: 12,
  },
  fieldLabel: {
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  catRow: {
    gap: 7,
    paddingRight: 4,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  catChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  catImage: {
    width: 15,
    height: 15,
    borderRadius: 4,
  },
  catText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  catTextActive: {
    color: colors.onPrimary,
  },
  verifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: colors.pastelGreen,
  },
  verifiedText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.success,
  },
  inlineAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: -4,
  },
  inlineActionText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.primary,
  },
  phoneHiddenNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: -4,
  },
  phoneHiddenText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.textMuted,
  },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.pastelGreen,
  },
  gpsText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  daysRow: {
    flexDirection: 'row',
    gap: 5,
  },
  dayChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  dayChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.pastelGreen,
  },
  dayText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.textMuted,
  },
  dayTextActive: {
    color: colors.primary,
  },
  errorText: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: colors.danger,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  switchTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.text,
  },
  switchSub: {
    marginTop: 1,
    fontSize: 11.5,
    color: colors.textMuted,
  },
  verifyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  verifyIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  verifySub: {
    marginTop: 1,
    fontSize: 11.5,
    color: colors.textMuted,
  },
  verifyPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9,
  },
  verifyPillText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  bottomBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  previewBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },
});
