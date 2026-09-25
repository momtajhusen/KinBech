import { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { useCategories } from '../utils/categories';

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
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 8,
  },
  categoryCardActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}15`,
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  categoryIconActive: {
    backgroundColor: colors.primary,
  },
  categoryLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  categoryDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
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
  continueBtnDisabled: {
    backgroundColor: colors.border,
  },
});

export default function StoreCategorySelectionScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user, saveSession } = useAuth();
  const shopCategories = useCategories('shop');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleCategorySelect = useCallback((category) => {
    setSelectedCategory(category);
  }, []);

  const handleContinue = useCallback(async () => {
    if (!selectedCategory) {
      return;
    }

    setLoading(true);
    
    try {
      // Preference-only update — do not mark profile complete yet
      const { data, error } = await api.updateMe({
        sellerTypePreference: 'shop',
        storeCategory: selectedCategory,
      });
      
      if (!error) {
        await saveSession(data.token, data.user);
        navigation.navigate(ROUTES.CREATE_SHOP, {
          category: selectedCategory,
          fromSettings: route.params?.fromSettings,
        });
      }
    } catch (error) {
      console.error('Failed to update profile:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, navigation, saveSession, route.params?.fromSettings]);

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
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

        <Text style={styles.headerTitle}>Select Your Business Category</Text>
        <Text style={styles.headerSubtitle}>Choose the category that best describes your store</Text>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionTitle}>Business Categories</Text>

        <View style={styles.categoryGrid}>
          {shopCategories.map((category) => (
            <Pressable
              key={category.label}
              style={[
                styles.categoryCard,
                { width: (width - 52) / 2 },
                selectedCategory === category.label && styles.categoryCardActive,
              ]}
              onPress={() => handleCategorySelect(category.label)}
            >
              <View style={[
                styles.categoryIcon,
                selectedCategory === category.label && styles.categoryIconActive
              ]}>
                {category.imageUrl ? (
                  <Image source={{ uri: category.imageUrl }} style={{ width: 24, height: 24, borderRadius: 6 }} />
                ) : (
                  <Ionicons
                    name={category.icon}
                    size={24}
                    color={selectedCategory === category.label ? colors.onPrimary : colors.primary}
                  />
                )}
              </View>
              <Text style={styles.categoryLabel}>{category.label}</Text>
              <Text style={styles.categoryDescription} numberOfLines={2}>
                {category.description}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={[
            styles.continueBtn,
            (!selectedCategory || loading) && styles.continueBtnDisabled,
          ]}
          onPress={handleContinue}
          disabled={!selectedCategory || loading}
        >
          <Text style={styles.continueBtnText}>
            {loading ? 'Please wait...' : 'Continue'}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}