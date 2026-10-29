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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../Icon';
import { Float, PressableScale, Reanimated, Shimmer, SoftPop, Wiggle, enterCard, enterUp } from '../Motion';
import { titleCase } from '../../utils/admin';
import { clayGreen, clayPressed, useAdminStyles as useThemedStyles, useAdminTheme as useTheme } from './adminTheme';
import { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

export { clayGreen, clayPressed, useAdminStyles, useAdminTheme } from './adminTheme';

const STATUS_ICON = {
  pending: 'hourglass',
  open: 'time',
  initiated: 'time',
  reviewed: 'eye',
  inactive: 'pause-circle',
  active: 'checkmark-circle',
  approved: 'checkmark-circle',
  resolved: 'checkmark-done',
  verified: 'shield-checkmark',
  unverified: 'help-circle',
  sold: 'bag-check',
  dismissed: 'close-circle',
  cancelled: 'close-circle',
  closed: 'checkmark-done',
  none: 'ellipse',
  rejected: 'close-circle',
  removed: 'trash',
  hidden: 'eye-off',
  suspended: 'ban',
  failed: 'alert-circle',
};

/** Number that counts up from its previous value. */
export function CountUp({ value, format = (n) => String(n), duration = 700, style }) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return undefined;
    const start = Date.now();
    let frame;
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      const next = Math.round(from + (target - from) * eased);
      fromRef.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return <Text style={style} numberOfLines={1}>{format(shown)}</Text>;
}

/** Bar that grows from its start edge (bottom for `y`, left for `x`) on mount; change `key` to replay. */
export function GrowBar({ style, axis = 'y', delay = 0 }) {
  const scale = useSharedValue(0);
  useEffect(() => {
    scale.value = 0;
    scale.value = withDelay(delay, withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) }));
  }, [delay, scale]);
  const animated = useAnimatedStyle(() =>
    axis === 'y'
      ? { transform: [{ scaleY: scale.value }], transformOrigin: 'bottom' }
      : { transform: [{ scaleX: scale.value }], transformOrigin: 'left' }
  );
  return <Reanimated.View style={[style, animated]} />;
}

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

/** Page header from the web admin: green clay hub icon, title and hint, with an optional back button. */
export function AdminHeader({ title, subtitle, icon = 'shield-checkmark', onBack, right, children }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
      <View style={styles.headerRow}>
        {onBack ? (
          <PressableScale onPress={onBack} hitSlop={10} scaleTo={0.88} contentStyle={styles.iconBtn}>
            <Icon name="chevron-back" size={22} color={colors.text} />
          </PressableScale>
        ) : null}
        <SoftPop>
          <Wiggle angle={8} every={6000} delay={900} style={styles.hubIcon}>
            <Icon name={icon} size={22} color={colors.white} />
          </Wiggle>
        </SoftPop>
        <Reanimated.View entering={enterUp(0, 0)} style={styles.flex1}>
          <Text style={styles.eyebrow}>KINBECH ADMIN</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.headerSub} numberOfLines={2}>{subtitle}</Text> : null}
        </Reanimated.View>
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
      <Icon name={STATUS_ICON[status] || 'ellipse'} size={10} color={tone.fg} />
      <Text style={[styles.pillText, { color: tone.fg }]}>{label || titleCase(status)}</Text>
    </View>
  );
}

/** Tiny icon + text badge for card details; `tone` tints it, default is muted. */
export function MetaChip({ icon, label, tone, onPress }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  if (label == null || label === '') return null;
  const toned = tone ? toneColors(colors, tone) : null;
  const body = (
    <>
      {icon ? <Icon name={icon} size={11} color={toned ? toned.fg : colors.textTertiary} /> : null}
      <Text style={[styles.metaChipText, toned && { color: toned.fg }]} numberOfLines={1}>{label}</Text>
    </>
  );
  const style = [styles.metaChip, toned && { backgroundColor: toned.bg }];
  if (onPress) {
    return (
      <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => [style, pressed && styles.btnPressed]}>
        {body}
      </Pressable>
    );
  }
  return <View style={style}>{body}</View>;
}

export function MetaRow({ children, style }) {
  const styles = useThemedStyles(createStyles);
  return <View style={[styles.metaRow, style]}>{children}</View>;
}

/** Pressed strip of small numbers; each item `{ label, value, tone }`. */
export function MiniStats({ items, style }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.miniStats, style]}>
      {items.filter(Boolean).map((item, index) => (
        <View key={item.label} style={[styles.miniStat, index > 0 && styles.miniStatDivider]}>
          <Text
            style={[styles.miniStatValue, item.tone && { color: toneColors(colors, item.tone).fg }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {item.value ?? 0}
          </Text>
          <Text style={styles.miniStatLabel} numberOfLines={1}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Filter chips; options `{ value, label, icon?, count? }`. */
export function AdminChips({ options, value, onChange }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {options.map((opt, index) => {
        const active = opt.value === value;
        return (
          <PressableScale
            key={String(opt.value)}
            entering={enterUp(index, 30)}
            scaleTo={0.92}
            onPress={() => onChange(opt.value)}
            contentStyle={[styles.chip, active && styles.chipActive]}
          >
            {opt.icon ? <Icon name={active ? opt.icon : `${opt.icon}-outline`} size={14} color={active ? colors.white : colors.textTertiary} /> : null}
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
            {opt.count != null ? (
              <View style={[styles.chipCount, active && styles.chipCountActive]}>
                <Text style={[styles.chipCountText, active && styles.chipTextActive]}>{opt.count}</Text>
              </View>
            ) : null}
          </PressableScale>
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
      <PressableScale onPress={onPress} scaleTo={0.975} contentStyle={[styles.card, style]}>
        {children}
      </PressableScale>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Card-shaped placeholder with a light sweep while a list loads. */
function SkeletonCard({ index }) {
  const { isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Reanimated.View entering={enterUp(index, 70)} style={styles.card}>
      <View style={styles.skeletonRow}>
        <View style={[styles.skeletonBlock, styles.skeletonThumb]} />
        <View style={styles.flex1}>
          <View style={[styles.skeletonBlock, styles.skeletonLine, { width: '70%' }]} />
          <View style={[styles.skeletonBlock, styles.skeletonLine, { width: '40%' }]} />
          <View style={[styles.skeletonBlock, styles.skeletonLine, { width: '55%' }]} />
        </View>
      </View>
      <View style={[styles.skeletonBlock, styles.skeletonBar]} />
      <View style={styles.skeletonClip} pointerEvents="none">
        <Shimmer duration={1300} pause={250} color={isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.75)'} />
      </View>
    </Reanimated.View>
  );
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
          <PressableScale
            key={action.label}
            disabled={Boolean(busy)}
            scaleTo={0.9}
            onPress={async () => {
              setBusy(action.label);
              try {
                await action.onPress();
              } finally {
                setBusy('');
              }
            }}
            contentStyle={[
              styles.actionBtn,
              solid
                ? action.tone && action.tone !== 'success'
                  ? { backgroundColor: tone.fg, boxShadow: colors.clayTint }
                  : styles.solidGreen
                : { backgroundColor: tone.bg },
              busy && busy !== action.label && styles.disabled,
            ]}
          >
            {busy === action.label ? (
              <ActivityIndicator size="small" color={solid ? colors.white : tone.fg} />
            ) : action.icon ? (
              <Icon name={action.icon} size={14} color={solid ? colors.white : tone.fg} />
            ) : null}
            <Text style={[styles.actionText, { color: solid ? colors.white : tone.fg }]}>{action.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

export function AdminEmpty({ icon = 'checkmark-done', title, body }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Reanimated.View entering={enterUp(0)} style={styles.empty}>
      <Float distance={5} duration={1500} style={styles.emptyIcon}>
        <Icon name={icon} size={30} color={colors.primary} />
      </Float>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
    </Reanimated.View>
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
  const animatedItem = useCallback(
    (info) => (
      // Only the first screenful animates in; later pages appear as they scroll in.
      <Reanimated.View entering={info.index < 12 ? enterCard(info.index, 50) : undefined}>
        {renderItem(info)}
      </Reanimated.View>
    ),
    [renderItem]
  );
  return (
    <FlatList
      data={list.status === 'ready' ? list.items : []}
      keyExtractor={(item) => String(item.id)}
      renderItem={animatedItem}
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
          <View>
            {[0, 1, 2].map((i) => <SkeletonCard key={i} index={i} />)}
          </View>
        ) : list.status === 'error' ? (
          <Reanimated.View entering={enterUp(0)} style={styles.errorBox}>
            <Wiggle angle={10} every={2500} style={styles.errorIcon}>
              <Icon name="cloud-offline" size={26} color={colors.error} />
            </Wiggle>
            <Text style={styles.errorText}>{list.error}</Text>
            <PressableScale onPress={() => list.reload()} contentStyle={[styles.retryBtn, styles.solidGreen]}>
              <Icon name="refresh" size={15} color={colors.white} />
              <Text style={styles.retryText}>Try again</Text>
            </PressableScale>
          </Reanimated.View>
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

const splitReasons = (text) => String(text || '').split(/\.\s*/).map((part) => part.trim()).filter(Boolean);

/**
 * Text prompt sheet for reasons and replies; `ask()` resolves the text or null when cancelled.
 * With `choices: [{ value, label }]` it resolves `{ text, choice }` instead.
 * `presets: string[]` adds tap-to-add reason chips; tapping again removes it from the text.
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
      onPreset={(preset) =>
        setConfig((prev) => {
          const parts = splitReasons(prev.value);
          const next = parts.includes(preset) ? parts.filter((part) => part !== preset) : [...parts, preset];
          return { ...prev, value: next.join('. ') };
        })
      }
      onCancel={() => close(null)}
      onSubmit={submit}
    />
  );
  return [element, ask];
}

function PromptSheet({ config, onChange, onChoice, onPreset, onCancel, onSubmit }) {
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
          {config?.presets?.length ? (
            <View style={styles.sheetPresets}>
              {config.presets.map((preset) => {
                const active = splitReasons(config.value).includes(preset);
                return (
                  <Pressable
                    key={preset}
                    onPress={() => onPreset(preset)}
                    style={[styles.presetChip, active && styles.chipActive]}
                  >
                    {active ? <Icon name="checkmark" size={13} color={colors.white} /> : null}
                    <Text style={[styles.presetText, active && styles.chipTextActive]}>{preset}</Text>
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
            autoFocus={!config?.choices && !config?.presets?.length}
            maxLength={config?.maxLength || 500}
          />
          <View style={styles.sheetActions}>
            <Pressable onPress={onCancel} style={[styles.sheetBtn, styles.sheetBtnGhost]}>
              <Text style={styles.sheetBtnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onSubmit}
              disabled={!canSubmit}
              style={[styles.sheetBtn, config?.destructive ? styles.sheetBtnDanger : styles.solidGreen, !canSubmit && styles.disabled]}
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
  header: { paddingHorizontal: 16, paddingBottom: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    boxShadow: colors.claySoft,
  },
  hubIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    ...clayGreen(colors),
  },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, color: colors.primary },
  headerTitle: { fontSize: 20, fontWeight: '900', letterSpacing: -0.2, color: colors.text },
  headerSub: { marginTop: 1, fontSize: 12.5, fontWeight: '600', color: colors.textMuted },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 999,
    alignSelf: 'flex-start',
    boxShadow: colors.clayBadge,
  },
  pillText: { fontSize: 10.5, fontWeight: '800' },

  skeletonClip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 20, overflow: 'hidden' },
  skeletonRow: { flexDirection: 'row', gap: 11 },
  skeletonBlock: { borderRadius: 8, ...clayPressed(colors) },
  skeletonThumb: { width: 56, height: 56, borderRadius: 15 },
  skeletonLine: { height: 11, marginBottom: 8 },
  skeletonBar: { height: 30, marginTop: 10, borderRadius: 12 },
  errorIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.pastelRed,
    boxShadow: colors.clayTint,
  },

  chips: { gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: colors.card,
    boxShadow: colors.claySoft,
  },
  chipActive: clayGreen(colors),
  chipText: { fontSize: 13, fontWeight: '800', color: colors.textSecondary },
  chipTextActive: { color: colors.white },
  chipCount: {
    minWidth: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    ...clayPressed(colors),
  },
  chipCountActive: { backgroundColor: 'rgba(255,255,255,0.22)', boxShadow: [] },
  chipCountText: { fontSize: 11, fontWeight: '800', color: colors.textTertiary },

  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 15,
    ...clayPressed(colors),
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text, paddingVertical: 0 },

  card: {
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 13,
    borderRadius: 20,
    backgroundColor: colors.card,
    boxShadow: colors.clay,
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 999,
    ...clayPressed(colors),
  },
  metaChipText: { flexShrink: 1, fontSize: 10.5, fontWeight: '800', color: colors.textTertiary },

  miniStats: {
    flexDirection: 'row',
    marginTop: 10,
    paddingVertical: 7,
    borderRadius: 14,
    ...clayPressed(colors),
  },
  miniStat: { flex: 1, alignItems: 'center', paddingHorizontal: 2 },
  miniStatDivider: { borderLeftWidth: 1, borderLeftColor: colors.border },
  miniStatValue: { fontSize: 13.5, fontWeight: '900', color: colors.text },
  miniStatLabel: { marginTop: 1, fontSize: 9, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: colors.textMuted },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 11 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 13,
    boxShadow: colors.clayTint,
  },
  solidGreen: clayGreen(colors),
  btnPressed: { boxShadow: colors.clayPressed, transform: [{ translateY: 1 }] },
  actionText: { fontSize: 12, fontWeight: '800' },

  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32 },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    boxShadow: colors.clay,
    marginBottom: 18,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: colors.text, textAlign: 'center' },
  emptyBody: { marginTop: 4, fontSize: 13, fontWeight: '600', color: colors.textMuted, textAlign: 'center', lineHeight: 19 },

  listContent: { flexGrow: 1 },
  footerLoader: { marginVertical: 18 },
  errorBox: { alignItems: 'center', padding: 32, gap: 14 },
  errorText: { fontSize: 14, fontWeight: '700', color: colors.error, textAlign: 'center' },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 16 },
  retryText: { color: colors.white, fontWeight: '800' },

  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.backdrop },
  sheet: {
    padding: 22,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.card,
    boxShadow: colors.clay,
  },
  sheetHandle: { alignSelf: 'center', width: 44, height: 6, borderRadius: 3, marginBottom: 16, ...clayPressed(colors) },
  sheetTitle: { fontSize: 19, fontWeight: '900', color: colors.text },
  sheetMessage: { marginTop: 4, fontSize: 13, fontWeight: '600', color: colors.textMuted, lineHeight: 19 },
  sheetInput: {
    marginTop: 16,
    minHeight: 96,
    maxHeight: 180,
    padding: 14,
    borderRadius: 16,
    ...clayPressed(colors),
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    textAlignVertical: 'top',
  },
  sheetInputNumeric: { minHeight: 0, fontSize: 18, fontWeight: '800', textAlignVertical: 'center' },
  sheetChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  sheetPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 16 },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: colors.card,
    boxShadow: colors.claySoft,
  },
  presetText: { fontSize: 12.5, fontWeight: '700', color: colors.textSecondary },
  sheetActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  sheetBtn: { flex: 1, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sheetBtnGhost: { backgroundColor: colors.card, boxShadow: colors.claySoft },
  sheetBtnDanger: { backgroundColor: colors.error, boxShadow: colors.clayTint },
  sheetBtnGhostText: { fontSize: 15, fontWeight: '800', color: colors.textSecondary },
  sheetBtnText: { fontSize: 15, fontWeight: '800', color: colors.white },
  disabled: { opacity: 0.55 },
});
