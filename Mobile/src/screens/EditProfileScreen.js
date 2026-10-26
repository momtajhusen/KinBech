import { useEffect, useState } from 'react';
import Icon from '../components/Icon';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertModal, showErrorAlert, showSuccessAlert, showImageSafetyAlert } from '../components/AlertModal';
import { FormScroll, KeyboardForm } from '../components/FormScroll';
import { EditField, EditSection } from '../components/ProfileEditKit';
import ScreenLoader from '../components/ScreenLoader';
import { INDIVIDUAL_GRADIENT } from '../components/SellerProfileCard';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { uploadMediaUri } from '../utils/mediaUpload';
import { resolveMediaUrl } from '../utils/listing';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { coordsForPlaceName, formatCityDistrict } from '../utils/locations';

const AVATAR = 92;

export default function EditProfileScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { user, saveSession } = useAuth();
  const isShopAccount =
    user?.sellerTypePreference === 'shop' || user?.sellerTypePreference === 'both';

  const [name, setName] = useState(user?.name || '');
  const [location, setLocation] = useState(user?.location || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [coordinates, setCoordinates] = useState(() =>
    user?.coordinates && user.coordinates.latitude != null ? user.coordinates : null
  );
  const [avatarUri, setAvatarUri] = useState(resolveMediaUrl(user?.avatarUrl || '') || user?.avatarUrl || '');
  const [nameError, setNameError] = useState('');
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);
  const [checkingShop, setCheckingShop] = useState(isShopAccount);

  useEffect(() => {
    if (!isShopAccount) return undefined;
    let active = true;
    api.getMyShop().then(({ data }) => {
      if (!active) return;
      if (data?.shop) navigation.replace(ROUTES.EDIT_SHOP);
      else setCheckingShop(false);
    });
    return () => {
      active = false;
    };
  }, [isShopAccount, navigation]);

  const phone = user?.phone || '';
  const closeAlert = () => setAlertConfig(null);
  const fail = (title, message) => setAlertConfig(showErrorAlert({ title, message, onConfirm: closeAlert }));

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        fail('Permission Required', 'Please grant photo library permissions to update your profile photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) setAvatarUri(result.assets[0].uri);
    } catch {
      fail('Error', 'Failed to pick image. Please try again.');
    }
  };

  const getCurrentLocation = async () => {
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        fail('Permission Required', 'Please grant location permissions to set your current location.');
        return;
      }
      const current = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = current.coords;
      const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
      setLocation(formatCityDistrict(geocode[0]) || 'Unknown Location');
      setCoordinates({ latitude, longitude });
    } catch {
      fail('Location Error', 'Failed to get your location. You can enter it manually.');
    } finally {
      setLocationLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setNameError('Please enter your name');
      return;
    }
    setLoading(true);
    try {
      let avatarUrl = avatarUri || '';
      if (avatarUrl) {
        const uploaded = await uploadMediaUri(avatarUrl, 'avatars');
        if (uploaded.error) {
          setLoading(false);
          setAlertConfig(
            uploaded.isSafetyBlock || uploaded.errorCode
              ? showImageSafetyAlert({
                  code: uploaded.errorCode,
                  message: uploaded.error,
                  issues: uploaded.issues,
                  onConfirm: closeAlert,
                })
              : showErrorAlert({ title: 'Photo Upload Failed', message: uploaded.error, onConfirm: closeAlert })
          );
          return;
        }
        avatarUrl = uploaded.url;
      }

      const payload = { name: name.trim(), location: location.trim(), avatarUrl, bio: bio.trim() };
      if (coordinates && coordinates.latitude != null) {
        payload.coordinates = coordinates;
      } else {
        const named = coordsForPlaceName(location);
        if (named) payload.coordinates = { latitude: named.lat, longitude: named.lng };
      }
      const { data, error } = await api.updateMe(payload);
      setLoading(false);
      if (error || !data?.user) {
        fail('Update Failed', error || 'Unable to save changes. Please try again.');
        return;
      }
      if (data.token) await saveSession(data.token, data.user);
      setAlertConfig(
        showSuccessAlert({
          title: 'Changes Saved',
          message: 'Your profile has been updated successfully.',
          onConfirm: () => {
            closeAlert();
            navigation.goBack();
          },
        })
      );
    } catch {
      setLoading(false);
      fail('Error', 'Something went wrong while saving. Please try again.');
    }
  };

  if (checkingShop) return <ScreenLoader />;

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <KeyboardForm>
        <FormScroll contentContainerStyle={[styles.content, { paddingBottom: 24 }]}>
          <LinearGradient
            colors={INDIVIDUAL_GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.hero, { paddingTop: insets.top + 8 }]}
          >
            <Icon name="person" size={150} color="rgba(255,255,255,0.07)" style={styles.heroWatermark} />
            <View style={styles.heroBar}>
              <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.heroBtn}>
                <Icon name="chevron-back" size={20} color="#fff" />
              </Pressable>
              <Text style={styles.heroTitle}>Edit profile</Text>
              <View style={styles.heroBtnGhost} />
            </View>
          </LinearGradient>

          <View style={styles.identity}>
            <Pressable onPress={pickImage} style={styles.avatarWrap}>
              <View style={styles.avatar}>
                {avatarUri ? (
                  <Image source={{ uri: resolveMediaUrl(avatarUri) || avatarUri }} style={styles.fill} />
                ) : (
                  <Icon name="person" size={40} color={colors.menuBlue} />
                )}
              </View>
              <View style={styles.cameraBadge}>
                <Icon name="camera" size={14} color="#fff" />
              </View>
            </Pressable>
            <Text style={styles.previewName} numberOfLines={1}>
              {name.trim() || 'Your name'}
            </Text>
            <View style={styles.typePill}>
              <Icon name="person" size={10} color={colors.menuBlue} />
              <Text style={styles.typePillText}>INDIVIDUAL SELLER</Text>
            </View>
            <Pressable onPress={pickImage} hitSlop={6}>
              <Text style={styles.changePhoto}>Change profile photo</Text>
            </Pressable>
          </View>

          <View style={styles.sections}>
            <EditSection icon="person-outline" title="Personal info" subtitle="Shown on your listings and chats" tint={colors.menuBlue}>
              <EditField
                label="Full name"
                icon="person-outline"
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  if (nameError) setNameError('');
                }}
                placeholder="Enter your full name"
                autoCapitalize="words"
                error={nameError}
              />
              <EditField
                label="Bio"
                value={bio}
                onChangeText={setBio}
                placeholder="Tell buyers a little about yourself"
                multiline
                maxLength={200}
              />
            </EditSection>

            <EditSection icon="call-outline" title="Contact" subtitle="Your login number can't be changed" tint={colors.primary}>
              <EditField
                label="Phone number"
                icon="call-outline"
                value={phone || '—'}
                editable={false}
                right={
                  <View style={styles.verifiedTag}>
                    <Icon name="shield-checkmark" size={11} color={colors.success} />
                    <Text style={styles.verifiedText}>Verified</Text>
                  </View>
                }
              />
            </EditSection>

            <EditSection icon="location-outline" title="Location" subtitle="Helps nearby buyers find your items" tint={colors.danger}>
              <EditField
                label="City / area"
                icon="location-outline"
                value={location}
                onChangeText={(text) => {
                  setLocation(text);
                  setCoordinates(null);
                }}
                placeholder="e.g. Kathmandu, Nepal"
                autoCapitalize="words"
                right={
                  <Pressable onPress={getCurrentLocation} disabled={locationLoading} hitSlop={8} style={styles.gpsBtn}>
                    {locationLoading ? (
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

            <View style={styles.note}>
              <Icon name="eye-outline" size={14} color={colors.textMuted} />
              <Text style={styles.noteText}>
                Your name, photo and location are visible to other KinBech users when you buy or sell.
              </Text>
            </View>
          </View>
        </FormScroll>

        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
          <Pressable style={[styles.saveBtn, loading && styles.saveBtnDisabled]} onPress={handleSave} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Icon name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.saveText}>Save changes</Text>
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
  fill: {
    width: '100%',
    height: '100%',
  },
  content: {
    flexGrow: 1,
  },
  hero: {
    height: 150,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  heroWatermark: {
    position: 'absolute',
    right: -20,
    bottom: -40,
  },
  heroBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  heroBtnGhost: {
    width: 34,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  identity: {
    alignItems: 'center',
    marginTop: -AVATAR / 2 - 6,
    paddingHorizontal: 16,
  },
  avatarWrap: {
    width: AVATAR + 8,
    height: AVATAR + 8,
  },
  avatar: {
    width: AVATAR + 8,
    height: AVATAR + 8,
    borderRadius: (AVATAR + 8) / 2,
    borderWidth: 4,
    borderColor: colors.background,
    backgroundColor: colors.pastelBlue,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 4,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.menuBlue,
    borderWidth: 3,
    borderColor: colors.background,
  },
  previewName: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: colors.pastelBlue,
  },
  typePillText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.menuBlue,
  },
  changePhoto: {
    marginTop: 8,
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.menuBlue,
  },
  sections: {
    padding: 16,
    gap: 12,
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
  note: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 4,
  },
  noteText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.textMuted,
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.menuBlue,
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
