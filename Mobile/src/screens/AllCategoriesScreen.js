import { useState, useEffect, useCallback, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EmptyState from '../components/EmptyState';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { useCategories } from '../utils/categories';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

const COLS = 4;
const H_PAD = 16;
const GUTTER = 8;

function CategoryTile({ item, colors, styles, width, onPress }) {
  const scale = useRef(new Animated.Value(1)).current;
  const fill = item.tint || item.color || colors.primary;

  const pressIn = () => {
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, tension: 320, friction: 12 }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 280, friction: 11 }).start();
  };

  return (
    <Animated.View style={[styles.cardWrap, { width, transform: [{ scale }] }]}>
      <Pressable
        style={styles.card}
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
      >
        <View style={[styles.media, { backgroundColor: fill }]}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.mediaImage} />
          ) : (
            <Ionicons name={item.icon} size={20} color={colors.onPrimary || colors.white || '#FFFFFF'} />
          )}
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.cardLabel} numberOfLines={1}>
            {item.label}
          </Text>
          <Text style={styles.cardCount}>{item.count || 0} items</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function AllCategoriesScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const catalog = useCategories('product');
  const [counts, setCounts] = useState({});
  const intro = useRef(new Animated.Value(0)).current;

  const loadCounts = useCallback(async () => {
    const { data, error } = await api.getCategoryCounts({ status: 'active' });
    if (error || !data?.counts) return;
    setCounts(data.counts);
  }, []);

  const { refreshing, onRefresh } = usePullRefresh(loadCounts);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  useEffect(() => {
    Animated.timing(intro, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [intro]);

  if (!colors) {
    return null;
  }

  const resolvedCategories = catalog.map((category) => ({
    ...category,
    count: counts[category.label] || 0,
    tint: category.tint || category.color,
  }));

  const filtered = resolvedCategories.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase())
  );

  const cardWidth = (windowWidth - H_PAD * 2 - GUTTER * (COLS - 1)) / COLS;

  return (
    <View style={styles.container}>
      <ThemeStatusBar variant="header" />
      <LinearGradient
        colors={colors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} style={styles.back} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={colors.onGradient} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>All Categories</Text>
            <Text style={styles.headerSub}>Browse by type · {resolvedCategories.length} listed</Text>
          </View>
          <View style={styles.back} />
        </View>
      </LinearGradient>

      <Animated.View
        style={[
          styles.body,
          {
            opacity: intro,
            transform: [
              {
                translateY: intro.interpolate({
                  inputRange: [0, 1],
                  outputRange: [14, 0],
                }),
              },
            ],
          },
        ]}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl(colors, refreshing, onRefresh)}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={20} color={colors.textTertiary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search categories..."
              placeholderTextColor={colors.textTertiary}
              style={styles.searchInput}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
              </Pressable>
            ) : null}
          </View>

          {filtered.length > 0 ? (
            <View style={styles.grid}>
              {filtered.map((item) => (
                <CategoryTile
                  key={item.label}
                  item={item}
                  colors={colors}
                  styles={styles}
                  width={cardWidth}
                  onPress={() =>
                    navigation.navigate(ROUTES.MAIN_TABS, {
                      screen: ROUTES.EXPLORE,
                      params: { category: item.label },
                    })
                  }
                />
              ))}
            </View>
          ) : (
            <EmptyState
              compact
              icon="grid-outline"
              title="No categories yet"
              body="Categories appear here when people start posting listings."
            />
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const createStyles = (colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 12,
    paddingBottom: 28,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.onGradient,
  },
  headerSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: colors.onGradient,
    opacity: 0.82,
  },
  body: {
    flex: 1,
    marginTop: -14,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 18,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GUTTER,
  },
  cardWrap: {
    marginBottom: 0,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  media: {
    width: '100%',
    aspectRatio: 1.22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  cardFooter: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    alignItems: 'center',
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  cardCount: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
