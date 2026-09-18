import { useCallback, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../services/api';
import { formatPrice } from '../utils/listing';
import { ROUTES } from '../navigation/helpers';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';
import EmptyState from '../components/EmptyState';

const PERIODS = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
];

function StatCard({ icon, label, value, tint, colors, styles }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconWrap, { backgroundColor: `${tint}22` }]}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MiniChart({ chart, colors, styles }) {
  const max = useMemo(() => {
    const peak = Math.max(
      ...chart.map((row) => row.listingViews + row.profileViews + row.inquiries),
      1,
    );
    return peak;
  }, [chart]);

  const bars = chart.slice(-14);

  return (
    <View style={styles.chartWrap}>
      <View style={styles.chartBars}>
        {bars.map((row) => {
          const total = row.listingViews + row.profileViews + row.inquiries;
          const heightPct = Math.max(8, Math.round((total / max) * 100));
          return (
            <View key={row.date} style={styles.chartBarCol}>
              <View style={[styles.chartBar, { height: `${heightPct}%`, backgroundColor: colors.primary }]} />
            </View>
          );
        })}
      </View>
      <View style={styles.chartLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
          <Text style={styles.legendText}>Daily activity</Text>
        </View>
        <Text style={styles.legendTextMuted}>Last {bars.length} days</Text>
      </View>
    </View>
  );
}

export default function ShopDashboardScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [period, setPeriod] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data: res, error: err } = await api.getMyShopAnalytics(period);
    setLoading(false);
    if (err) {
      setError(err.message || 'Could not load shop analytics');
      setData(null);
      return;
    }
    setData(res);
  }, [period]);

  const { refreshing, onRefresh } = usePullRefresh(loadAnalytics);

  useFocusEffect(
    useCallback(() => {
      loadAnalytics();
    }, [loadAnalytics]),
  );

  const summary = data?.summary;
  const shop = data?.shop;

  if (!loading && error && !data) {
    return (
      <View style={styles.container}>
        <ThemeStatusBar variant="header" />
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.onPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Shop Dashboard</Text>
          <View style={styles.navBtn} />
        </View>
        <EmptyState
          icon="storefront-outline"
          title="No shop found"
          body={error}
          buttonLabel="Create shop"
          onButtonPress={() => navigation.navigate(ROUTES.CREATE_SHOP)}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ThemeStatusBar variant="header" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        <LinearGradient
          colors={[colors.primary, colors.gradientEnd || colors.primaryBright || colors.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + 12 }]}
        >
          <View style={styles.headerRow}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.navBtn}>
              <Ionicons name="chevron-back" size={24} color={colors.onPrimary} />
            </Pressable>
            <Text style={styles.headerTitle}>Shop Manager</Text>
            <Pressable
              onPress={() => navigation.navigate(ROUTES.CREATE_SHOP)}
              hitSlop={12}
              style={styles.navBtn}
            >
              <Ionicons name="settings-outline" size={22} color={colors.onPrimary} />
            </Pressable>
          </View>

          <View style={styles.shopRow}>
            <View style={styles.shopAvatar}>
              {shop?.logo ? (
                <Image source={{ uri: shop.logo }} style={styles.shopAvatarImage} />
              ) : (
                <Ionicons name="storefront" size={28} color={colors.onPrimary} />
              )}
            </View>
            <View style={styles.shopMeta}>
              <Text style={styles.shopName}>{shop?.name || 'Your shop'}</Text>
              <Text style={styles.shopSub}>
                {shop?.category || 'Shop'} · {shop?.isVerified ? 'Verified' : 'Pending verification'}
              </Text>
            </View>
          </View>

          <View style={styles.periodRow}>
            {PERIODS.map((p) => (
              <Pressable
                key={p.key}
                onPress={() => setPeriod(p.key)}
                style={[styles.periodChip, period === p.key && styles.periodChipActive]}
              >
                <Text style={[styles.periodChipText, period === p.key && styles.periodChipTextActive]}>
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </LinearGradient>

        <View style={styles.body}>
          <View style={styles.statsGrid}>
            <StatCard
              icon="eye-outline"
              label="Profile visits"
              value={loading ? '…' : String(summary?.profileViews ?? 0)}
              tint={colors.primary}
              colors={colors}
              styles={styles}
            />
            <StatCard
              icon="bar-chart-outline"
              label="Listing views"
              value={loading ? '…' : String(summary?.listingViews ?? 0)}
              tint="#3B82F6"
              colors={colors}
              styles={styles}
            />
            <StatCard
              icon="chatbubbles-outline"
              label="Inquiries"
              value={loading ? '…' : String(summary?.totalInquiries ?? 0)}
              tint="#F59E0B"
              colors={colors}
              styles={styles}
            />
            <StatCard
              icon="bag-check-outline"
              label="Sold items"
              value={loading ? '…' : String(summary?.soldListings ?? 0)}
              tint="#047857"
              colors={colors}
              styles={styles}
            />
          </View>

          <Pressable
            style={styles.storefrontCard}
            onPress={() => navigation.navigate(ROUTES.SHOP_STOREFRONT_QR)}
          >
            <View style={styles.storefrontIconWrap}>
              <Ionicons name="qr-code-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.storefrontCopy}>
              <Text style={styles.storefrontTitle}>Digital storefront QR</Text>
              <Text style={styles.storefrontHint}>
                Download printable PDF counter banner — Scan QR for all items & offers
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </Pressable>

          <View style={styles.panel}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>Activity overview</Text>
              <Text style={styles.panelMeta}>
                {summary?.conversionRate ?? 0}% inquiry rate
              </Text>
            </View>
            {!loading && data?.chart?.length ? (
              <MiniChart chart={data.chart} colors={colors} styles={styles} />
            ) : (
              <Text style={styles.emptyChart}>Analytics will appear as customers visit your shop.</Text>
            )}
          </View>

          <View style={styles.panel}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>Top products</Text>
              <Pressable onPress={() => navigation.navigate(ROUTES.MY_LISTINGS)}>
                <Text style={styles.linkText}>All listings</Text>
              </Pressable>
            </View>

            {(data?.topProducts || []).length ? (
              data.topProducts.map((item) => (
                <View key={item.id} style={styles.productRow}>
                  <View style={styles.productThumb}>
                    {item.photos?.[0] ? (
                      <Image source={{ uri: item.photos[0] }} style={styles.productThumbImage} />
                    ) : (
                      <Ionicons name="cube-outline" size={20} color={colors.textMuted} />
                    )}
                  </View>
                  <View style={styles.productInfo}>
                    <Text style={styles.productTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.productPrice}>{formatPrice(item.price, item.currency)}</Text>
                    <View style={styles.productMetaRow}>
                      <Text style={styles.productMeta}>{item.views} views</Text>
                      <Text style={styles.productMeta}>·</Text>
                      <Text style={styles.productMeta}>{item.inquiries} inquiries</Text>
                      {item.status === 'sold' ? (
                        <>
                          <Text style={styles.productMeta}>·</Text>
                          <Text style={[styles.productMeta, styles.soldBadge]}>Sold</Text>
                        </>
                      ) : null}
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyChart}>Post products to see performance here.</Text>
            )}
          </View>

          <View style={styles.quickActions}>
            <Pressable style={styles.actionBtn} onPress={() => navigation.navigate(ROUTES.SHOP_POST_LISTING)}>
              <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
              <Text style={styles.actionBtnText}>Add product</Text>
            </Pressable>
            <Pressable
              style={styles.actionBtn}
              onPress={() => navigation.navigate(ROUTES.SHOP_PROFILE, { shopId: shop?.id })}
            >
              <Ionicons name="open-outline" size={20} color={colors.primary} />
              <Text style={styles.actionBtnText}>View shop</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 18,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  header: {
    paddingHorizontal: 16,
    backgroundColor: colors.primary,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.onPrimary,
  },
  navBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  shopAvatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  shopAvatarImage: {
    width: '100%',
    height: '100%',
  },
  shopMeta: {
    flex: 1,
    minWidth: 0,
  },
  shopName: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.onPrimary,
  },
  shopSub: {
    marginTop: 4,
    fontSize: 13,
    color: 'rgba(255,255,255,0.88)',
  },
  periodRow: {
    flexDirection: 'row',
    gap: 8,
  },
  periodChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  periodChipActive: {
    backgroundColor: colors.onPrimary,
    borderColor: colors.onPrimary,
  },
  periodChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  periodChipTextActive: {
    color: colors.primary,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 14,
  },
  storefrontCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  storefrontIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${colors.primary}18`,
  },
  storefrontCopy: {
    flex: 1,
    gap: 4,
  },
  storefrontTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  storefrontHint: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  statLabel: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  panelMeta: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  chartWrap: {
    gap: 10,
  },
  chartBars: {
    height: 120,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  chartBarCol: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  chartBar: {
    width: '100%',
    borderRadius: 4,
    minHeight: 6,
    opacity: 0.85,
  },
  chartLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  legendTextMuted: {
    fontSize: 11,
    color: colors.textMuted,
  },
  emptyChart: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 20,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  productThumb: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  productThumbImage: {
    width: '100%',
    height: '100%',
  },
  productInfo: {
    flex: 1,
    minWidth: 0,
  },
  productTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  productPrice: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },
  productMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  productMeta: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },
  soldBadge: {
    color: colors.primary,
  },
  linkText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.link || colors.primary,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
});
