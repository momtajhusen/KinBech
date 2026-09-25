import { useCallback, useEffect, useState, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Image,
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
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { useCategories } from '../utils/categories';
import { formatCityDistrict } from '../utils/locations';
import { AlertModal, showErrorAlert, showSuccessAlert } from '../components/AlertModal';

function FloatingField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  left,
  right,
  colors,
  styles,
  onFocus,
  inputRef,
}) {
  return (
    <View style={styles.floatingWrap}>
      <Text style={styles.floatingLabel}>{label}</Text>
      <View style={[styles.floatingInputRow, multiline && styles.floatingInputRowMultiline]}>
        {left}
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          multiline={multiline}
          keyboardType={keyboardType}
          onFocus={onFocus}
          style={[styles.floatingInput, multiline && styles.floatingTextarea]}
        />
        {right}
      </View>
    </View>
  );
}

export default function CreateShopScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const nameRef = useRef(null);
  const descRef = useRef(null);
  const phoneRef = useRef(null);
  const addressRef = useRef(null);
  const locationRef = useRef(null);
  const hoursRef = useRef(null);
  const { category: initialCategory } = route.params || {};
  const shopCategories = useCategories('shop');

  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);

  const [name, setName] = useState('');
  const [category, setCategory] = useState(initialCategory || 'Mobiles');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [location, setLocation] = useState('');
  const [openingHours, setOpeningHours] = useState('9:00 AM - 8:00 PM');
  const [coords, setCoords] = useState({ lat: null, lng: null });
  const [panNumber, setPanNumber] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [existingShop, setExistingShop] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await api.getMyShop();
      if (!active || !data?.shop) return;
      const shop = data.shop;
      setExistingShop(shop);
      setName(shop.name || '');
      setCategory(shop.category || initialCategory || 'Mobiles');
      setDescription(shop.description || '');
      setPhone(shop.phone || '');
      setAddress(shop.address || '');
      setLocation(shop.location || '');
      setOpeningHours(shop.openingHours || '9:00 AM - 8:00 PM');
      setPanNumber(shop.panNumber || '');
      setVatNumber(shop.vatNumber || '');
      if (shop.coordinates?.lat != null) {
        setCoords({ lat: shop.coordinates.lat, lng: shop.coordinates.lng });
      }
    })();
    return () => {
      active = false;
    };
  }, [initialCategory]);

  const getCurrentLocation = useCallback(async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setAlertConfig(showErrorAlert({
          title: 'Location permission',
          message: 'Allow location access to auto-fill your city.',
          onConfirm: () => setAlertConfig(null),
        }));
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
        setAlertConfig(showErrorAlert({
          title: 'Could not determine location',
          message: 'Please enter location manually.',
          onConfirm: () => setAlertConfig(null),
        }));
        return;
      }
      setLocation(formatCityDistrict(addr, 'Kathmandu'));
      setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    } catch (e) {
      setAlertConfig(showErrorAlert({
        title: 'Location error',
        message: 'Could not fetch location. Please enter manually.',
        onConfirm: () => setAlertConfig(null),
      }));
    } finally {
      setLocating(false);
    }
  }, []);

  const scrollToFocus = useCallback((y) => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true });
    }, 120);
  }, []);

  const handleBack = useCallback(() => {
    if (alertConfig) {
      setAlertConfig(null);
      return;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation, alertConfig]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setAlertConfig(showErrorAlert({
        title: 'Shop name required',
        message: 'Enter your shop name.',
        onConfirm: () => setAlertConfig(null),
      }));
      return;
    }

    if (!category) {
      setAlertConfig(showErrorAlert({
        title: 'Category required',
        message: 'Select your business category.',
        onConfirm: () => setAlertConfig(null),
      }));
      return;
    }

    if (!location.trim()) {
      setAlertConfig(showErrorAlert({
        title: 'Location required',
        message: 'Enter your shop location.',
        onConfirm: () => setAlertConfig(null),
      }));
      return;
    }

    setSubmitting(true);

    const payload = {
      name: name.trim(),
      category,
      description: description.trim(),
      phone: phone.trim(),
      address: address.trim(),
      location: location.trim(),
      openingHours,
      panNumber: panNumber.trim(),
      vatNumber: vatNumber.trim(),
      coordinates: coords,
    };

    const shopId = existingShop?._id || existingShop?.id;
    const { data, error } = shopId
      ? await api.updateShop(shopId, payload)
      : await api.createShop(payload);

    setSubmitting(false);

    if (error) {
      setAlertConfig(showErrorAlert({
        title: shopId ? 'Could not update shop' : 'Could not create shop',
        message: error,
        onConfirm: () => setAlertConfig(null),
      }));
      return;
    }

    setAlertConfig(showSuccessAlert({
      title: shopId ? 'Shop Updated!' : 'Shop Created!',
      message: shopId
        ? 'Your shop details have been saved.'
        : 'Your shop has been created. Add PAN/VAT documents anytime for a verified badge.',
      onConfirm: () => {
        setAlertConfig(null);
        if (shopId) {
          navigation.navigate(ROUTES.SHOP_VERIFICATION);
        } else {
          navigation.navigate(ROUTES.SHOP_POST_LISTING);
        }
      },
    }));
  };

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <LinearGradient
        colors={colors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.headerTop}>
          <Pressable onPress={handleBack} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.onGradient} />
          </Pressable>
          <View style={{ flex: 1 }} />
        </View>

        <Text style={styles.headerTitle}>Create Your Shop</Text>
        <Text style={styles.headerSubtitle}>Set up your business profile</Text>
      </LinearGradient>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <Text style={styles.sectionTitle}>Shop Information</Text>

          <FloatingField
            label="Shop Name"
            value={name}
            onChangeText={setName}
            placeholder="Your business name"
            colors={colors}
            styles={styles}
            inputRef={nameRef}
            onFocus={() => scrollToFocus(200)}
          />

          <Text style={styles.fieldLabel}>Business Category</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryScroll}
          >
            {shopCategories.map((cat) => (
              <Pressable
                key={cat.label}
                style={[
                  styles.categoryChip,
                  category === cat.label && styles.categoryChipActive,
                ]}
                onPress={() => setCategory(cat.label)}
              >
                {cat.imageUrl ? (
                  <Image source={{ uri: cat.imageUrl }} style={{ width: 16, height: 16, borderRadius: 4, marginRight: 6 }} />
                ) : (
                  <Ionicons
                    name={cat.icon}
                    size={14}
                    color={category === cat.label ? colors.onPrimary : colors.textSecondary}
                    style={{ marginRight: 6 }}
                  />
                )}
                <Text
                  style={[
                    styles.categoryChipText,
                    category === cat.label && styles.categoryChipTextActive,
                  ]}
                >
                  {cat.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <FloatingField
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Tell customers about your business..."
            multiline
            colors={colors}
            styles={styles}
            inputRef={descRef}
            onFocus={() => scrollToFocus(300)}
          />

          <FloatingField
            label="Phone Number"
            value={phone}
            onChangeText={setPhone}
            placeholder="Contact number"
            keyboardType="phone-pad"
            colors={colors}
            styles={styles}
            inputRef={phoneRef}
            onFocus={() => scrollToFocus(400)}
          />

          <FloatingField
            label="Address"
            value={address}
            onChangeText={setAddress}
            placeholder="Street address"
            colors={colors}
            styles={styles}
            inputRef={addressRef}
            onFocus={() => scrollToFocus(500)}
          />

          <FloatingField
            label="Location"
            value={location}
            onChangeText={setLocation}
            placeholder="City/Area"
            right={
              <Pressable onPress={getCurrentLocation} disabled={locating}>
                {locating ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="location" size={20} color={colors.primary} />
                )}
              </Pressable>
            }
            colors={colors}
            styles={styles}
            inputRef={locationRef}
            onFocus={() => scrollToFocus(600)}
          />

          <FloatingField
            label="Opening Hours"
            value={openingHours}
            onChangeText={setOpeningHours}
            placeholder="e.g., 9:00 AM - 8:00 PM"
            colors={colors}
            styles={styles}
            inputRef={hoursRef}
            onFocus={() => scrollToFocus(700)}
          />

          <Text style={styles.sectionTitle}>Business tax IDs (optional)</Text>
          <Text style={styles.taxHint}>
            Add PAN/VAT for registered businesses. Verified badge is granted after admin review.
          </Text>

          <FloatingField
            label="PAN Number"
            value={panNumber}
            onChangeText={setPanNumber}
            placeholder="Optional"
            colors={colors}
            styles={styles}
            onFocus={() => scrollToFocus(780)}
          />

          <FloatingField
            label="VAT Number"
            value={vatNumber}
            onChangeText={setVatNumber}
            placeholder="Optional"
            colors={colors}
            styles={styles}
            onFocus={() => scrollToFocus(860)}
          />

          {existingShop ? (
            <Pressable
              style={styles.verifyLink}
              onPress={() => navigation.navigate(ROUTES.SHOP_VERIFICATION)}
            >
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
              <Text style={styles.verifyLinkText}>Upload documents & request verification</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.primary} />
            </Pressable>
          ) : null}

          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={20} color={colors.primary} />
            <Text style={styles.infoText}>
              You can update these details and submit KYC documents later from Business verification.
            </Text>
          </View>
        </ScrollView>

        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable
            style={styles.submitBtn}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.submitBtnText}>Create Shop</Text>
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
    backgroundColor: colors.surface,
  },
  flex: { flex: 1 },
  header: {
    backgroundColor: colors.gradientStart,
    paddingTop: 0,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.onGradient,
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  taxHint: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: -8,
    marginBottom: 12,
  },
  verifyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.iconBackground,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  verifyLinkText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  categoryScroll: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.iconBackground,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
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
  floatingWrap: {
    marginBottom: 16,
  },
  floatingLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  floatingInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.iconBackground,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  floatingInputRowMultiline: {
    alignItems: 'flex-start',
    paddingTop: 14,
  },
  floatingInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  floatingTextarea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.iconBackground,
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  infoText: {
    flex: 1,
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
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.onPrimary,
  },
});