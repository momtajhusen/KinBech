import { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../services/api';
import { formatPrice } from '../utils/listing';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

const createStyles = (colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.white },
  content: { padding: 20, paddingBottom: 40, gap: 16 },
  hero: {
    borderRadius: 22,
    padding: 20,
    overflow: 'hidden',
  },
  heroLabel: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  heroValue: { fontSize: 32, fontWeight: '800', color: colors.white, marginTop: 6 },
  heroHint: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 8, lineHeight: 18 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 6,
  },
  statLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.text },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  amountSale: { fontSize: 14, fontWeight: '800', color: colors.statusActive },
  amountBuy: { fontSize: 14, fontWeight: '800', color: colors.text },
  emptyWrap: { alignItems: 'center', paddingVertical: 36, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  emptyBody: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('en-NP', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch (_) {
    return '';
  }
}

export default function WalletScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await api.getWallet();
    setLoading(false);
    setWallet(data?.wallet || null);
    setTransactions(Array.isArray(data?.transactions) ? data.transactions : []);
  }, []);

  const { refreshing, onRefresh } = usePullRefresh(load);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

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
        <Text style={styles.headerTitle}>Wallet</Text>
        <View style={{ width: 24 }} />
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 56 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            <LinearGradient
              colors={[colors.gradientStart, colors.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <Text style={styles.heroLabel}>Net from KinBech deals</Text>
              <Text style={styles.heroValue}>{formatPrice(wallet?.net || 0)}</Text>
              <Text style={styles.heroHint}>
                This is a sales vs purchases summary. KinBech does not hold in-app money — you pay at meetup or via your saved wallet IDs.
              </Text>
            </LinearGradient>

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Ionicons name="arrow-down-circle-outline" size={18} color={colors.statusActive} />
                <Text style={styles.statLabel}>Sales</Text>
                <Text style={styles.statValue}>{formatPrice(wallet?.salesTotal || 0)}</Text>
                <Text style={styles.statLabel}>{wallet?.soldCount || 0} sold</Text>
              </View>
              <View style={styles.statCard}>
                <Ionicons name="arrow-up-circle-outline" size={18} color={colors.primary} />
                <Text style={styles.statLabel}>Purchases</Text>
                <Text style={styles.statValue}>{formatPrice(wallet?.purchaseTotal || 0)}</Text>
                <Text style={styles.statLabel}>{wallet?.purchaseCount || 0} bought</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Activity</Text>
            {transactions.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="receipt-outline" size={36} color={colors.textTertiary} />
                <Text style={styles.emptyTitle}>No deals yet</Text>
                <Text style={styles.emptyBody}>
                  Sold items and confirmed meetups will show here as your transaction history.
                </Text>
              </View>
            ) : (
              transactions.map((tx) => {
                const isSale = tx.type === 'sale';
                return (
                  <View key={tx.id} style={styles.row}>
                    <View
                      style={[
                        styles.iconCircle,
                        { backgroundColor: isSale ? colors.pastelLime : colors.pastelIndigo },
                      ]}
                    >
                      <Ionicons
                        name={isSale ? 'arrow-down' : 'arrow-up'}
                        size={18}
                        color={isSale ? colors.statusActive : colors.primary}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {tx.title}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {isSale ? 'Sale' : 'Purchase'} · {formatDate(tx.date)}
                      </Text>
                    </View>
                    <Text style={isSale ? styles.amountSale : styles.amountBuy}>
                      {isSale ? '+' : '-'}
                      {formatPrice(tx.amount)}
                    </Text>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
