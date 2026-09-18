import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GradientButton from '../components/GradientButton';
import { AlertModal, showErrorAlert } from '../components/AlertModal';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { useCategories } from '../utils/categories';
import { formatCityDistrict } from '../utils/locations';

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  headerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 14,
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onGradient,
    letterSpacing: 0.3,
  },
  welcome: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.onGradient,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.88)',
  },
  sheet: {
    flex: 1,
    marginTop: -16,
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 22,
  },
  avatarWrap: {
    width: 112,
    height: 112,
  },
  avatarRing: {
    width: 112,
    height: 112,
    borderRadius: 56,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: 106,
    height: 106,
    borderRadius: 53,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  cameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.background,
  },
  avatarHint: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  fieldCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 12,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    gap: 12,
  },
  fieldIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldCopy: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  input: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    paddingVertical: 2,
  },
  inputDisabled: {
    color: colors.textMuted,
  },
  gpsBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    marginTop: 8,
    marginBottom: 12,
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  typeGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  typeCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 14,
  },
  typeCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft || `${colors.primary}12`,
  },
  typeIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  typeIconActive: {
    backgroundColor: colors.primary,
  },
  typeTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  typeTitleActive: {
    color: colors.primary,
  },
  typeDesc: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
  },
  shopPanel: {
    marginTop: 16,
    marginBottom: 4,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  shopPanelTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  shopPanelHint: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
    marginBottom: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: colors.iconBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft || `${colors.primary}18`,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.primary,
  },
  submit: {
    marginTop: 16,
  },
});

export default function ProfileSetupScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { user, saveSession } = useAuth();
  const shopCategories = useCategories('shop');
  const [name, setName] = useState(user?.name || '');
  const [phone] = useState(user?.phone || '');
  const [location, setLocation] = useState('');
  const [coordinates, setCoordinates] = useState(null);
  const [avatarUri, setAvatarUri] = useState(user?.avatarUrl || '');
  const [sellerTypePreference, setSellerTypePreference] = useState('individual');
  const [shopName, setShopName] = useState('');
  const [shopCategory, setShopCategory] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [openingHours, setOpeningHours] = useState('9:00 AM - 8:00 PM');
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setAlertConfig(showErrorAlert({
          title: 'Permission Required',
          message: 'Please grant camera roll permissions to upload a profile photo.',
          onConfirm: () => setAlertConfig(null),
        }));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setAvatarUri(result.assets[0].uri);
      }
    } catch {
      setAlertConfig(showErrorAlert({
        title: 'Error',
        message: 'Failed to pick image. Please try again.',
        onConfirm: () => setAlertConfig(null),
      }));
    }
  };

  const getCurrentLocation = async ({ silent = false } = {}) => {
    try {
      setLocationLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationLoading(false);
        if (!silent) {
          setAlertConfig(showErrorAlert({
            title: 'Permission Required',
            message: 'Please grant location permissions to set your current location.',
            onConfirm: () => setAlertConfig(null),
          }));
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
        setAlertConfig(showErrorAlert({
          title: 'Location Error',
          message: 'Failed to get your location. Please enter it manually.',
          onConfirm: () => setAlertConfig(null),
        }));
      }
    }
  };

  useEffect(() => {
    getCurrentLocation({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completeProfile = async () => {
    if (!name.trim()) {
      setAlertConfig(showErrorAlert({
        title: 'Name Required',
        message: 'Please enter your name to continue.',
        onConfirm: () => setAlertConfig(null),
      }));
      return;
    }
    if (!location.trim()) {
      setAlertConfig(showErrorAlert({
        title: 'Location Required',
        message: 'Please enter your location to continue.',
        onConfirm: () => setAlertConfig(null),
      }));
      return;
    }

    if (sellerTypePreference === 'shop') {
      if (!shopName.trim()) {
        setAlertConfig(showErrorAlert({
          title: 'Store name required',
          message: 'Please enter your store name to continue as a shop owner.',
          onConfirm: () => setAlertConfig(null),
        }));
        return;
      }
      if (!shopCategory) {
        setAlertConfig(showErrorAlert({
          title: 'Store category required',
          message: 'Please choose what your store sells.',
          onConfirm: () => setAlertConfig(null),
        }));
        return;
      }
    }

    setLoading(true);
    try {
      const { data, error } = await api.updateProfile({
        name: name.trim(),
        location: location.trim(),
        avatarUrl: avatarUri,
        coordinates,
        sellerTypePreference,
      });

      if (error) {
        setLoading(false);
        setAlertConfig(showErrorAlert({
          title: 'Update Failed',
          message: error,
          onConfirm: () => setAlertConfig(null),
        }));
        return;
      }

      await saveSession(data.token, data.user);

      if (sellerTypePreference === 'shop') {
        const shopRes = await api.createShop({
          name: shopName.trim(),
          category: shopCategory,
          phone,
          address: (shopAddress || location).trim(),
          location: location.trim(),
          openingHours: openingHours.trim() || '9:00 AM - 8:00 PM',
          coordinates: coordinates
            ? { lat: coordinates.latitude, lng: coordinates.longitude }
            : undefined,
        });
        if (shopRes.error && !String(shopRes.error).toLowerCase().includes('already')) {
          setLoading(false);
          setAlertConfig(showErrorAlert({
            title: 'Store details',
            message: shopRes.error,
            onConfirm: () => setAlertConfig(null),
          }));
          return;
        }
      }

      setLoading(false);
      navigation.replace(ROUTES.MAIN_TABS);
    } catch {
      setLoading(false);
      setAlertConfig(showErrorAlert({
        title: 'Error',
        message: 'Failed to complete profile. Please try again.',
        onConfirm: () => setAlertConfig(null),
      }));
    }
  };

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <LinearGradient
        colors={colors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>Almost there</Text>
        </View>
        <Text style={styles.welcome}>Complete your profile</Text>
        <Text style={styles.subtitle}>Buyers and sellers nearby will see these details.</Text>
      </LinearGradient>

      <KeyboardAvoidingView
        style={styles.sheet}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.avatarSection}>
            <Pressable onPress={pickImage} style={styles.avatarWrap}>
              <LinearGradient
                colors={colors.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatarRing}
              >
                <View style={styles.avatarInner}>
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
                  ) : (
                    <Ionicons name="person" size={42} color={colors.textMuted} />
                  )}
                </View>
              </LinearGradient>
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={15} color={colors.onGradient} />
              </View>
            </Pressable>
            <Text style={styles.avatarHint}>Add a profile photo</Text>
          </View>

          <View style={styles.fieldCard}>
            <View style={styles.fieldRow}>
              <View style={styles.fieldIcon}>
                <Ionicons name="person-outline" size={18} color={colors.primary} />
              </View>
              <View style={styles.fieldCopy}>
                <Text style={styles.fieldLabel}>Your name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter your name"
                  placeholderTextColor={colors.textTertiary}
                  style={styles.input}
                />
              </View>
            </View>
          </View>

          <View style={styles.fieldCard}>
            <View style={styles.fieldRow}>
              <View style={styles.fieldIcon}>
                <Ionicons name="call-outline" size={18} color={colors.primary} />
              </View>
              <View style={styles.fieldCopy}>
                <Text style={styles.fieldLabel}>Phone number</Text>
                <TextInput
                  value={phone}
                  editable={false}
                  style={[styles.input, styles.inputDisabled]}
                />
              </View>
            </View>
          </View>

          <View style={styles.fieldCard}>
            <View style={styles.fieldRow}>
              <View style={styles.fieldIcon}>
                <Ionicons name="location-outline" size={18} color={colors.primary} />
              </View>
              <View style={styles.fieldCopy}>
                <Text style={styles.fieldLabel}>Location</Text>
                <TextInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder="City or area"
                  placeholderTextColor={colors.textTertiary}
                  style={styles.input}
                />
              </View>
              <Pressable onPress={() => getCurrentLocation()} style={styles.gpsBtn} disabled={locationLoading}>
                {locationLoading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="navigate" size={18} color={colors.primary} />
                )}
              </Pressable>
            </View>
          </View>

          <Text style={styles.sectionTitle}>How do you want to sell?</Text>
          <View style={styles.typeGrid}>
            <Pressable
              style={[styles.typeCard, sellerTypePreference === 'individual' && styles.typeCardActive]}
              onPress={() => setSellerTypePreference('individual')}
            >
              <View style={[styles.typeIcon, sellerTypePreference === 'individual' && styles.typeIconActive]}>
                <Ionicons
                  name="person"
                  size={20}
                  color={sellerTypePreference === 'individual' ? colors.onPrimary : colors.primary}
                />
              </View>
              <Text style={[styles.typeTitle, sellerTypePreference === 'individual' && styles.typeTitleActive]}>
                Individual
              </Text>
              <Text style={styles.typeDesc}>Sell personal items like phones and furniture.</Text>
            </Pressable>

            <Pressable
              style={[styles.typeCard, sellerTypePreference === 'shop' && styles.typeCardActive]}
              onPress={() => setSellerTypePreference('shop')}
            >
              <View style={[styles.typeIcon, sellerTypePreference === 'shop' && styles.typeIconActive]}>
                <Ionicons
                  name="storefront"
                  size={20}
                  color={sellerTypePreference === 'shop' ? colors.onPrimary : colors.primary}
                />
              </View>
              <Text style={[styles.typeTitle, sellerTypePreference === 'shop' && styles.typeTitleActive]}>
                Shop owner
              </Text>
              <Text style={styles.typeDesc}>Run a store with listings and shop reviews.</Text>
            </Pressable>
          </View>

          {sellerTypePreference === 'shop' ? (
            <View style={styles.shopPanel}>
              <Text style={styles.shopPanelTitle}>Your store</Text>
              <Text style={styles.shopPanelHint}>
                These details help buyers find your shop on Explore.
              </Text>

              <View style={styles.fieldCard}>
                <View style={styles.fieldRow}>
                  <View style={styles.fieldIcon}>
                    <Ionicons name="storefront-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.fieldCopy}>
                    <Text style={styles.fieldLabel}>Store name</Text>
                    <TextInput
                      value={shopName}
                      onChangeText={setShopName}
                      placeholder="e.g. Mobile Hub"
                      placeholderTextColor={colors.textTertiary}
                      style={styles.input}
                    />
                  </View>
                </View>
              </View>

              <Text style={styles.fieldLabel}>Store category</Text>
              <View style={styles.chipRow}>
                {shopCategories.map((cat) => {
                  const active = shopCategory === cat.label;
                  return (
                    <Pressable
                      key={cat.label}
                      onPress={() => setShopCategory(cat.label)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.fieldCard}>
                <View style={styles.fieldRow}>
                  <View style={styles.fieldIcon}>
                    <Ionicons name="map-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.fieldCopy}>
                    <Text style={styles.fieldLabel}>Store address</Text>
                    <TextInput
                      value={shopAddress}
                      onChangeText={setShopAddress}
                      placeholder={location || 'Street, city'}
                      placeholderTextColor={colors.textTertiary}
                      style={styles.input}
                    />
                  </View>
                </View>
              </View>

              <View style={[styles.fieldCard, { marginBottom: 0 }]}>
                <View style={styles.fieldRow}>
                  <View style={styles.fieldIcon}>
                    <Ionicons name="time-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.fieldCopy}>
                    <Text style={styles.fieldLabel}>Opening hours</Text>
                    <TextInput
                      value={openingHours}
                      onChangeText={setOpeningHours}
                      placeholder="9:00 AM - 8:00 PM"
                      placeholderTextColor={colors.textTertiary}
                      style={styles.input}
                    />
                  </View>
                </View>
              </View>
            </View>
          ) : null}

          <GradientButton
            title={loading ? 'Please wait...' : 'Complete profile'}
            icon="arrow-forward"
            disabled={loading}
            onPress={completeProfile}
            style={styles.submit}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <AlertModal
        visible={!!alertConfig}
        onClose={() => setAlertConfig(null)}
        {...(alertConfig || {})}
      />
    </View>
  );
}
