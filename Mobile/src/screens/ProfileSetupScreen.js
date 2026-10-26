import { useEffect, useState } from 'react';
import Icon from '../components/Icon';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GradientButton from '../components/GradientButton';
import { FormScroll } from '../components/FormScroll';
import { EditField, EditSection, FieldRow } from '../components/ProfileEditKit';
import { AlertModal, showErrorAlert, showImageSafetyAlert } from '../components/AlertModal';
import { finishLogin } from '../components/LoginPrompt';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { uploadMediaUri } from '../utils/mediaUpload';
import { resolveMediaUrl } from '../utils/listing';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { useCategories } from '../utils/categories';
import { coordsForPlaceName, formatCityDistrict } from '../utils/locations';

const SELL_TYPES = [
  {
    id: 'individual',
    icon: 'person',
    title: 'Individual',
    desc: 'Sell your own items',
    perks: ['Free', 'Post in seconds', 'Chat with buyers'],
  },
  {
    id: 'shop',
    icon: 'storefront',
    title: 'Store',
    desc: 'Run your shop online',
    perks: ['Store page', 'Sales analytics', 'Verified badge'],
  },
];

const HOUR_PRESETS = ['9:00 AM - 8:00 PM', '10:00 AM - 7:00 PM', '7:00 AM - 9:00 PM', 'Open 24 hours'];

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    marginHorizontal: -16,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 56,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
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
  headerBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: colors.onGradient,
    letterSpacing: 0.3,
  },
  headerPct: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.onGradient,
  },
  welcome: {
    fontSize: 25,
    fontWeight: '800',
    color: colors.onGradient,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13.5,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.86)',
  },
  progressTrack: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 16,
  },
  progressSeg: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  progressSegDone: {
    backgroundColor: colors.onGradient,
  },
  stepRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 9,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stepText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
  },
  stepTextDone: {
    color: colors.onGradient,
  },
  content: {
    paddingHorizontal: 16,
    gap: 14,
  },
  previewCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarWrap: {
    width: 84,
    height: 84,
  },
  avatarRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    padding: 3,
  },
  avatarRingStore: {
    borderRadius: 24,
  },
  avatarInner: {
    flex: 1,
    borderRadius: 39,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarInnerStore: {
    borderRadius: 21,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
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
  previewCopy: {
    flex: 1,
  },
  previewEyebrow: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  previewName: {
    marginTop: 3,
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  previewPlaceholder: {
    color: colors.textTertiary,
  },
  previewMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  previewMetaText: {
    flex: 1,
    fontSize: 12.5,
    color: colors.textMuted,
  },
  previewPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  pillText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
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
  photoBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.text,
  },
  photoBtnIconOnly: {
    flex: 0,
    width: 38,
  },
  verifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: `${colors.success}1F`,
  },
  verifiedTagText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: colors.success,
  },
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
  gpsBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: colors.primary,
  },
  typePicker: {
    marginTop: -56,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  typePickerLabel: {
    marginBottom: 8,
    marginLeft: 2,
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  typeTile: {
    flex: 1,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  typeTileActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}14`,
  },
  typeTileTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: `${colors.primary}1A`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeIconActive: {
    backgroundColor: colors.primary,
  },
  typeTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  typeTitleActive: {
    color: colors.primary,
  },
  typeDesc: {
    marginTop: 1,
    fontSize: 11.5,
    color: colors.textMuted,
  },
  perkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
    marginLeft: 2,
  },
  perk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  perkText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labelError: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.danger,
    marginBottom: 6,
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
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
  },
  catText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  preset: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  presetActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}14`,
  },
  presetText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  presetTextActive: {
    color: colors.primary,
  },
  taxHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  taxTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  taxHint: {
    marginTop: 1,
    fontSize: 11,
    color: colors.textMuted,
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: `${colors.info}14`,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  submitWrap: {
    marginTop: 2,
  },
  submitHint: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 11.5,
    color: colors.textMuted,
  },
});

export default function ProfileSetupScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { user, saveSession } = useAuth();
  const shopCategories = useCategories('shop');
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const accountEmail = user?.email || '';
  const [location, setLocation] = useState('');
  const [coordinates, setCoordinates] = useState(null);
  const [avatarUri, setAvatarUri] = useState(user?.avatarUrl || '');
  const [sellerTypePreference, setSellerTypePreference] = useState('individual');
  const [shopName, setShopName] = useState('');
  const [shopCategory, setShopCategory] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [openingHours, setOpeningHours] = useState('9:00 AM - 8:00 PM');
  const [panNumber, setPanNumber] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const isShop = sellerTypePreference === 'shop';

  const steps = [
    { label: 'Photo', done: Boolean(avatarUri) },
    { label: 'Name', done: Boolean(name.trim()) },
    { label: 'Location', done: Boolean(location.trim()) },
    ...(isShop
      ? [
          { label: 'Store name', done: Boolean(shopName.trim()) },
          { label: 'Category', done: Boolean(shopCategory) },
        ]
      : []),
  ];
  const doneCount = steps.filter((step) => step.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);

  const nameError = submitted && !name.trim() ? 'Please enter your name' : '';
  const locationError = submitted && !location.trim() ? 'Please add your city or area' : '';
  const shopNameError = submitted && isShop && !shopName.trim() ? 'Please enter your store name' : '';
  const categoryError = submitted && isShop && !shopCategory;

  const showError = (title, message) =>
    setAlertConfig(showErrorAlert({ title, message, onConfirm: () => setAlertConfig(null) }));

  const pickImage = async (source = 'library') => {
    try {
      const fromCamera = source === 'camera';
      const { status } = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showError(
          'Permission Required',
          fromCamera
            ? 'Please allow camera access to take a profile photo.'
            : 'Please grant camera roll permissions to upload a profile photo.'
        );
        return;
      }

      const options = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 };
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

      if (!result.canceled && result.assets[0]) {
        setAvatarUri(result.assets[0].uri);
      }
    } catch {
      showError('Error', 'Failed to pick image. Please try again.');
    }
  };

  const getCurrentLocation = async ({ silent = false } = {}) => {
    try {
      setLocationLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationLoading(false);
        if (!silent) {
          showError('Permission Required', 'Please grant location permissions to set your current location.');
        }
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = currentLocation.coords;
      const reverseGeocode = await Location.reverseGeocodeAsync({ latitude, longitude });
      const locationName = formatCityDistrict(reverseGeocode[0]) || 'Unknown Location';

      setLocation(locationName);
      setCoordinates({ latitude, longitude });
      setLocationLoading(false);
    } catch {
      setLocationLoading(false);
      if (!silent) {
        showError('Location Error', 'Failed to get your location. Please enter it manually.');
      }
    }
  };

  useEffect(() => {
    getCurrentLocation({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completeProfile = async () => {
    setSubmitted(true);
    if (!name.trim()) {
      showError('Name Required', 'Please enter your name to continue.');
      return;
    }
    if (!location.trim()) {
      showError('Location Required', 'Please enter your location to continue.');
      return;
    }

    if (isShop) {
      if (!shopName.trim()) {
        showError('Store name required', 'Please enter your store name to continue as a shop owner.');
        return;
      }
      if (!shopCategory) {
        showError('Store category required', 'Please choose what your store sells.');
        return;
      }
    }

    setLoading(true);
    try {
      let nextAvatarUrl = avatarUri || '';
      // Remote URLs (the Google profile photo) are stored as-is; only local picks are uploaded.
      if (nextAvatarUrl && !/^https?:\/\//i.test(nextAvatarUrl)) {
        const uploaded = await uploadMediaUri(nextAvatarUrl, isShop ? 'shops' : 'avatars');
        if (uploaded.error) {
          setLoading(false);
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
        nextAvatarUrl = uploaded.url;
      }

      const namedPlace = coordinates?.latitude != null ? null : coordsForPlaceName(location);
      const profileCoordinates = coordinates?.latitude != null
        ? coordinates
        : namedPlace
          ? { latitude: namedPlace.lat, longitude: namedPlace.lng }
          : undefined;

      const { data, error } = await api.updateProfile({
        name: name.trim(),
        location: location.trim(),
        avatarUrl: nextAvatarUrl,
        coordinates: profileCoordinates,
        sellerTypePreference,
      });

      if (error) {
        setLoading(false);
        showError('Update Failed', error);
        return;
      }

      await saveSession(data.token, data.user);

      if (isShop) {
        const shopRes = await api.createShop({
          name: shopName.trim(),
          category: shopCategory,
          logo: nextAvatarUrl || undefined,
          phone,
          address: (shopAddress || location).trim(),
          location: location.trim(),
          openingHours: openingHours.trim() || '9:00 AM - 8:00 PM',
          panNumber: panNumber.trim() || undefined,
          vatNumber: vatNumber.trim() || undefined,
          coordinates: coordinates?.latitude != null
            ? { lat: coordinates.latitude, lng: coordinates.longitude }
            : profileCoordinates
              ? { lat: profileCoordinates.latitude, lng: profileCoordinates.longitude }
              : undefined,
        });
        if (shopRes.error && !String(shopRes.error).toLowerCase().includes('already')) {
          setLoading(false);
          showError('Store details', shopRes.error);
          return;
        }
      }

      setLoading(false);
      finishLogin(navigation);
    } catch {
      setLoading(false);
      showError('Error', 'Failed to complete profile. Please try again.');
    }
  };

  const previewName = isShop ? shopName.trim() : name.trim();
  const avatarSrc = avatarUri ? resolveMediaUrl(avatarUri) || avatarUri : '';

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <LinearGradient
        colors={colors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ height: insets.top }}
      />
      <FormScroll contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
        <LinearGradient
          colors={colors.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.header}
        >
          <View style={styles.headerTop}>
            <View style={styles.headerBadge}>
              <Icon name="sparkles" size={12} color={colors.onGradient} />
              <Text style={styles.headerBadgeText}>WELCOME TO KINBECH</Text>
            </View>
            <Text style={styles.headerPct}>{pct}% done</Text>
          </View>
          <Text style={styles.welcome}>Set up your profile</Text>
          <Text style={styles.subtitle}>A complete profile gets more trust and faster replies from buyers nearby.</Text>
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

        <View style={styles.typePicker}>
          <Text style={styles.typePickerLabel}>I want to sell as</Text>
          <View style={styles.typeRow}>
            {SELL_TYPES.map((type) => {
              const active = sellerTypePreference === type.id;
              return (
                <Pressable
                  key={type.id}
                  style={[styles.typeTile, active && styles.typeTileActive]}
                  onPress={() => setSellerTypePreference(type.id)}
                >
                  <View style={styles.typeTileTop}>
                    <View style={[styles.typeIcon, active && styles.typeIconActive]}>
                      <Icon name={type.icon} size={18} color={active ? colors.onPrimary : colors.primary} />
                    </View>
                    <View style={[styles.radio, active && styles.radioActive]}>
                      {active ? <Icon name="checkmark" size={11} color={colors.onPrimary} /> : null}
                    </View>
                  </View>
                  <Text style={[styles.typeTitle, active && styles.typeTitleActive]}>{type.title}</Text>
                  <Text style={styles.typeDesc} numberOfLines={1}>{type.desc}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.perkRow}>
            {(SELL_TYPES.find((type) => type.id === sellerTypePreference) || SELL_TYPES[0]).perks.map((perk) => (
              <View key={perk} style={styles.perk}>
                <Icon name="checkmark-circle" size={12} color={colors.primary} />
                <Text style={styles.perkText}>{perk}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.previewCard}>
          <View style={styles.previewRow}>
            <Pressable onPress={() => pickImage('library')} style={styles.avatarWrap}>
              <LinearGradient
                colors={colors.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.avatarRing, isShop && styles.avatarRingStore]}
              >
                <View style={[styles.avatarInner, isShop && styles.avatarInnerStore]}>
                  {avatarSrc ? (
                    <Image source={{ uri: avatarSrc }} style={styles.avatarImage} />
                  ) : (
                    <Icon name={isShop ? 'storefront' : 'person'} size={34} color={colors.textMuted} />
                  )}
                </View>
              </LinearGradient>
              <View style={styles.cameraBadge}>
                <Icon name={avatarSrc ? 'pencil' : 'camera'} size={13} color={colors.onGradient} />
              </View>
            </Pressable>
            <View style={styles.previewCopy}>
              <Text style={styles.previewEyebrow}>
                {isShop ? 'Your store preview' : 'How others see you'}
              </Text>
              <Text style={[styles.previewName, !previewName && styles.previewPlaceholder]} numberOfLines={1}>
                {previewName || (isShop ? 'Your store name' : 'Your name')}
              </Text>
              <View style={styles.previewMeta}>
                <Icon
                  name={isShop && shopCategory ? 'pricetag-outline' : 'location-outline'}
                  size={12}
                  color={colors.textMuted}
                />
                <Text style={styles.previewMetaText} numberOfLines={1}>
                  {isShop && shopCategory
                    ? `${shopCategory}${location ? ` · ${location}` : ''}`
                    : location || 'Add your location'}
                </Text>
              </View>
              <View style={styles.previewPills}>
                <View style={[styles.pill, { backgroundColor: `${colors.success}1F` }]}>
                  <Icon name="shield-checkmark" size={10} color={colors.success} />
                  <Text style={[styles.pillText, { color: colors.success }]}>Phone verified</Text>
                </View>
                <View style={[styles.pill, { backgroundColor: `${colors.primary}1A` }]}>
                  <Icon name={isShop ? 'storefront' : 'person'} size={10} color={colors.primary} />
                  <Text style={[styles.pillText, { color: colors.primary }]}>{isShop ? 'Store' : 'Individual'}</Text>
                </View>
              </View>
            </View>
          </View>
          <View style={styles.photoActions}>
            <Pressable style={styles.photoBtn} onPress={() => pickImage('library')}>
              <Icon name="images-outline" size={16} color={colors.primary} />
              <Text style={styles.photoBtnText}>{avatarSrc ? 'Change' : isShop ? 'Upload logo' : 'Upload photo'}</Text>
            </Pressable>
            <Pressable style={styles.photoBtn} onPress={() => pickImage('camera')}>
              <Icon name="camera-outline" size={16} color={colors.primary} />
              <Text style={styles.photoBtnText}>Camera</Text>
            </Pressable>
            {avatarSrc ? (
              <Pressable style={[styles.photoBtn, styles.photoBtnIconOnly]} onPress={() => setAvatarUri('')} hitSlop={4}>
                <Icon name="trash-outline" size={16} color={colors.danger} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <EditSection
          icon="person-circle-outline"
          title="Personal details"
          subtitle={isShop ? 'The owner behind the store' : 'Shown on your listings and chats'}
        >
          <EditField
            label={isShop ? 'Owner name' : 'Full name'}
            icon="person-outline"
            value={name}
            onChangeText={setName}
            placeholder="Enter your name"
            autoCapitalize="words"
            maxLength={60}
            error={nameError}
            right={name.trim().length > 1 ? <Icon name="checkmark-circle" size={18} color={colors.success} /> : null}
          />
          {accountEmail || user?.phone ? (
            <EditField
              label={accountEmail ? 'Email' : 'Phone number'}
              icon={accountEmail ? 'mail-outline' : 'call-outline'}
              value={accountEmail || user.phone}
              editable={false}
              hint={accountEmail ? 'From your Google account, used to sign in' : 'Verified and used to sign in'}
              right={
                <View style={styles.verifiedTag}>
                  <Icon name="shield-checkmark" size={11} color={colors.success} />
                  <Text style={styles.verifiedTagText}>Verified</Text>
                </View>
              }
            />
          ) : null}
          <EditField
            label="Location"
            icon="location-outline"
            value={location}
            onChangeText={(text) => {
              setLocation(text);
              setCoordinates(null);
            }}
            placeholder="City or area, e.g. Barahathawa"
            autoCapitalize="words"
            error={locationError}
            hint={coordinates ? 'Detected from your GPS — shows you to nearby buyers' : 'Type your city or tap Detect'}
            right={
              <Pressable onPress={() => getCurrentLocation()} style={styles.gpsBtn} disabled={locationLoading}>
                {locationLoading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Icon name={coordinates ? 'locate' : 'navigate'} size={13} color={colors.primary} />
                )}
                <Text style={styles.gpsBtnText}>{coordinates ? 'GPS' : 'Detect'}</Text>
              </Pressable>
            }
          />
        </EditSection>

        {isShop ? (
          <EditSection
            icon="storefront-outline"
            title="Store details"
            subtitle="Helps buyers find your shop on Explore"
          >
            <EditField
              label="Store name"
              icon="storefront-outline"
              value={shopName}
              onChangeText={setShopName}
              placeholder="e.g. Mobile Hub"
              autoCapitalize="words"
              maxLength={60}
              error={shopNameError}
            />

            <View>
              <View style={styles.labelRow}>
                <Text style={styles.label}>What does your store sell?</Text>
                {categoryError ? <Text style={styles.labelError}>Pick a category</Text> : null}
              </View>
              <View style={styles.catGrid}>
                {shopCategories.map((cat) => {
                  const active = shopCategory === cat.label;
                  const tint = cat.tint || colors.primary;
                  return (
                    <Pressable
                      key={cat.label}
                      onPress={() => setShopCategory(cat.label)}
                      style={[
                        styles.catChip,
                        active && { borderColor: tint, backgroundColor: `${tint}1A` },
                        categoryError && { borderColor: colors.danger },
                      ]}
                    >
                      <View style={[styles.catIcon, { backgroundColor: active ? tint : `${tint}1F` }]}>
                        <Icon
                          name={active ? 'checkmark' : cat.icon || 'pricetag-outline'}
                          size={13}
                          color={active ? '#fff' : tint}
                        />
                      </View>
                      <Text style={[styles.catText, active && { color: tint }]}>{cat.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <EditField
              label="Store address"
              icon="map-outline"
              value={shopAddress}
              onChangeText={setShopAddress}
              placeholder={location ? `Street, ${location}` : 'Street, city'}
              hint="Leave empty to use your location"
            />

            {!user?.phone ? (
              <EditField
                label="Store phone (optional)"
                icon="call-outline"
                value={phone}
                onChangeText={(value) => setPhone(value.replace(/[^\d+]/g, '').slice(0, 14))}
                placeholder="98XXXXXXXX"
                keyboardType="phone-pad"
                hint="Buyers can call your store from its page"
              />
            ) : null}

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
                    <Pressable
                      key={preset}
                      onPress={() => setOpeningHours(preset)}
                      style={[styles.preset, active && styles.presetActive]}
                    >
                      <Text style={[styles.presetText, active && styles.presetTextActive]}>{preset}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.taxHead}>
              <Icon name="ribbon-outline" size={18} color={colors.warning} />
              <View style={styles.previewCopy}>
                <Text style={styles.taxTitle}>Tax details (optional)</Text>
                <Text style={styles.taxHint}>Add PAN or VAT now or later to get a verified store badge</Text>
              </View>
            </View>
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
          </EditSection>
        ) : null}

        <View style={styles.noteCard}>
          <Icon name="information-circle" size={20} color={colors.info} />
          <Text style={styles.noteText}>
            You can edit everything later from Profile → Edit profile{isShop ? ', including your banner and store hours.' : '.'}
          </Text>
        </View>

        <View style={styles.submitWrap}>
          <GradientButton
            title={loading ? 'Setting up...' : isShop ? 'Create my store' : 'Complete profile'}
            icon={loading ? undefined : 'arrow-forward'}
            disabled={loading}
            onPress={completeProfile}
          />
          <Text style={styles.submitHint}>
            {doneCount === steps.length
              ? 'All set — you are ready to go!'
              : `${steps.length - doneCount} step${steps.length - doneCount === 1 ? '' : 's'} left${avatarUri ? '' : ' · photo is optional'}`}
          </Text>
        </View>
      </FormScroll>

      <AlertModal
        visible={!!alertConfig}
        onClose={() => setAlertConfig(null)}
        {...(alertConfig || {})}
      />
    </View>
  );
}
