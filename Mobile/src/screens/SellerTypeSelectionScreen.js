import { useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    backgroundColor: colors.gradientStart,
    paddingTop: 0,
    paddingHorizontal: 20,
    paddingBottom: 30,
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
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  typeCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.border,
    marginBottom: 16,
    overflow: 'hidden',
  },
  typeCardActive: {
    borderColor: colors.primary,
  },
  typeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: colors.iconBackground,
  },
  typeIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  typeContent: {
    flex: 1,
  },
  typeTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  typeDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  typeDetails: {
    padding: 20,
  },
  typeDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  typeDetailIcon: {
    marginRight: 12,
  },
  typeDetailText: {
    fontSize: 14,
    color: colors.text,
  },
  continueBtn: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.onPrimary,
  },
});

export default function SellerTypeSelectionScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { user, saveSession } = useAuth();
  const { fromSettings = false } = route.params || {};

  const handleIndividualPress = useCallback(async () => {
    const { data, error } = await api.updateMe({ sellerTypePreference: 'individual' });
    if (!error && data?.token) {
      await saveSession(data.token, data.user);
    }
    if (fromSettings) {
      navigation.goBack();
      return;
    }
    navigation.replace(ROUTES.PROFILE_SETUP);
  }, [navigation, fromSettings, saveSession]);

  const handleShopPress = useCallback(async () => {
    const { data, error } = await api.updateMe({ sellerTypePreference: 'shop' });
    if (!error && data?.token) {
      await saveSession(data.token, data.user);
    }
    navigation.navigate(ROUTES.STORE_CATEGORY_SELECTION, { fromSettings });
  }, [navigation, fromSettings, saveSession]);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

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

        <Text style={styles.headerTitle}>{fromSettings ? 'Change Seller Preference' : 'How do you want to sell?'}</Text>
        <Text style={styles.headerSubtitle}>{fromSettings ? 'Update your default selling preference' : 'Choose the selling option that fits your needs'}</Text>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionTitle}>Select selling type</Text>

        {/* Individual Seller Card */}
        <Pressable
          style={[styles.typeCard, user?.sellerTypePreference === 'individual' && styles.typeCardActive]}
          onPress={handleIndividualPress}
        >
          <View style={styles.typeHeader}>
            <View style={styles.typeIcon}>
              <Ionicons name="person" size={28} color={colors.onPrimary} />
            </View>
            <View style={styles.typeContent}>
              <Text style={styles.typeTitle}>Sell as Individual</Text>
              <Text style={styles.typeDescription}>Sell your personal or used items</Text>
            </View>
            {user?.sellerTypePreference === 'individual' && (
              <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
            )}
            {user?.sellerTypePreference !== 'individual' && (
              <Ionicons name="chevron-forward" size={24} color={colors.textSecondary} />
            )}
          </View>
          <View style={styles.typeDetails}>
            <View style={styles.typeDetail}>
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} style={styles.typeDetailIcon} />
              <Text style={styles.typeDetailText}>List your item in 30 seconds</Text>
            </View>
            <View style={styles.typeDetail}>
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} style={styles.typeDetailIcon} />
              <Text style={styles.typeDetailText}>Perfect for personal items</Text>
            </View>
            <View style={styles.typeDetail}>
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} style={styles.typeDetailIcon} />
              <Text style={styles.typeDetailText}>No business setup required</Text>
            </View>
          </View>
        </Pressable>

        {/* Shop Seller Card */}
        <Pressable
          style={[styles.typeCard, user?.sellerTypePreference === 'shop' && styles.typeCardActive]}
          onPress={handleShopPress}
        >
          <View style={styles.typeHeader}>
            <View style={styles.typeIcon}>
              <Ionicons name="storefront" size={28} color={colors.onPrimary} />
            </View>
            <View style={styles.typeContent}>
              <Text style={styles.typeTitle}>Sell as Shop</Text>
              <Text style={styles.typeDescription}>List products from your business</Text>
            </View>
            {user?.sellerTypePreference === 'shop' && (
              <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
            )}
            {user?.sellerTypePreference !== 'shop' && (
              <Ionicons name="chevron-forward" size={24} color={colors.textSecondary} />
            )}
          </View>
          <View style={styles.typeDetails}>
            <View style={styles.typeDetail}>
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} style={styles.typeDetailIcon} />
              <Text style={styles.typeDetailText}>Business product listings</Text>
            </View>
            <View style={styles.typeDetail}>
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} style={styles.typeDetailIcon} />
              <Text style={styles.typeDetailText}>Build your shop reputation</Text>
            </View>
            <View style={styles.typeDetail}>
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} style={styles.typeDetailIcon} />
              <Text style={styles.typeDetailText}>Customer reviews and ratings</Text>
            </View>
          </View>
        </Pressable>
      </ScrollView>
    </View>
  );
}