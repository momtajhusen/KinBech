import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../Icon';
import { PressableScale, Pulse, SoftPop } from '../Motion';
import { api } from '../../services/api';
import { clayGreen, useAdminStyles, useAdminTheme } from './adminTheme';

const ICONS = {
  AdminDashboard: 'grid',
  AdminReports: 'flag',
  AdminListings: 'pricetags',
  AdminUsers: 'people',
  AdminMore: 'menu',
};

const BADGE_KEYS = {
  AdminReports: 'reports',
  AdminListings: 'pending-review',
};

export default function AdminTabBar({ state, descriptors, navigation }) {
  const { colors } = useAdminTheme();
  const styles = useAdminStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [counts, setCounts] = useState({});

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await api.adminNavCounts();
      if (alive && data?.counts) setCounts(data.counts);
    };
    load();
    const timer = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <View style={[styles.bar, { bottom: 10 + insets.bottom }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const label = descriptors[route.key]?.options?.title || route.name;
        const badge = Number(counts[BADGE_KEYS[route.name]]) || 0;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };
        return (
          <PressableScale
            key={route.key}
            onPress={onPress}
            scaleTo={0.88}
            style={styles.slot}
            contentStyle={[styles.item, focused && styles.itemActive]}
          >
            <SoftPop key={focused ? 'on' : 'off'}>
              <Icon
                name={focused ? ICONS[route.name] : `${ICONS[route.name]}-outline`}
                size={21}
                color={focused ? colors.white : colors.textMuted}
              />
            </SoftPop>
            <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>{label}</Text>
            {badge > 0 ? (
              <Pulse to={1.12} pause={2200} style={styles.badge}>
                <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
              </Pulse>
            ) : null}
          </PressableScale>
        );
      })}
    </View>
  );
}

const createStyles = (colors) => ({
  bar: {
    position: 'absolute',
    left: 10,
    right: 10,
    flexDirection: 'row',
    gap: 4,
    padding: 6,
    borderRadius: 24,
    backgroundColor: colors.card,
    boxShadow: colors.clay,
  },
  slot: { flex: 1 },
  item: { alignItems: 'center', gap: 2, paddingVertical: 7, borderRadius: 16 },
  itemActive: clayGreen(colors),
  label: { fontSize: 10.5, fontWeight: '800', color: colors.textMuted },
  labelActive: { color: colors.white },
  badge: {
    position: 'absolute',
    top: 2,
    right: '18%',
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.error,
    borderWidth: 2,
    borderColor: colors.card,
  },
  badgeText: { fontSize: 9, fontWeight: '900', color: colors.white },
});
