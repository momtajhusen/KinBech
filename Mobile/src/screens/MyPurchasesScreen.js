import { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { navigateToTab, openItemDetail, TABS } from '../navigation/helpers';
import { api } from '../services/api';
import ScreenLoader from '../components/ScreenLoader';
import { formatPrice, resolveMediaUrl } from '../utils/listing';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

export default function MyPurchasesScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const { data } = await api.getMyPurchases();
    setItems(
      (data?.listings || []).map((listing) => ({
        ...listing,
        id: listing.id || listing._id,
      }))
    );
    setLoaded(true);
  }, []);

  const { refreshing, onRefresh } = usePullRefresh(load);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const total = items.reduce((sum, item) => sum + (Number(item.price) || 0), 0);

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.white} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>My Purchases</Text>
          <Text style={styles.headerSubtitle}>
            {items.length} {items.length === 1 ? 'item' : 'items'}
            {items.length ? ` · ${formatPrice(total)}` : ''}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        {loaded && items.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIcon}>
              <Ionicons name="cart-outline" size={22} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No purchases yet</Text>
            <Text style={styles.emptySubtitle}>
              Items you buy or confirm a meetup for will appear here.
            </Text>
            <Pressable style={styles.emptyCta} onPress={() => navigateToTab(navigation, TABS.HOME)}>
              <Text style={styles.emptyCtaText}>Browse items</Text>
            </Pressable>
          </View>
        ) : (
          items.map((item) => {
            const sellerName = item.shopId?.name || item.seller?.name;
            return (
              <Pressable
                key={item.id}
                style={styles.row}
                onPress={() => openItemDetail(navigation, { listingId: item.id, item })}
              >
                <View style={styles.thumb}>
                  {item.photos?.[0] ? (
                    <Image
                      source={{ uri: resolveMediaUrl(item.photos[0]) }}
                      style={styles.thumbImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <Ionicons name="cube-outline" size={20} color={colors.textMuted} />
                  )}
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.rowPrice}>{formatPrice(item.price)}</Text>
                  <View style={styles.rowMeta}>
                    {sellerName ? (
                      <Text style={styles.rowMetaText} numberOfLines={1}>
                        {sellerName}
                      </Text>
                    ) : null}
                    {item.createdAt ? (
                      <Text style={styles.rowMetaText}>
                        {new Date(item.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View
                  style={[
                    styles.status,
                    { backgroundColor: item.status === 'sold' ? colors.statusSold : colors.statusActive },
                  ]}
                >
                  <Text style={styles.statusText}>{item.status === 'sold' ? 'Bought' : 'Meetup'}</Text>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
      {!loaded ? <ScreenLoader overlay label="Loading purchases" /> : null}
    </View>
  );
}

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 14,
    backgroundColor: colors.gradientStart,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
  },
  headerSubtitle: {
    marginTop: 1,
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
  },
  content: {
    padding: 16,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  thumb: {
    width: 60,
    height: 60,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconBackground,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.text,
  },
  rowPrice: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.price,
  },
  rowMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  rowMetaText: {
    flexShrink: 1,
    fontSize: 11,
    color: colors.textMuted,
  },
  status: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.white,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconBackground,
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  emptySubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  emptyCta: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  emptyCtaText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.onPrimary,
  },
});
