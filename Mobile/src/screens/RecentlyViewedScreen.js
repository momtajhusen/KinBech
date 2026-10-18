import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { Alert, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { navigateToTab, openItemDetail, TABS } from '../navigation/helpers';
import { api } from '../services/api';
import ProductCard from '../components/ProductCard';
import EmptyState from '../components/EmptyState';
import { attachDistanceToCard } from '../utils/listing';
import { clearRecentlyViewed, loadRecentlyViewed } from '../utils/recentlyViewed';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

const GRID_PADDING = 14;
const GRID_GUTTER = 10;

export default function RecentlyViewedScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cardWidth = Math.floor((width - GRID_PADDING * 2 - GRID_GUTTER) / 2);
  const [items, setItems] = useState([]);
  const [userCoords, setUserCoords] = useState({ lat: null, lng: null });

  useFocusEffect(
    useCallback(() => {
      loadRecentlyViewed().then((list) => setItems([...list]));
    }, [])
  );

  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then(({ status }) => (status === 'granted' ? Location.getLastKnownPositionAsync() : null))
      .then((last) => {
        if (last?.coords) setUserCoords({ lat: last.coords.latitude, lng: last.coords.longitude });
      })
      .catch(() => {});
  }, []);

  const cards = useMemo(
    () =>
      items.map((item) => ({
        ...attachDistanceToCard(item, userCoords),
        condition: item.condition || item.listing?.condition || undefined,
        postedAt: item.postedAt || item.listing?.createdAt || undefined,
      })),
    [items, userCoords]
  );

  const confirmClear = () => {
    Alert.alert('Clear history?', 'This removes all recently viewed items from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => setItems([...clearRecentlyViewed()]),
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <ThemeStatusBar variant="header" />
      <LinearGradient
        colors={colors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={20} color={colors.onGradient} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Recently viewed</Text>
          <Text style={styles.headerSubtitle}>
            {cards.length} item{cards.length === 1 ? '' : 's'} · Pick up where you left off
          </Text>
        </View>
        {cards.length > 0 ? (
          <Pressable onPress={confirmClear} hitSlop={8} style={styles.clearBtn}>
            <Ionicons name="trash-outline" size={14} color={colors.onGradient} />
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        ) : null}
      </LinearGradient>

      {cards.length === 0 ? (
        <EmptyState
          icon="time-outline"
          title="Nothing viewed yet"
          body="Items you open will show up here so you can find them again quickly."
          buttonLabel="Start exploring"
          onButtonPress={() => navigateToTab(navigation, TABS.EXPLORE)}
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 24 }]}
        >
          {cards.map((item) => (
            <ProductCard
              key={item.id}
              {...item}
              compact
              width={cardWidth}
              sharedId={item.id}
              onPress={() =>
                openItemDetail(navigation, { listingId: item.id, item: item.listing || item, sharedId: item.id })
              }
              onToggleSave={() => api.toggleWishlist(item.id)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 18,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.onGradient,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  clearText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.onGradient,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GUTTER,
    paddingHorizontal: GRID_PADDING,
    paddingTop: 16,
  },
});
