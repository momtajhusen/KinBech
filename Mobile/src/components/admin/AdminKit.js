import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../Icon';
import { useTheme, useThemedStyles } from '../../theme';
import { titleCase } from '../../utils/admin';

export const ADMIN_GRADIENT = ['#0B1220', '#0F3D2E', '#047857'];

const STATUS_TONE = {
  pending: 'warning',
  open: 'warning',
  initiated: 'warning',
  reviewed: 'info',
  inactive: 'info',
  active: 'success',
  approved: 'success',
  resolved: 'success',
  sold: 'muted',
  dismissed: 'muted',
  cancelled: 'muted',
  none: 'muted',
  rejected: 'error',
  removed: 'error',
  suspended: 'error',
  failed: 'error',
};

export function toneColors(colors, tone) {
  switch (tone) {
    case 'success':
      return { fg: colors.success, bg: colors.pastelGreen };
    case 'warning':
      return { fg: colors.warning, bg: colors.pastelOrange };
    case 'error':
      return { fg: colors.error, bg: colors.pastelRed };
    case 'info':
      return { fg: colors.info, bg: colors.pastelBlue };
    default:
      return { fg: colors.textTertiary, bg: colors.surfaceMuted };
  }
}

export function AdminHeader({ title, subtitle, onBack, right, children }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <LinearGradient colors={ADMIN_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill} />
      <View style={styles.headerGlow} pointerEvents="none" />
      <View style={styles.headerRow}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={10} style={styles.headerBtn} accessibilityLabel="Go back">
            <Icon name="chevron-back" size={22} color={colors.white} />
          </Pressable>
        ) : null}
        <View style={styles.flex1}>
          <View style={styles.badge}>
            <Icon name="shield-checkmark" size={12} color="#A7F3D0" />
            <Text style={styles.badgeText}>KINBECH ADMIN</Text>
          </View>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.headerSub} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

export function StatusPill({ status, label }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const tone = toneColors(colors, STATUS_TONE[status] || 'muted');
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.pillText, { color: tone.fg }]}>{label || titleCase(status)}</Text>
    </View>
  );
}

export function AdminChips({ options, value, onChange }) {
  const styles = useThemedStyles(createStyles);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
            {opt.count != null ? (
              <View style={[styles.chipCount, active && styles.chipCountActive]}>
                <Text style={[styles.chipCountText, active && styles.chipTextActive]}>{opt.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function AdminSearch({ value, onChangeText, placeholder = 'Search' }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.search}>
      <Icon name="search" size={18} color={colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={styles.searchInput}
        returnKeyType="search"
        autoCorrect={false}
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={8}>
          <Icon name="close-circle" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function AdminCard({ children, style, onPress }) {
  const styles = useThemedStyles(createStyles);
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Row of small action buttons; each `{ label, icon, tone, onPress }`. */
export function AdminActions({ actions }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [busy, setBusy] = useState('');
  const visible = actions.filter(Boolean);
  if (!visible.length) return null;
  return (
    <View style={styles.actions}>
      {visible.map((action) => {
        const tone = toneColors(colors, action.tone || 'success');
        const solid = action.solid;
        return (
          <Pressable
            key={action.label}
            disabled={Boolean(busy)}
            onPress={async () => {
              setBusy(action.label);
              try {
                await action.onPress();
              } finally {
                setBusy('');
              }
            }}
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: solid ? tone.fg : tone.bg },
              pressed && styles.cardPressed,
            ]}
          >
            {busy === action.label ? (
              <ActivityIndicator size="small" color={solid ? colors.white : tone.fg} />
            ) : action.icon ? (
              <Icon name={action.icon} size={15} color={solid ? colors.white : tone.fg} />
            ) : null}
            <Text style={[styles.actionText, { color: solid ? colors.white : tone.fg }]}>{action.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function AdminEmpty({ icon = 'checkmark-done', title, body }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={30} color={colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
    </View>
  );
}

export function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Paged admin list. `load(page)` resolves `{ items, total, totalPages, extra, error }`;
 * every item needs an `id`. Changing `key` reloads from page 1.
 */
export function useAdminList(load, key) {
  const [list, setList] = useState({ items: [], total: 0, page: 1, totalPages: 1, extra: null });
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const reqRef = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async (mode = 'loading') => {
    const id = ++reqRef.current;
    if (mode === 'refresh') setRefreshing(true);
    else setStatus('loading');
    const res = await loadRef.current(1);
    if (id !== reqRef.current) return;
    setRefreshing(false);
    if (res.error) {
      setError(res.error);
      setStatus('error');
      return;
    }
    setList({
      items: res.items || [],
      total: res.total ?? (res.items || []).length,
      page: 1,
      totalPages: res.totalPages || 1,
      extra: res.extra ?? null,
    });
    setError('');
    setStatus('ready');
  }, []);

  useEffect(() => {
    reload();
  }, [key, reload]);

  const loadMore = useCallback(async () => {
    if (loadingMore || status !== 'ready' || list.page >= list.totalPages) return;
    const id = reqRef.current;
    setLoadingMore(true);
    const res = await loadRef.current(list.page + 1);
    setLoadingMore(false);
    if (id !== reqRef.current || res.error) return;
    setList((prev) => {
      const seen = new Set(prev.items.map((item) => item.id));
      return {
        items: [...prev.items, ...(res.items || []).filter((item) => !seen.has(item.id))],
        total: res.total ?? prev.total,
        page: prev.page + 1,
        totalPages: res.totalPages || prev.totalPages,
        extra: res.extra ?? prev.extra,
      };
    });
  }, [loadingMore, status, list.page, list.totalPages]);

  const patchItem = useCallback((id, patch) => {
    setList((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  }, []);

  const removeItem = useCallback((id) => {
    setList((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== id),
      total: Math.max(0, prev.total - 1),
    }));
  }, []);

  return { ...list, status, error, refreshing, loadingMore, reload, loadMore, patchItem, removeItem };
}

export function AdminList({ list, renderItem, header, emptyTitle, emptyBody, emptyIcon }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  return (
    <FlatList
      data={list.status === 'ready' ? list.items : []}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderItem}
      ListHeaderComponent={header}
      contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 110 }]}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.4}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={list.refreshing}
          onRefresh={() => list.reload('refresh')}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      ListEmptyComponent={
        list.status === 'loading' ? (
          <ActivityIndicator style={styles.loader} color={colors.primary} />
        ) : list.status === 'error' ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{list.error}</Text>
            <Pressable onPress={() => list.reload()} style={styles.retryBtn}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <AdminEmpty icon={emptyIcon} title={emptyTitle} body={emptyBody} />
        )
      }
      ListFooterComponent={list.loadingMore ? <ActivityIndicator style={styles.footerLoader} color={colors.primary} /> : null}
    />
  );
}

export function confirmAction({ title, message, confirmText = 'Confirm', destructive = false }) {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

export function showAdminError(message) {
  Alert.alert('Could not update', message || 'Please try again.');
}

/**
 * Text prompt sheet for reasons and replies; `ask()` resolves the text or null when cancelled.
 * With `choices: [{ value, label }]` it resolves `{ text, choice }` instead.
 */
export function usePrompt() {
  const [config, setConfig] = useState(null);
  const resolverRef = useRef(null);

  const ask = useCallback((options) => new Promise((resolve) => {
    resolverRef.current = resolve;
    setConfig({ ...options, value: options.initial || '', choice: options.choiceInitial ?? options.choices?.[0]?.value });
  }), []);

  const close = (value) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setConfig(null);
  };

  const submit = () => {
    const text = String(config?.value || '').trim();
    close(config?.choices ? { text, choice: config.choice } : text);
  };

  const element = (
    <PromptSheet
      config={config}
      onChange={(value) => setConfig((prev) => ({ ...prev, value }))}
      onChoice={(choice) => setConfig((prev) => ({ ...prev, choice }))}
      onCancel={() => close(null)}
      onSubmit={submit}
    />
  );
  return [element, ask];
}

function PromptSheet({ config, onChange, onChoice, onCancel, onSubmit }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const canSubmit = !config?.required || String(config?.value || '').trim().length > 0;
  const numeric = config?.keyboardType === 'number-pad';
  return (
    <Modal visible={Boolean(config)} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        <Pressable style={styles.sheetBackdrop} onPress={onCancel} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{config?.title}</Text>
          {config?.message ? <Text style={styles.sheetMessage}>{config.message}</Text> : null}
          {config?.choices ? (
            <View style={styles.sheetChoices}>
              {config.choices.map((opt) => {
                const active = opt.value === config.choice;
                return (
                  <Pressable
                    key={String(opt.value)}
                    onPress={() => onChoice(opt.value)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <TextInput
            value={config?.value || ''}
            onChangeText={onChange}
            placeholder={config?.placeholder || ''}
            placeholderTextColor={colors.textMuted}
            style={[styles.sheetInput, numeric && styles.sheetInputNumeric]}
            multiline={!numeric}
            keyboardType={numeric ? 'number-pad' : 'default'}
            autoFocus={!config?.choices}
            maxLength={config?.maxLength || 500}
          />
          <View style={styles.sheetActions}>
            <Pressable onPress={onCancel} style={[styles.sheetBtn, styles.sheetBtnGhost]}>
              <Text style={styles.sheetBtnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onSubmit}
              disabled={!canSubmit}
              style={[styles.sheetBtn, { backgroundColor: config?.destructive ? colors.error : colors.primary }, !canSubmit && styles.disabled]}
            >
              <Text style={styles.sheetBtnText}>{config?.confirmText || 'Save'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (colors) => ({
  flex1: { flex: 1 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    overflow: 'hidden',
  },
  headerGlow: {
    position: 'absolute',
    right: -60,
    top: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(52, 211, 153, 0.16)',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(167, 243, 208, 0.14)',
    marginBottom: 6,
  },
  badgeText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 1, color: '#A7F3D0' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: colors.white },
  headerSub: { marginTop: 2, fontSize: 13, color: 'rgba(255,255,255,0.72)' },

  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  pillText: { fontSize: 11, fontWeight: '800' },

  chips: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  chipTextActive: { color: colors.white },
  chipCount: { minWidth: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: colors.surfaceMuted, alignItems: 'center' },
  chipCountActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  chipCountText: { fontSize: 11, fontWeight: '800', color: colors.textTertiary },

  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 14,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, paddingVertical: 0 },

  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: { opacity: 0.82 },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  actionText: { fontSize: 12.5, fontWeight: '800' },

  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.pastelGreen,
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: colors.text, textAlign: 'center' },
  emptyBody: { marginTop: 4, fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },

  listContent: { flexGrow: 1 },
  loader: { marginTop: 48 },
  footerLoader: { marginVertical: 18 },
  errorBox: { alignItems: 'center', padding: 32, gap: 12 },
  errorText: { fontSize: 14, color: colors.error, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.primary },
  retryText: { color: colors.white, fontWeight: '800' },

  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    padding: 20,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: colors.surface,
  },
  sheetHandle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: 14 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  sheetMessage: { marginTop: 4, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  sheetInput: {
    marginTop: 14,
    minHeight: 96,
    maxHeight: 180,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground,
    color: colors.text,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  sheetInputNumeric: { minHeight: 0, fontSize: 18, fontWeight: '700', textAlignVertical: 'center' },
  sheetChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  sheetBtn: { flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sheetBtnGhost: { backgroundColor: colors.surfaceMuted },
  sheetBtnGhostText: { fontSize: 15, fontWeight: '800', color: colors.textSecondary },
  sheetBtnText: { fontSize: 15, fontWeight: '800', color: colors.white },
  disabled: { opacity: 0.5 },
});
