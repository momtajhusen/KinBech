import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import GradientButton from '../components/GradientButton';
import { AlertModal, showErrorAlert, showSuccessAlert, showImageSafetyAlert } from '../components/AlertModal';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { uploadMediaUri } from '../utils/mediaUpload';
import { resolveMediaUrl } from '../utils/listing';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { formatCityDistrict } from '../utils/locations';

const createStyles = (colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.white,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 8,
  },
  avatarContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  avatarHint: {
    marginTop: 12,
    fontSize: 13,
    color: colors.textMuted,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 8,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  input: {
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.inputBackground,
  },
  inputDisabled: {
    backgroundColor: colors.iconBackground,
    color: colors.textMuted,
  },
  phoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.iconBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  phoneText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '600',
  },
  phoneLocked: {
    fontSize: 12,
    color: colors.textMuted,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.iconBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  locationButtonText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '700',
  },
  tip: {
    marginTop: 20,
    marginBottom: 4,
    paddingHorizontal: 4,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
  },
  bioInput: {
    minHeight: 88,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.inputBackground,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 11,
    color: colors.textTertiary,
    textAlign: 'right',
    marginTop: 6,
  },
});

export default function EditProfileScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { user, saveSession } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [phone] = useState(user?.phone || '');
  const [location, setLocation] = useState(user?.location || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [coordinates, setCoordinates] = useState(() => {
    if (user?.coordinates && user.coordinates.latitude != null) return user.coordinates;
    return null;
  });
  const [avatarUri, setAvatarUri] = useState(resolveMediaUrl(user?.avatarUrl || '') || user?.avatarUrl || '');
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setAlertConfig(
          showErrorAlert({
            title: 'Permission Required',
            message: 'Please grant photo library permissions to update your profile photo.',
            onConfirm: () => setAlertConfig(null),
          })
        );
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
    } catch (error) {
      setAlertConfig(
        showErrorAlert({
          title: 'Error',
          message: 'Failed to pick image. Please try again.',
          onConfirm: () => setAlertConfig(null),
        })
      );
    }
  };

  const getCurrentLocation = async () => {
    try {
      setLocationLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setAlertConfig(
          showErrorAlert({
            title: 'Permission Required',
            message: 'Please grant location permissions to set your current location.',
            onConfirm: () => setAlertConfig(null),
          })
        );
        setLocationLoading(false);
        return;
      }
      const currentLocation = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = currentLocation.coords;
      const reverseGeocode = await Location.reverseGeocodeAsync({ latitude, longitude });
      const locationName = formatCityDistrict(reverseGeocode[0]) || 'Unknown Location';
      setLocation(locationName);
      setCoordinates({ latitude, longitude });
      setLocationLoading(false);
    } catch (error) {
      setLocationLoading(false);
      setAlertConfig(
        showErrorAlert({
          title: 'Location Error',
          message: 'Failed to get your location. You can enter it manually.',
          onConfirm: () => setAlertConfig(null),
        })
      );
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setAlertConfig(
        showErrorAlert({
          title: 'Name Required',
          message: 'Please enter your name.',
          onConfirm: () => setAlertConfig(null),
        })
      );
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
        avatarUrl = uploaded.url;
      }

      const payload = {
        name: name.trim(),
        location: location.trim(),
        avatarUrl,
        bio: bio.trim(),
      };
      if (coordinates && coordinates.latitude != null) {
        payload.coordinates = coordinates;
      }
      const { data, error } = await api.updateMe(payload);
      setLoading(false);
      if (error || !data?.user) {
        setAlertConfig(
          showErrorAlert({
            title: 'Update Failed',
            message: error || 'Unable to save changes. Please try again.',
            onConfirm: () => setAlertConfig(null),
          })
        );
        return;
      }
      if (data.token) {
        await saveSession(data.token, data.user);
      }
      setAlertConfig(
        showSuccessAlert({
          title: 'Changes Saved',
          message: 'Your profile has been updated successfully.',
          onConfirm: () => {
            setAlertConfig(null);
            navigation.goBack();
          },
        })
      );
    } catch (error) {
      setLoading(false);
      setAlertConfig(
        showErrorAlert({
          title: 'Error',
          message: 'Something went wrong while saving. Please try again.',
          onConfirm: () => setAlertConfig(null),
        })
      );
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right']}>
      <ThemeStatusBar variant="header" />
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </Pressable>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 24 }} />
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 56 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <View style={styles.avatarSection}>
              <Pressable onPress={pickImage} style={styles.avatarContainer}>
                {avatarUri ? (
                  <Image source={{ uri: resolveMediaUrl(avatarUri) || avatarUri }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarEmpty}>
                    <Ionicons name="person" size={40} color={colors.textMuted} />
                  </View>
                )}
                <View style={styles.cameraIcon}>
                  <Ionicons name="camera" size={16} color={colors.white} />
                </View>
              </Pressable>
              <Text style={styles.avatarHint}>Tap to change profile photo</Text>
            </View>

            <View>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Enter your full name"
                placeholderTextColor={colors.textTertiary}
                style={styles.input}
                autoCapitalize="words"
              />
            </View>

            <View>
              <Text style={styles.label}>Bio</Text>
              <TextInput
                value={bio}
                onChangeText={(text) => setBio(text.slice(0, 200))}
                placeholder="Tell buyers a little about yourself"
                placeholderTextColor={colors.textTertiary}
                style={styles.bioInput}
                multiline
                maxLength={200}
              />
              <Text style={styles.charCount}>{bio.length}/200</Text>
            </View>

            <View>
              <Text style={styles.label}>Phone Number</Text>
              <View style={styles.phoneBadge}>
                <Ionicons name="call-outline" size={18} color={colors.textMuted} />
                <Text style={styles.phoneText}>{phone || '—'}</Text>
                <View style={{ flex: 1 }} />
                <Ionicons name="lock-closed" size={14} color={colors.textTertiary} />
                <Text style={styles.phoneLocked}>Verified</Text>
              </View>
            </View>

            <View>
              <Text style={styles.label}>Location</Text>
              <TextInput
                value={location}
                onChangeText={setLocation}
                placeholder="e.g. Kathmandu, Nepal"
                placeholderTextColor={colors.textTertiary}
                style={styles.input}
                autoCapitalize="words"
              />
              <View style={styles.locationRow}>
                <Pressable onPress={getCurrentLocation} style={styles.locationButton} disabled={locationLoading}>
                  {locationLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      <Ionicons name="locate-outline" size={16} color={colors.primary} />
                      <Text style={styles.locationButtonText}>Use Current Location</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </View>

          <Text style={styles.tip}>
            Your name, profile photo, and location are visible to other KinBech users when you buy or sell items.
          </Text>

          <View style={{ height: 20 }} />

          <GradientButton
            title={loading ? 'Saving...' : 'Save Changes'}
            icon="checkmark"
            disabled={loading}
            onPress={handleSave}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <AlertModal
        visible={!!alertConfig}
        onClose={() => setAlertConfig(null)}
        {...(alertConfig || {})}
      />
    </SafeAreaView>
  );
}
