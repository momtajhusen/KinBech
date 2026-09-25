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
import { formatPrice, resolveMediaUrl } from '../utils/listing';
import { ROUTES } from '../navigation/helpers';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';
import EmptyState from '../components/EmptyState';

const PERIODS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

function StatCard({ icon, label, value, tint, styles }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconWrap, { backgroundColor: `${tint}22` }]}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SalesChart({ chart, colors, styles, mode = 'sales' }) {
  const bars = useMemo(() => {
    const rows = chart || [];
    if (rows.length <= 14) return rows;
    return rows.slice(-14);
  }, [chart]);

  const max = useMemo(() => {
    if (mode === 'sales') {
      return Math.max(...bars.map((row) => Number(row.salesRevenue) || 0), 1);
    }
    return Math.max(
      ...bars.map((row) => (row.listingViews || 0) + (row.profileViews || 0) + (row.inquiries || 0)),
      1,
    );
  }, [bars, mode]);

  if (!bars.length) {
    return <Text style={styles.emptyChart}>No data for this period yet.</Text>;
  }

  return (
    <View style={styles.chartWrap}>
      <View style={styles.chartBars}>
        {bars.map((row) => {
          const value =
            mode === 'sales'
              ? Number(row.salesRevenue) || 0
              : (row.listingViews || 0) + (row.profileViews || 0) + (row.inquiries || 0);
          const heightPct = Math.max(8, Math.round((value / max) * 100));
          return (
            <View key={row.date} style={styles.chartBarCol}>
              <View
                style={[
                  styles.chartBar,
                  {
                    height: `${heightPct}%`,
                    backgroundColor: mode === 'sales' ? '#047857' : colors.primary,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.chartLegend}>
        <View style={styles.legendItem}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: mode === 'sales' ? '#047857' : colors.primary },
            ]}
          />
          <Text style={styles.legendText}>
            {mode === 'sales' ? 'Sales revenue' : 'Daily activity'}
          </Text>
        </View>
        <Text style={styles.legendTextMuted}>Last {bars.length} days</Text>
      </View>
    </View>
  );
}

function ProductRow({ item, colors, styles, showConversion }) {
  return (
    <View style={styles.productRow}>
      <View style={styles.productThumb}>
        {item.photos?.[0] ? (
          <Image
            source={{ uri: resolveMediaUrl(item.photos[0]) }}
            style={styles.productThumbImage}
          />
        ) : (
          <Ionicons name="cube-outline" size={20} color={colors.textMuted} />
        )}
      </View>
      <View style={styles.productInfo}>
        <Text style={styles.productTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.productPrice}>{formatPrice(item.price, item.currency)}</Text>
        <View style={styles.productMetaRow}>
          <Text style={styles.productMeta}>{item.views ?? 0} views</Text>
          {item.inquiries != null ? (
            <>
              <Text style={styles.productMeta}>·</Text>
              <Text style={styles.productMeta}>{item.inquiries} chats</Text>
            </>
          ) : null}
          {showConversion ? (
            <>
              <Text style={styles.productMeta}>·</Text>
              <Text style={styles.productMeta}>{item.conversion ?? 0}% conv.</Text>
            </>
          ) : null}
          {item.sold || item.status === 'sold' ? (
            <>
              <Text style={styles.productMeta}>·</Text>
              <Text style={[styles.productMeta, styles.soldBadge]}>Sold</Text>
            </>
          ) : null}
        </View>
        {item.hint ? (
          <Text style={styles.hintText} numberOfLines={2}>{item.hint}</Text>
        ) : null}
      </View>
    </View>
  );
}

function AreaBar({ row, max, colors, styles }) {
  const pct = Math.max(8, Math.round(((row.customers || 0) / Math.max(max, 1)) * 100));
  return (
    <View style={styles.insightRow}>
      <View style={styles.insightRowHead}>
        <Text style={styles.insightLabel} numberOfLines={1}>{row.area}</Text>
        <Text style={styles.insightValue}>
          {row.customers} · {row.share ?? 0}%
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
      </View>
    </View>
  );
}

function HourHeat({ hours, colors, styles }) {
  const max = Math.max(...(hours || []).map((h) => h.count || 0), 1);
  return (
    <View style={styles.hourWrap}>
      <View style={styles.hourRow}>
        {(hours || []).map((h) => {
          const intensity = (h.count || 0) / max;
          return (
            <View
              key={h.hour}
              style={[
                styles.hourCell,
                {
                  backgroundColor: colors.primary,
                  opacity: 0.12 + intensity * 0.88,
                },
              ]}
            />
          );
        })}
      </View>
      <View style={styles.hourLabels}>
        <Text style={styles.hourLabelText}>12am</Text>
        <Text style={styles.hourLabelText}>6am</Text>
        <Text style={styles.hourLabelText}>12pm</Text>
        <Text style={styles.hourLabelText}>6pm</Text>
        <Text style={styles.hourLabelText}>11pm</Text>
      </View>
    </View>
  );
}

function CategoryRow({ row, maxRevenue, colors, styles }) {
  const pct = Math.max(6, Math.round(((row.revenue || 0) / Math.max(maxRevenue, 1)) * 100));
  return (
    <View style={styles.insightRow}>
      <View style={styles.insightRowHead}>
        <Text style={styles.insightLabel} numberOfLines={1}>{row.category}</Text>
        <Text style={styles.insightValue}>{formatPrice(row.revenue || 0)}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: '#047857' }]} />
      </View>
      <View style={styles.productMetaRow}>
        <Text style={styles.productMeta}>{row.sold || 0} sold</Text>
        <Text style={styles.productMeta}>·</Text>
        <Text style={styles.productMeta}>{row.views || 0} views</Text>
        <Text style={styles.productMeta}>·</Text>
        <Text style={styles.productMeta}>{row.share || 0}% of revenue</Text>
      </View>
    </View>
  );
}

export default function ShopDashboardScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [period, setPeriod] = useState('monthly');
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
  const sales = data?.salesSummary;
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
            <Text style={styles.headerTitle}>Sales & Performance</Text>
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

          {!shop?.isVerified ? (
            <Pressable
              style={styles.verifyBanner}
              onPress={() => navigation.navigate(ROUTES.SHOP_VERIFICATION)}
            >
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.onPrimary} />
              <Text style={styles.verifyBannerText}>
                Add PAN/VAT & documents for verified badge
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.onPrimary} />
            </Pressable>
          ) : (
            <Pressable
              style={styles.verifyBannerMuted}
              onPress={() => navigation.navigate(ROUTES.SHOP_VERIFICATION)}
            >
              <Ionicons name="checkmark-circle" size={18} color={colors.onPrimary} />
              <Text style={styles.verifyBannerText}>Update business verification</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.onPrimary} />
            </Pressable>
          )}

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
              icon="cash-outline"
              label="Sales revenue"
              value={loading ? '…' : formatPrice(sales?.revenue ?? summary?.salesRevenue ?? 0)}
              tint="#047857"
              styles={styles}
            />
            <StatCard
              icon="bag-check-outline"
              label="Units sold"
              value={loading ? '…' : String(sales?.units ?? summary?.salesCount ?? 0)}
              tint="#0F766E"
              styles={styles}
            />
            <StatCard
              icon="eye-outline"
              label="Listing views"
              value={loading ? '…' : String(summary?.listingViews ?? 0)}
              tint="#3B82F6"
              styles={styles}
            />
            <StatCard
              icon="swap-horizontal-outline"
              label="Views → sales"
              value={loading ? '…' : `${summary?.salesConversionRate ?? 0}%`}
              tint="#F59E0B"
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
              <Text style={styles.panelTitle}>Sales summary</Text>
              <Text style={styles.panelMeta}>
                Avg {formatPrice(sales?.avgOrderValue ?? summary?.avgOrderValue ?? 0)}
              </Text>
            </View>
            {!loading && (data?.salesChart || data?.chart)?.length ? (
              <SalesChart
                chart={data.salesChart || data.chart}
                colors={colors}
                styles={styles}
                mode="sales"
              />
            ) : (
              <Text style={styles.emptyChart}>
                Mark listings as sold to build your sales graph.
              </Text>
            )}
          </View>

          <View style={styles.panel}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>Activity overview</Text>
              <Text style={styles.panelMeta}>
                {summary?.conversionRate ?? 0}% inquiry rate
              </Text>
            </View>
            {!loading && data?.chart?.length ? (
              <SalesChart chart={data.chart} colors={colors} styles={styles} mode="activity" />
            ) : (
              <Text style={styles.emptyChart}>Analytics will appear as customers visit your shop.</Text>
            )}
          </View>

          <View style={styles.panel}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>Best performing (Top 5)</Text>
              <Pressable onPress={() => navigation.navigate(ROUTES.MY_LISTINGS)}>
                <Text style={styles.linkText}>All listings</Text>
              </Pressable>
            </View>
            {(data?.bestItems || data?.topProducts || []).length ? (
              (data.bestItems || data.topProducts).map((item) => (
                <ProductRow
                  key={String(item.id)}
                  item={item}
                  colors={colors}
                  styles={styles}
                  showConversion
                />
              ))
            ) : (
              <Text style={styles.emptyChart}>Post products to see performance here.</Text>
            )}
          </View>

          <View style={styles.panel}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>Needs improvement (Bottom 5)</Text>
            </View>
            {(data?.worstItems || []).length ? (
              data.worstItems.map((item) => (
                <ProductRow
                  key={`w-${String(item.id)}`}
                  item={item}
                  colors={colors}
                  styles={styles}
                  showConversion
                />
              ))
            ) : (
              <Text style={styles.emptyChart}>Not enough listing data yet.</Text>
            )}
          </View>

          <View style={styles.panel}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>Views vs sales</Text>
              <Text style={styles.panelMeta}>Conversion report</Text>
            </View>
            <Text style={styles.sectionHint}>
              High views + low conversion = improve photos, price, or description.
            </Text>
            {(data?.conversionReport || []).length ? (
              data.conversionReport.map((item) => (
                <ProductRow
                  key={`c-${String(item.id)}`}
                  item={item}
                  colors={colors}
                  styles={styles}
                  showConversion
                />
              ))
            ) : (
              <Text style={styles.emptyChart}>Views will appear as buyers open your listings.</Text>
            )}
          </View>

          <View style={styles.panel}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>Customer insights</Text>
              <Text style={styles.panelMeta}>
                {data?.customerInsights?.totalCustomers ?? 0} buyers
              </Text>
            </View>
            <Text style={styles.sectionHint}>
              Areas and active times from customer chats (Nepal time).
            </Text>
            {(data?.customerInsights?.topAreas || []).length ? (
              <>
                <Text style={styles.subHead}>Top areas</Text>
                {data.customerInsights.topAreas.map((row) => (
                  <AreaBar
                    key={row.area}
                    row={row}
                    max={data.customerInsights.topAreas[0]?.customers || 1}
                    colors={colors}
                    styles={styles}
                  />
                ))}
              </>
            ) : (
              <Text style={styles.emptyChart}>
                Customer areas appear when buyers with a profile location message you.
              </Text>
            )}
            <Text style={[styles.subHead, { marginTop: 14 }]}>
              Active hours
              {data?.customerInsights?.peakWindow
                ? ` · Peak ${data.customerInsights.peakWindow}`
                : ''}
            </Text>
            {(data?.customerInsights?.activeHours || []).some((h) => h.count > 0) ? (
              <HourHeat
                hours={data.customerInsights.activeHours}
                colors={colors}
                styles={styles}
              />
            ) : (
              <Text style={styles.emptyChart}>Message activity will show peak hours here.</Text>
            )}
          </View>

          <View style={styles.panel}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>Category performance</Text>
              <Text style={styles.panelMeta}>By revenue</Text>
            </View>
            <Text style={styles.sectionHint}>
              Which categories bring the most sales for your shop.
            </Text>
            {(data?.categoryPerformance || []).length ? (
              data.categoryPerformance.map((row) => (
                <CategoryRow
                  key={row.category}
                  row={row}
                  maxRevenue={data.categoryPerformance[0]?.revenue || 1}
                  colors={colors}
                  styles={styles}
                />
              ))
            ) : (
              <Text style={styles.emptyChart}>Add and sell listings to see category revenue.</Text>
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
    fontSize: 17,
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
  verifyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  verifyBannerMuted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  verifyBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: colors.onPrimary,
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
    fontSize: 20,
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
  sectionHint: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
    marginBottom: 8,
    marginTop: -4,
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
  hintText: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  subHead: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  insightRow: {
    marginBottom: 12,
    gap: 6,
  },
  insightRowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  insightLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  insightValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  barTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.iconBackground || `${colors.border}88`,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
  },
  hourWrap: {
    gap: 8,
  },
  hourRow: {
    flexDirection: 'row',
    gap: 2,
    height: 28,
  },
  hourCell: {
    flex: 1,
    borderRadius: 3,
  },
  hourLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  hourLabelText: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '600',
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
