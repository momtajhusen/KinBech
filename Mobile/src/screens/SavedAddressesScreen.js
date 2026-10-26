import { useCallback, useState } from 'react';
import Icon from '../components/Icon';
import ScreenLoader from '../components/ScreenLoader';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useKeyboardOverlap } from '../components/FormScroll';
import { useFocusEffect } from '@react-navigation/native';
import GradientButton from '../components/GradientButton';
import HeroHeader, { HeroAction, HeroStat } from '../components/HeroHeader';
import { EditField } from '../components/ProfileEditKit';
import { PressableScale, Reanimated, enterUp } from '../components/Motion';
import { AlertModal, showErrorAlert, showSuccessAlert } from '../components/AlertModal';
import { api } from '../services/api';
import { formatCityDistrict } from '../utils/locations';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

const LABELS = [
  { key: 'Home', icon: 'home', tint: '#10B981', hint: 'Where you live' },
  { key: 'Work', icon: 'briefcase', tint: '#3B82F6', hint: 'Office or shop' },
  { key: 'Meetup', icon: 'people', tint: '#F59E0B', hint: 'Public meeting spot' },
  { key: 'Other', icon: 'bookmark', tint: '#8B5CF6', hint: 'Anything else' },
];

function labelMeta(label) {
  return LABELS.find((item) => item.key === label) || LABELS[3];
}

export default function SavedAddressesScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const keyboardOverlap = useKeyboardOverlap();
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [label, setLabel] = useState('Home');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);

  const closeAlert = () => setAlertConfig(null);
  const fail = (title, message) => setAlertConfig(showErrorAlert({ title, message, onConfirm: closeAlert }));

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await api.getAddresses();
    setLoading(false);
    setAddresses(!error && Array.isArray(data?.addresses) ? data.addresses : []);
  }, []);

  const { refreshing, onRefresh } = usePullRefresh(load);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openNew = (preset = 'Home') => {
    setEditingId(null);
    setLabel(preset);
    setLine1('');
    setCity('');
    setIsDefault(addresses.length === 0);
    setSheetOpen(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setLabel(item.label || 'Home');
    setLine1(item.line1 || '');
    setCity(item.city || '');
    setIsDefault(Boolean(item.isDefault));
    setSheetOpen(true);
  };

  const fillFromLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        fail('Location permission', 'Allow location access to fill the address for you.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [place] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      if (!place) {
        fail('Address not found', 'We could not read an address here. Please type it.');
        return;
      }
      const street = [place.name, place.street].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i);
      setLine1(street.join(', ') || place.district || '');
      setCity(formatCityDistrict(place));
    } catch {
      fail('Location error', 'Could not get your location. Please type the address.');
    } finally {
      setLocating(false);
    }
  };

  const save = async () => {
    if (!line1.trim()) {
      fail('Address required', 'Add a street, landmark, or area name.');
      return;
    }
    setSaving(true);
    const payload = { label, line1: line1.trim(), city: city.trim(), isDefault };
    const { data, error } = editingId
      ? await api.updateAddress(editingId, payload)
      : await api.createAddress(payload);
    setSaving(false);
    if (error) {
      fail('Could not save', error);
      return;
    }
    setAddresses(data?.addresses || []);
    setSheetOpen(false);
    setAlertConfig(
      showSuccessAlert({
        title: editingId ? 'Address updated' : 'Address saved',
        message: 'This location is ready for meetups and listings.',
        onConfirm: closeAlert,
      })
    );
  };

  const makeDefault = async (item) => {
    const { data, error } = await api.updateAddress(item.id, { isDefault: true });
    if (error) {
      fail('Could not update', error);
      return;
    }
    if (data?.addresses) setAddresses(data.addresses);
  };

  const openInMaps = (item) => {
    const query = encodeURIComponent([item.line1, item.city].filter(Boolean).join(', '));
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`).catch(() => {
      fail('Could not open maps', 'No maps app was found on this phone.');
    });
  };

  const remove = (item) => {
    setAlertConfig({
      type: 'warning',
      title: 'Remove address?',
      message: `${item.label} will be deleted from your saved locations.`,
      primaryButton: {
        text: 'Remove',
        onPress: async () => {
          closeAlert();
          const { data, error } = await api.deleteAddress(item.id);
          if (error) {
            fail('Could not delete', error);
            return;
          }
          setAddresses(data?.addresses || []);
        },
      },
      secondaryButton: { text: 'Cancel', onPress: closeAlert },
    });
  };

  const defaultAddress = addresses.find((item) => item.isDefault);
  const cityCount = new Set(addresses.map((item) => item.city?.trim().toLowerCase()).filter(Boolean)).size;

  const renderCard = (item, index) => {
    const meta = labelMeta(item.label);
    return (
      <Reanimated.View
        key={item.id}
        entering={enterUp(index)}
        style={[styles.card, item.isDefault && { borderColor: `${meta.tint}66` }]}
      >
        <View style={styles.cardTop}>
          <View style={[styles.labelTile, { backgroundColor: `${meta.tint}1F` }]}>
            <Icon name={meta.icon} size={22} color={meta.tint} />
          </View>
          <View style={styles.flex1}>
            <View style={styles.titleRow}>
              <Text style={styles.cardTitle}>{item.label}</Text>
              {item.isDefault ? (
                <View style={styles.defaultBadge}>
                  <Icon name="star" size={10} color={colors.warning} />
                  <Text style={styles.defaultBadgeText}>Default</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.cardLine} numberOfLines={2}>{item.line1}</Text>
            {item.city ? (
              <View style={styles.cityRow}>
                <Icon name="business-outline" size={12} color={colors.textMuted} />
                <Text style={styles.cityText} numberOfLines={1}>{item.city}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.actionBtn} onPress={() => openInMaps(item)}>
            <Icon name="map-outline" size={15} color={colors.info} />
            <Text style={styles.actionText}>Map</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={() => openEdit(item)}>
            <Icon name="create-outline" size={15} color={colors.textSecondary} />
            <Text style={styles.actionText}>Edit</Text>
          </Pressable>
          {!item.isDefault ? (
            <Pressable style={styles.actionBtn} onPress={() => makeDefault(item)}>
              <Icon name="star-outline" size={15} color={colors.warning} />
              <Text style={styles.actionText}>Default</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.deleteBtn} onPress={() => remove(item)} accessibilityLabel="Delete address">
            <Icon name="trash-outline" size={16} color={colors.danger} />
          </Pressable>
        </View>
      </Reanimated.View>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right']}>
      <ThemeStatusBar variant="header" />
      <HeroHeader
        icon="location"
        title="Saved Addresses"
        subtitle="Places you reuse for meetups and listings"
        onBack={() => navigation.goBack()}
        right={<HeroAction icon="add" label="Add address" onPress={() => openNew()} />}
      >
        <View style={styles.statRow}>
          <HeroStat icon="bookmark-outline" value={addresses.length} label="Saved" />
          <HeroStat icon="star-outline" value={defaultAddress?.label || '—'} label="Default" />
          <HeroStat icon="business-outline" value={cityCount} label={cityCount === 1 ? 'City' : 'Cities'} />
        </View>
      </HeroHeader>

      <ScrollView
        style={styles.flex1}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 56 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        {loading && addresses.length === 0 ? null : addresses.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyRingOuter}>
              <View style={styles.emptyRingInner}>
                <Icon name="location" size={34} color={colors.primary} />
              </View>
            </View>
            <Text style={styles.emptyTitle}>No saved addresses yet</Text>
            <Text style={styles.emptyBody}>
              Save home, work, or a public meetup spot so you can reuse it when posting or confirming a deal.
            </Text>
            <View style={styles.quickRow}>
              {LABELS.slice(0, 3).map((item) => (
                <PressableScale key={item.key} style={styles.flex1} contentStyle={styles.quickTile} onPress={() => openNew(item.key)}>
                  <View style={[styles.quickIcon, { backgroundColor: `${item.tint}1F` }]}>
                    <Icon name={item.icon} size={20} color={item.tint} />
                  </View>
                  <Text style={styles.quickText}>{item.key}</Text>
                </PressableScale>
              ))}
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>Your places</Text>
            {addresses.map(renderCard)}
            <PressableScale contentStyle={styles.addRow} onPress={() => openNew()}>
              <View style={styles.addRowIcon}>
                <Icon name="add" size={18} color={colors.primary} />
              </View>
              <Text style={styles.addRowText}>Add another address</Text>
              <Icon name="chevron-forward" size={16} color={colors.textMuted} />
            </PressableScale>
          </>
        )}

        <View style={styles.tipCard}>
          <View style={styles.tipIcon}>
            <Icon name="shield-checkmark" size={18} color={colors.success} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.tipTitle}>Meet safely</Text>
            <Text style={styles.tipText}>
              Use busy public places for exchanges and keep your exact home address private until you trust the other person.
            </Text>
          </View>
        </View>
      </ScrollView>
      {loading && addresses.length === 0 ? <ScreenLoader overlay label="Loading addresses" /> : null}

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.flex1} onPress={() => setSheetOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 + keyboardOverlap }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHead}>
              <View style={[styles.sheetIcon, { backgroundColor: `${labelMeta(label).tint}1F` }]}>
                <Icon name={labelMeta(label).icon} size={20} color={labelMeta(label).tint} />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.sheetTitle}>{editingId ? 'Edit address' : 'New address'}</Text>
                <Text style={styles.sheetSub}>{labelMeta(label).hint}</Text>
              </View>
              <Pressable onPress={() => setSheetOpen(false)} hitSlop={10} style={styles.sheetClose}>
                <Icon name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.labelGrid}>
              {LABELS.map((item) => {
                const active = label === item.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => setLabel(item.key)}
                    style={[styles.labelOption, active && { borderColor: item.tint, backgroundColor: `${item.tint}14` }]}
                  >
                    <Icon name={active ? item.icon : `${item.icon}-outline`} size={20} color={active ? item.tint : colors.textMuted} />
                    <Text style={[styles.labelOptionText, active && { color: item.tint }]}>{item.key}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable style={styles.locateBtn} onPress={fillFromLocation} disabled={locating}>
              {locating ? (
                <ActivityIndicator size="small" color={colors.info} />
              ) : (
                <Icon name="locate" size={17} color={colors.info} />
              )}
              <Text style={styles.locateText}>{locating ? 'Finding your location…' : 'Use my current location'}</Text>
            </Pressable>

            <EditField
              label="Address"
              icon="navigate-outline"
              value={line1}
              onChangeText={setLine1}
              placeholder="Street, landmark, or area"
            />
            <EditField
              label="City"
              icon="business-outline"
              value={city}
              onChangeText={setCity}
              placeholder="Kathmandu, Pokhara…"
            />

            <View style={styles.defaultRow}>
              <View style={styles.defaultIcon}>
                <Icon name="star" size={15} color={colors.warning} />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.defaultLabel}>Use as default</Text>
                <Text style={styles.defaultHint}>Picked first when you post or plan a meetup</Text>
              </View>
              <Switch
                value={isDefault}
                onValueChange={setIsDefault}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.white}
              />
            </View>

            <GradientButton
              title={saving ? 'Saving…' : editingId ? 'Save changes' : 'Save address'}
              icon="checkmark"
              disabled={saving}
              onPress={save}
            />
          </View>
        </View>
      </Modal>

      <AlertModal visible={!!alertConfig} onClose={closeAlert} {...(alertConfig || {})} />
    </SafeAreaView>
  );
}

const createStyles = (colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  statRow: { flexDirection: 'row', gap: 8 },
  content: { padding: 16, gap: 12 },
  sectionLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
  },
  cardTop: { flexDirection: 'row', gap: 12 },
  labelTile: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  defaultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: colors.pastelOrange,
  },
  defaultBadgeText: { fontSize: 10.5, fontWeight: '800', color: colors.warning },
  cardLine: { marginTop: 3, fontSize: 13.5, lineHeight: 19, color: colors.textSecondary },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  cityText: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.textMuted },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionBtn: {
    flex: 1,
    height: 36,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: colors.iconBackground,
  },
  actionText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.deleteBg,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  addRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.pastelGreen,
  },
  addRowText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  emptyWrap: { alignItems: 'center', paddingTop: 28, paddingBottom: 8, paddingHorizontal: 8, gap: 10 },
  emptyRingOuter: {
    width: 116,
    height: 116,
    borderRadius: 58,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.pastelGreen,
  },
  emptyRingInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  emptyTitle: { marginTop: 6, fontSize: 18, fontWeight: '900', color: colors.text },
  emptyBody: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  quickRow: { flexDirection: 'row', gap: 10, marginTop: 8, alignSelf: 'stretch' },
  quickTile: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  quickIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  quickText: { fontSize: 13, fontWeight: '800', color: colors.text },
  tipCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    marginTop: 4,
    borderRadius: 18,
    backgroundColor: colors.pastelLime,
  },
  tipIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  tipTitle: { fontSize: 13.5, fontWeight: '800', color: colors.text },
  tipText: { marginTop: 2, fontSize: 12.5, lineHeight: 18, color: colors.textSecondary },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 10,
    gap: 14,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  sheetSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconBackground,
  },
  labelGrid: { flexDirection: 'row', gap: 8 },
  labelOption: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  labelOptionText: { fontSize: 12, fontWeight: '800', color: colors.textSecondary },
  locateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.pastelBlue,
  },
  locateText: { fontSize: 13.5, fontWeight: '800', color: colors.info },
  defaultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  defaultIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.pastelOrange,
  },
  defaultLabel: { fontSize: 14, fontWeight: '800', color: colors.text },
  defaultHint: { fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
});
