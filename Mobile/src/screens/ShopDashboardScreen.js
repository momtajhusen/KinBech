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
import ScreenLoader from '../components/ScreenLoader';
import { api } from '../services/api';
import { formatPrice, resolveMediaUrl } from '../utils/listing';
import { openItemDetail, ROUTES } from '../navigation/helpers';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';
import EmptyState from '../components/EmptyState';

const PERIODS = [
  { key: 'daily', label: 'Today', compare: 'vs yesterday' },
  { key: 'weekly', label: '7 days', compare: 'vs previous 7 days' },
  { key: 'monthly', label: '30 days', compare: 'vs previous 30 days' },
];

const CHART_MODES = [
  { key: 'sales', label: 'Sales', icon: 'cash-outline' },
  { key: 'views', label: 'Views', icon: 'eye-outline' },
  { key: 'chats', label: 'Chats', icon: 'chatbubbles-outline' },
];

const PRODUCT_TABS = [
  { key: 'best', label: 'Top 5' },
  { key: 'worst', label: 'Needs work' },
  { key: 'conversion', label: 'Views vs sales' },
];

const INSIGHT_TABS = [
  { key: 'areas', label: 'Areas' },
  { key: 'hours', label: 'Active hours' },
  { key: 'categories', label: 'Categories' },
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function compactNumber(value) {
  const n = Number(value) || 0;
  if (n >= 10000000) return `${(n / 10000000).toFixed(1).replace(/\.0$/, '')}Cr`;
  if (n >= 100000) return `${(n / 100000).toFixed(1).replace(/\.0$/, '')}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.round(n));
}

function compactPrice(value) {
  return `₹${compactNumber(value)}`;
}

function pct(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function dayLabel(dateKey, short) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return short ? WEEKDAYS[d.getUTCDay()] : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function chartValue(row, mode) {
  if (mode === 'sales') return Number(row.salesRevenue) || 0;
  if (mode === 'views') return (Number(row.listingViews) || 0) + (Number(row.profileViews) || 0);
  return Number(row.inquiries) || 0;
}

function TrendChip({ trend, styles, colors, light }) {
  if (!trend) return null;
  const { changePct, current } = trend;
  if (changePct == null) {
    if (!current) return null;
    return (
      <View style={[styles.trendChip, light ? styles.trendChipLight : { backgroundColor: `${colors.info}1A` }]}>
        <Text style={[styles.trendText, { color: light ? colors.white : colors.info }]}>New</Text>
      </View>
    );
  }
  const up = changePct >= 0;
  const tint = up ? colors.success : colors.danger;
  return (
    <View style={[styles.trendChip, light ? styles.trendChipLight : { backgroundColor: `${tint}1A` }]}>
      <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={10} color={light ? colors.white : tint} />
      <Text style={[styles.trendText, { color: light ? colors.white : tint }]}>
        {Math.abs(changePct)}%
      </Text>
    </View>
  );
}

function Tabs({ tabs, value, onChange, styles }) {
  return (
    <View style={styles.tabs}>
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <Pressable
            key={tab.key}
            style={[styles.tab, active && styles.tabActive]}
            onPress={() => onChange(tab.key)}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Kpi({ icon, tint, value, label, trend, sub, styles, colors }) {
  return (
    <View style={styles.kpi}>
      <View style={styles.kpiTop}>
        <View style={[styles.kpiIcon, { backgroundColor: `${tint}1F` }]}>
          <Ionicons name={icon} size={14} color={tint} />
        </View>
        <TrendChip trend={trend} styles={styles} colors={colors} />
      </View>
      <Text style={styles.kpiValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.kpiLabel} numberOfLines={1}>{label}</Text>
      {sub ? <Text style={styles.kpiSub} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

function ActivityChart({ chart, mode, colors, styles }) {
  const [selected, setSelected] = useState(null);
  const rows = useMemo(() => (chart || []).slice(-30), [chart]);
  const values = rows.map((row) => chartValue(row, mode));
  const max = Math.max(...values, 1);
  const total = values.reduce((sum, v) => sum + v, 0);
  const bestIndex = values.indexOf(Math.max(...values));
  const tint = mode === 'sales' ? colors.success : mode === 'views' ? colors.info : colors.warning;
  const format = (v) => (mode === 'sales' ? formatPrice(v) : String(v));
  const short = rows.length <= 7;
  const focus = selected != null && rows[selected] ? selected : null;

  if (!rows.length) {
    return <Text style={styles.emptyText}>No data for this period yet.</Text>;
  }

  return (
    <View style={styles.chartWrap}>
      <View style={styles.chartSummary}>
        <View>
          <Text style={styles.chartTotal}>
            {focus != null ? format(values[focus]) : format(total)}
          </Text>
          <Text style={styles.chartCaption}>
            {focus != null
              ? dayLabel(rows[focus].date, false)
              : `Total · last ${rows.length} days`}
          </Text>
        </View>
        {total > 0 && focus == null ? (
          <View style={styles.bestDay}>
            <Ionicons name="trophy-outline" size={12} color={tint} />
            <Text style={styles.bestDayText}>
              Best {dayLabel(rows[bestIndex].date, short)} · {mode === 'sales' ? compactPrice(values[bestIndex]) : values[bestIndex]}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.chartBars}>
        {rows.map((row, index) => {
          const value = values[index];
          const height = value > 0 ? Math.max(8, Math.round((value / max) * 100)) : 3;
          const active = focus === index;
          return (
            <Pressable
              key={row.date}
              style={styles.chartCol}
              onPress={() => setSelected(active ? null : index)}
              hitSlop={{ top: 8, bottom: 8 }}
            >
              <View
                style={[
                  styles.chartBar,
                  {
                    height: `${height}%`,
                    backgroundColor: tint,
                    opacity: focus == null || active ? (value > 0 ? 0.9 : 0.25) : 0.3,
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.chartAxis}>
        {short
          ? rows.map((row) => (
              <Text key={`l-${row.date}`} style={[styles.axisText, styles.axisCell]}>
                {dayLabel(row.date, true)}
              </Text>
            ))
          : [rows[0], rows[Math.floor(rows.length / 2)], rows[rows.length - 1]].map((row, i) => (
              <Text key={`l-${i}`} style={styles.axisText}>{dayLabel(row.date, false)}</Text>
            ))}
      </View>
    </View>
  );
}

function ProductRow({ item, rank, colors, styles, onPress, showHint }) {
  const sold = item.sold || item.status === 'sold';
  return (
    <Pressable style={({ pressed }) => [styles.productRow, pressed && styles.pressed]} onPress={onPress}>
      {rank != null ? <Text style={styles.rank}>{rank}</Text> : null}
      <View style={styles.productThumb}>
        {item.photos?.[0] ? (
          <Image source={{ uri: resolveMediaUrl(item.photos[0]) }} style={styles.fill} />
        ) : (
          <Ionicons name="cube-outline" size={18} color={colors.textMuted} />
        )}
      </View>
      <View style={styles.productInfo}>
        <View style={styles.productTitleRow}>
          <Text style={styles.productTitle} numberOfLines={1}>{item.title}</Text>
          {sold ? (
            <View style={styles.soldTag}>
              <Text style={styles.soldTagText}>SOLD</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.productMetaRow}>
          <Text style={styles.productPrice}>{formatPrice(item.price)}</Text>
          <View style={styles.metaChip}>
            <Ionicons name="eye-outline" size={11} color={colors.textMuted} />
            <Text style={styles.metaChipText}>{item.views ?? 0}</Text>
          </View>
          <View style={styles.metaChip}>
            <Ionicons name="chatbubble-outline" size={11} color={colors.textMuted} />
            <Text style={styles.metaChipText}>{item.inquiries ?? 0}</Text>
          </View>
          <View style={styles.metaChip}>
            <Ionicons name="trending-up-outline" size={11} color={colors.textMuted} />
            <Text style={styles.metaChipText}>{item.conversion ?? 0}%</Text>
          </View>
        </View>
        {showHint && item.hint ? (
          <View style={styles.hintRow}>
            <Ionicons name="bulb-outline" size={12} color={colors.warning} />
            <Text style={styles.hintText} numberOfLines={2}>{item.hint}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function BarRow({ label, value, sub, ratio, tint, styles }) {
  return (
    <View style={styles.barRow}>
      <View style={styles.barHead}>
        <Text style={styles.barLabel} numberOfLines={1}>{label}</Text>
        <Text style={styles.barValue}>{value}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.max(6, Math.round(ratio * 100))}%`, backgroundColor: tint }]} />
      </View>
      {sub ? <Text style={styles.barSub}>{sub}</Text> : null}
    </View>
  );
}

function HourHeat({ hours, colors, styles }) {
  const max = Math.max(...(hours || []).map((h) => h.count || 0), 1);
  return (
    <View style={styles.hourWrap}>
      <View style={styles.hourRow}>
        {(hours || []).map((h) => (
          <View
            key={h.hour}
            style={[styles.hourCell, { backgroundColor: colors.primary, opacity: 0.1 + ((h.count || 0) / max) * 0.9 }]}
          />
        ))}
      </View>
      <View style={styles.hourLabels}>
        {['12am', '6am', '12pm', '6pm', '11pm'].map((label) => (
          <Text key={label} style={styles.axisText}>{label}</Text>
        ))}
      </View>
    </View>
  );
}

export default function ShopDashboardScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [period, setPeriod] = useState('monthly');
  const [chartMode, setChartMode] = useState('sales');
  const [productTab, setProductTab] = useState('best');
  const [insightTab, setInsightTab] = useState('areas');
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

  const summary = data?.summary || {};
  const sales = data?.salesSummary || {};
  const shop = data?.shop;
  const trends = data?.trends || {};
  const inventory = data?.inventory;
  const funnel = data?.funnel || [];
  const insights = data?.customerInsights || {};
  const periodInfo = PERIODS.find((p) => p.key === period) || PERIODS[2];
  const revenue = sales.revenue ?? summary.salesRevenue ?? 0;
  const units = sales.units ?? summary.salesCount ?? 0;
  const avgOrder = sales.avgOrderValue ?? summary.avgOrderValue ?? 0;
  const itemViews = trends.listingViews?.current ?? 0;
  const dash = loading && !data;

  const sparkline = useMemo(() => {
    const rows = (data?.salesChart || data?.chart || []).slice(-14);
    const max = Math.max(...rows.map((r) => Number(r.salesRevenue) || 0), 1);
    return rows.map((r) => ({ date: r.date, h: Math.max(6, Math.round(((Number(r.salesRevenue) || 0) / max) * 100)) }));
  }, [data]);

  const productRows = productTab === 'best'
    ? data?.bestItems || data?.topProducts || []
    : productTab === 'worst'
      ? data?.worstItems || []
      : (data?.conversionReport || []).slice(0, 8);

  const healthItems = inventory ? [
    { key: 'active', icon: 'cube-outline', label: 'Active', value: inventory.active, tint: colors.primary },
    { key: 'sold', icon: 'bag-check-outline', label: 'Sold', value: inventory.sold, tint: colors.success },
    { key: 'noViews', icon: 'eye-off-outline', label: 'No views', value: inventory.noViews, tint: colors.warning, warn: true },
    { key: 'noInquiries', icon: 'chatbubble-ellipses-outline', label: 'No chats', value: inventory.noInquiries, tint: colors.warning, warn: true },
    { key: 'stale', icon: 'time-outline', label: '30+ days old', value: inventory.stale, tint: colors.danger, warn: true },
    { key: 'noPhotos', icon: 'image-outline', label: 'No photo', value: inventory.noPhotos, tint: colors.danger, warn: true },
  ] : [];

  const healthTip = !inventory
    ? ''
    : inventory.noPhotos > 0
      ? `${inventory.noPhotos} item${inventory.noPhotos > 1 ? 's have' : ' has'} no photo — add photos to get more views.`
      : inventory.stale > 0
        ? `${inventory.stale} item${inventory.stale > 1 ? 's are' : ' is'} over 30 days old — refresh price or photos.`
        : inventory.noViews > 0
          ? `${inventory.noViews} item${inventory.noViews > 1 ? 's have' : ' has'} no views yet — share your store QR.`
          : inventory.active === 0
            ? 'Add products so buyers can find your store.'
            : 'Your listings look healthy. Keep adding fresh stock!';

  if (!loading && error && !data) {
    return (
      <View style={styles.container}>
        <ThemeStatusBar variant="header" />
        <View style={[styles.plainHeader, { paddingTop: insets.top + 8 }]}>
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

  const quickActions = [
    { key: 'add', icon: 'add-circle-outline', label: 'Add item', onPress: () => navigation.navigate(ROUTES.SHOP_POST_LISTING) },
    { key: 'list', icon: 'albums-outline', label: 'Listings', onPress: () => navigation.navigate(ROUTES.MY_LISTINGS) },
    { key: 'qr', icon: 'qr-code-outline', label: 'Store QR', onPress: () => navigation.navigate(ROUTES.SHOP_STOREFRONT_QR) },
    { key: 'view', icon: 'storefront-outline', label: 'View store', onPress: () => navigation.navigate(ROUTES.SHOP_PROFILE, { shopId: shop?.id }) },
  ];

  return (
    <View style={styles.container}>
      <ThemeStatusBar variant="header" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        <LinearGradient
          colors={[colors.primary, colors.gradientEnd || colors.primaryBright || colors.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + 6 }]}
        >
          {shop?.coverImage ? (
            <>
              <Image source={{ uri: resolveMediaUrl(shop.coverImage) }} style={styles.cover} resizeMode="cover" />
              <LinearGradient
                colors={['rgba(0,0,0,0.6)', 'rgba(6,78,59,0.92)']}
                style={styles.cover}
                pointerEvents="none"
              />
            </>
          ) : null}

          <View style={styles.headerRow}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.navBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.onPrimary} />
            </Pressable>
            <Text style={styles.headerTitle}>Sales & Performance</Text>
            <Pressable onPress={() => navigation.navigate(ROUTES.EDIT_SHOP)} hitSlop={12} style={styles.navBtn}>
              <Ionicons name="create-outline" size={20} color={colors.onPrimary} />
            </Pressable>
          </View>

          <View style={styles.shopRow}>
            <View style={styles.shopLogo}>
              {shop?.logo ? (
                <Image source={{ uri: resolveMediaUrl(shop.logo) }} style={styles.fill} />
              ) : (
                <Ionicons name="storefront" size={22} color={colors.onPrimary} />
              )}
            </View>
            <View style={styles.shopMeta}>
              <Text style={styles.shopName} numberOfLines={1}>{shop?.name || 'Your shop'}</Text>
              <View style={styles.shopSubRow}>
                <Text style={styles.shopSub} numberOfLines={1}>{shop?.category || 'Shop'}</Text>
                <Text style={styles.shopDot}>·</Text>
                <Ionicons name="star" size={11} color="#FBBF24" />
                <Text style={styles.shopSub}>
                  {Number(shop?.ratingAverage) > 0 ? Number(shop.ratingAverage).toFixed(1) : 'New'}
                  {shop?.reviewCount ? ` (${shop.reviewCount})` : ''}
                </Text>
              </View>
            </View>
            <Pressable
              style={[styles.verifyPill, shop?.isVerified && styles.verifyPillOn]}
              onPress={() => navigation.navigate(ROUTES.SHOP_VERIFICATION)}
            >
              <Ionicons
                name={shop?.isVerified ? 'shield-checkmark' : 'shield-outline'}
                size={12}
                color={shop?.isVerified ? colors.primary : colors.onPrimary}
              />
              <Text style={[styles.verifyText, shop?.isVerified && styles.verifyTextOn]}>
                {shop?.isVerified ? 'Verified' : 'Get verified'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.periodTrack}>
            {PERIODS.map((p) => {
              const active = period === p.key;
              return (
                <Pressable
                  key={p.key}
                  onPress={() => setPeriod(p.key)}
                  style={[styles.periodTab, active && styles.periodTabActive]}
                >
                  <Text style={[styles.periodText, active && styles.periodTextActive]}>{p.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.revenueCard}>
            <View style={styles.revenueLeft}>
              <Text style={styles.revenueLabel}>Revenue · {periodInfo.label}</Text>
              <View style={styles.revenueValueRow}>
                <Text style={styles.revenueValue} numberOfLines={1}>{dash ? '…' : formatPrice(revenue)}</Text>
                <TrendChip trend={trends.revenue} styles={styles} colors={colors} light />
              </View>
              <Text style={styles.revenueSub} numberOfLines={1}>
                {units} sold · Avg {formatPrice(avgOrder)} · {periodInfo.compare}
              </Text>
            </View>
            <View style={styles.spark}>
              {sparkline.map((bar) => (
                <View key={bar.date} style={[styles.sparkBar, { height: `${bar.h}%` }]} />
              ))}
            </View>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          <View style={styles.kpiGrid}>
            <Kpi
              icon="bag-check-outline"
              tint={colors.success}
              value={dash ? '…' : String(units)}
              label="Units sold"
              trend={trends.units}
              styles={styles}
              colors={colors}
            />
            <Kpi
              icon="eye-outline"
              tint={colors.info}
              value={dash ? '…' : compactNumber(itemViews)}
              label="Item views"
              trend={trends.listingViews}
              sub={summary.totalListingViews ? `${compactNumber(summary.totalListingViews)} all-time` : null}
              styles={styles}
              colors={colors}
            />
            <Kpi
              icon="storefront-outline"
              tint={colors.primary}
              value={dash ? '…' : compactNumber(summary.profileViews ?? 0)}
              label="Store visits"
              trend={trends.profileViews}
              styles={styles}
              colors={colors}
            />
            <Kpi
              icon="chatbubbles-outline"
              tint={colors.warning}
              value={dash ? '…' : compactNumber(summary.totalInquiries ?? 0)}
              label="Chats"
              trend={trends.inquiries}
              sub={summary.totalInquiriesAllTime ? `${summary.totalInquiriesAllTime} all-time` : null}
              styles={styles}
              colors={colors}
            />
            <Kpi
              icon="trending-up-outline"
              tint={colors.favorite}
              value={dash ? '…' : `${summary.salesConversionRate ?? 0}%`}
              label="View → sale"
              sub={`${summary.conversionRate ?? 0}% view → chat`}
              styles={styles}
              colors={colors}
            />
            <Kpi
              icon="wallet-outline"
              tint={colors.info}
              value={dash ? '…' : compactPrice(inventory?.stockValue ?? 0)}
              label="Stock value"
              sub={`${inventory?.active ?? summary.activeListings ?? 0} active items`}
              styles={styles}
              colors={colors}
            />
          </View>

          {funnel.length ? (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>Sales funnel</Text>
                <Text style={styles.cardMeta}>{periodInfo.label}</Text>
              </View>
              <View style={styles.funnel}>
                {funnel.map((step, index) => {
                  const prev = funnel[index - 1];
                  return (
                    <View key={step.key} style={styles.funnelStepWrap}>
                      {index > 0 ? (
                        <View style={styles.funnelArrow}>
                          <Ionicons name="chevron-forward" size={12} color={colors.textTertiary} />
                          <Text style={styles.funnelRate}>{pct(step.value, prev.value)}%</Text>
                        </View>
                      ) : null}
                      <View style={[styles.funnelStep, { backgroundColor: `${colors.primary}${['26', '1F', '17', '10'][index] || '10'}` }]}>
                        <Text style={styles.funnelValue}>{compactNumber(step.value)}</Text>
                        <Text style={styles.funnelLabel} numberOfLines={1}>{step.label}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Trends</Text>
              <View style={styles.modeRow}>
                {CHART_MODES.map((m) => {
                  const active = chartMode === m.key;
                  return (
                    <Pressable
                      key={m.key}
                      style={[styles.modeBtn, active && styles.modeBtnActive]}
                      onPress={() => setChartMode(m.key)}
                    >
                      <Ionicons name={m.icon} size={12} color={active ? colors.onPrimary : colors.textMuted} />
                      <Text style={[styles.modeText, active && styles.modeTextActive]}>{m.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            {!dash ? (
              <ActivityChart
                key={`${chartMode}-${period}`}
                chart={data?.chart}
                mode={chartMode}
                colors={colors}
                styles={styles}
              />
            ) : null}
          </View>

          {inventory ? (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>Listing health</Text>
                <Pressable onPress={() => navigation.navigate(ROUTES.MY_LISTINGS)} hitSlop={8}>
                  <Text style={styles.linkText}>Manage</Text>
                </Pressable>
              </View>
              <View style={styles.healthGrid}>
                {healthItems.map((item) => {
                  const alert = item.warn && item.value > 0;
                  return (
                    <View
                      key={item.key}
                      style={[styles.healthCell, alert && { borderColor: `${item.tint}66`, backgroundColor: `${item.tint}10` }]}
                    >
                      <Ionicons name={item.icon} size={14} color={alert || !item.warn ? item.tint : colors.textTertiary} />
                      <Text style={[styles.healthValue, alert && { color: item.tint }]}>{item.value}</Text>
                      <Text style={styles.healthLabel} numberOfLines={1}>{item.label}</Text>
                    </View>
                  );
                })}
              </View>
              {healthTip ? (
                <View style={styles.tipRow}>
                  <Ionicons name="bulb-outline" size={13} color={colors.warning} />
                  <Text style={styles.tipText}>{healthTip}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Products</Text>
              <Pressable onPress={() => navigation.navigate(ROUTES.MY_LISTINGS)} hitSlop={8}>
                <Text style={styles.linkText}>All listings</Text>
              </Pressable>
            </View>
            <Tabs tabs={PRODUCT_TABS} value={productTab} onChange={setProductTab} styles={styles} />
            {productTab === 'conversion' ? (
              <Text style={styles.cardHint}>High views but no sale? Improve photos, price or description.</Text>
            ) : null}
            {productRows.length ? (
              productRows.map((item, index) => (
                <ProductRow
                  key={`${productTab}-${String(item.id)}`}
                  item={item}
                  rank={productTab === 'best' ? index + 1 : null}
                  colors={colors}
                  styles={styles}
                  showHint={productTab !== 'best'}
                  onPress={() => openItemDetail(navigation, { listingId: item.id })}
                />
              ))
            ) : (
              <Text style={styles.emptyText}>
                {productTab === 'best' ? 'Post products to see performance here.' : 'Not enough listing data yet.'}
              </Text>
            )}
          </View>

          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Customer insights</Text>
              <Text style={styles.cardMeta}>{insights.totalCustomers ?? 0} buyers</Text>
            </View>
            <Tabs tabs={INSIGHT_TABS} value={insightTab} onChange={setInsightTab} styles={styles} />

            {insightTab === 'areas' ? (
              (insights.topAreas || []).length ? (
                insights.topAreas.map((row) => (
                  <BarRow
                    key={row.area}
                    label={row.area}
                    value={`${row.customers} · ${row.share ?? 0}%`}
                    ratio={(row.customers || 0) / Math.max(insights.topAreas[0]?.customers || 1, 1)}
                    tint={colors.primary}
                    styles={styles}
                  />
                ))
              ) : (
                <Text style={styles.emptyText}>Buyer areas appear when customers with a location message you.</Text>
              )
            ) : null}

            {insightTab === 'hours' ? (
              (insights.activeHours || []).some((h) => h.count > 0) ? (
                <>
                  {insights.peakWindow ? (
                    <View style={styles.peakRow}>
                      <Ionicons name="time" size={13} color={colors.primary} />
                      <Text style={styles.peakText}>Peak time: {insights.peakWindow}</Text>
                    </View>
                  ) : null}
                  <HourHeat hours={insights.activeHours} colors={colors} styles={styles} />
                </>
              ) : (
                <Text style={styles.emptyText}>Message activity will show your busiest hours (Nepal time).</Text>
              )
            ) : null}

            {insightTab === 'categories' ? (
              (data?.categoryPerformance || []).length ? (
                data.categoryPerformance.map((row) => (
                  <BarRow
                    key={row.category}
                    label={row.category}
                    value={formatPrice(row.revenue || 0)}
                    sub={`${row.sold || 0} sold · ${row.views || 0} views · ${row.share || 0}% of revenue`}
                    ratio={(row.revenue || 0) / Math.max(data.categoryPerformance[0]?.revenue || 1, 1)}
                    tint={colors.success}
                    styles={styles}
                  />
                ))
              ) : (
                <Text style={styles.emptyText}>Sell listings to see which categories earn the most.</Text>
              )
            ) : null}
          </View>

          <View style={styles.actionsGrid}>
            {quickActions.map((action) => (
              <Pressable
                key={action.key}
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                onPress={action.onPress}
              >
                <View style={styles.actionIcon}>
                  <Ionicons name={action.icon} size={20} color={colors.primary} />
                </View>
                <Text style={styles.actionText} numberOfLines={1}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
      {loading && !data ? <ScreenLoader overlay label="Loading shop" /> : null}
    </View>
  );
}

const createStyles = (colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  pressed: {
    opacity: 0.7,
  },
  hero: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    overflow: 'hidden',
    gap: 12,
  },
  cover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  plainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.primary,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.onPrimary,
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  shopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shopLogo: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  shopMeta: {
    flex: 1,
    minWidth: 0,
  },
  shopName: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.onPrimary,
  },
  shopSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  shopSub: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    flexShrink: 1,
  },
  shopDot: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  verifyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  verifyPillOn: {
    backgroundColor: colors.white,
    borderColor: colors.white,
  },
  verifyText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.onPrimary,
  },
  verifyTextOn: {
    color: colors.primary,
  },
  periodTrack: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  periodTab: {
    flex: 1,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodTabActive: {
    backgroundColor: colors.white,
  },
  periodText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
  },
  periodTextActive: {
    color: colors.primary,
  },
  revenueCard: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  revenueLeft: {
    flex: 1,
    minWidth: 0,
  },
  revenueLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: 'rgba(255,255,255,0.8)',
  },
  revenueValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  revenueValue: {
    flexShrink: 1,
    fontSize: 26,
    fontWeight: '900',
    color: colors.white,
  },
  revenueSub: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  spark: {
    width: 92,
    height: 44,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  sparkBar: {
    flex: 1,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  trendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  trendChipLight: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  trendText: {
    fontSize: 10,
    fontWeight: '800',
  },

  body: {
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 12,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  kpi: {
    width: '31.5%',
    flexGrow: 1,
    padding: 10,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  kpiTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  kpiIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 1,
  },
  kpiSub: {
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: 2,
  },
  card: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  cardMeta: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  cardHint: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 8,
  },
  linkText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.link || colors.primary,
  },
  emptyText: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
    paddingVertical: 8,
  },
  funnel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  funnelStepWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  funnelArrow: {
    alignItems: 'center',
    width: 30,
  },
  funnelRate: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textMuted,
  },
  funnelStep: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
  },
  funnelValue: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  funnelLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: 1,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 4,
  },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.iconBackground,
  },
  modeBtnActive: {
    backgroundColor: colors.primary,
  },
  modeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  modeTextActive: {
    color: colors.onPrimary,
  },
  chartWrap: {
    gap: 8,
  },
  chartSummary: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
  },
  chartTotal: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  chartCaption: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  bestDay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: colors.iconBackground,
  },
  bestDayText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  chartBars: {
    height: 90,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  chartCol: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  chartBar: {
    width: '100%',
    borderRadius: 3,
  },
  chartAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  axisCell: {
    flex: 1,
    textAlign: 'center',
  },
  axisText: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.textMuted,
  },
  healthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  healthCell: {
    width: '31.5%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  healthValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  healthLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 10,
    padding: 8,
    borderRadius: 10,
    backgroundColor: `${colors.warning}14`,
  },
  tipText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    color: colors.text,
  },
  tabs: {
    flexDirection: 'row',
    padding: 3,
    gap: 3,
    borderRadius: 10,
    backgroundColor: colors.iconBackground,
  },
  tab: {
    flex: 1,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabActive: {
    backgroundColor: colors.surface,
  },
  tabText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.text,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rank: {
    width: 16,
    fontSize: 13,
    fontWeight: '800',
    color: colors.textTertiary,
    textAlign: 'center',
  },
  productThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  productInfo: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  productTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  productTitle: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  soldTag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: `${colors.success}1F`,
  },
  soldTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.success,
  },
  productMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  productPrice: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.price,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  metaChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  hintText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
  },
  barRow: {
    marginTop: 10,
    gap: 4,
  },
  barHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  barLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  barValue: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.iconBackground,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  barSub: {
    fontSize: 10,
    color: colors.textMuted,
  },
  peakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
  },
  peakText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  hourWrap: {
    gap: 6,
    marginTop: 10,
  },
  hourRow: {
    flexDirection: 'row',
    gap: 2,
    height: 24,
  },
  hourCell: {
    flex: 1,
    borderRadius: 3,
  },
  hourLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  action: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${colors.primary}14`,
  },
  actionText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
  },
});
