import { useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Animated, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, useThemedStyles } from '../theme';

const ICONS = {
  Home: { outline: 'home-outline', filled: 'home' },
  Explore: { outline: 'compass-outline', filled: 'compass' },
  Post: { outline: 'add', filled: 'add' },
  Chats: { outline: 'chatbubble-ellipses-outline', filled: 'chatbubble-ellipses' },
  Profile: { outline: 'person-outline', filled: 'person' },
};

function bounce(anim) {
  Animated.sequence([
    Animated.spring(anim, {
      toValue: 1.18,
      useNativeDriver: true,
      tension: 320,
      friction: 7,
    }),
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 280,
      friction: 10,
    }),
  ]).start();
}

function TabItem({ isFocused, isPost, icon, label, colors, styles, onPress, showDot }) {
  const pressScale = useRef(new Animated.Value(1)).current;
  const iconScale = useRef(new Animated.Value(1)).current;
  const indicator = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(indicator, {
      toValue: isFocused ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
    if (isFocused) bounce(iconScale);
  }, [isFocused, iconScale, indicator]);

  const pressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.88,
      useNativeDriver: true,
      tension: 400,
      friction: 12,
    }).start();
  };

  const pressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  const handlePress = () => {
    if (isFocused) bounce(iconScale);
    onPress();
  };

  if (isPost) {
    return (
      <Pressable onPress={handlePress} onPressIn={pressIn} onPressOut={pressOut} style={styles.item}>
        <Animated.View
          style={[
            styles.sellButton,
            {
              backgroundColor: colors.primary,
              shadowColor: colors.glow,
              transform: [{ scale: Animated.multiply(pressScale, iconScale) }],
            },
          ]}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </Animated.View>
        <Text style={[styles.label, isFocused && styles.labelActive]}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={handlePress} onPressIn={pressIn} onPressOut={pressOut} style={styles.item}>
      <Animated.View style={[styles.iconWrap, { transform: [{ scale: pressScale }] }]}>
        <Animated.View style={{ transform: [{ scale: iconScale }] }}>
          <Ionicons
            name={isFocused ? icon.filled : icon.outline}
            size={22}
            color={isFocused ? colors.link : colors.tabBarInactive}
          />
          {showDot ? <View style={styles.dot} /> : null}
        </Animated.View>
        <Animated.View
          style={[
            styles.activeDot,
            {
              backgroundColor: colors.link,
              opacity: indicator,
              transform: [
                {
                  scale: indicator.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.4, 1],
                  }),
                },
              ],
            },
          ]}
        />
      </Animated.View>
      <Text style={[styles.label, isFocused && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (colors) => ({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.tabBarBackground,
    borderTopWidth: 1,
    borderTopColor: colors.tabBarBorder,
    paddingTop: 8,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  iconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -22,
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  label: {
    fontSize: 11,
    color: colors.tabBarInactive,
  },
  labelActive: {
    color: colors.link,
    fontWeight: '700',
  },
  dot: {
    position: 'absolute',
    top: -1,
    right: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.badge,
  },
  activeDot: {
    position: 'absolute',
    bottom: -5,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});

export default function BottomTabBar({ state, descriptors, navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  if (!state?.routes) {
    return null;
  }

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {(state.routes || []).map((route, index) => {
        const isFocused = state.index === index;
        const { options } = descriptors[route.key];
        const label = options.title || route.name;
        const icon = ICONS[route.name] || { outline: 'ellipse-outline', filled: 'ellipse' };

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TabItem
            key={route.key}
            isFocused={isFocused}
            isPost={route.name === 'Post'}
            icon={icon}
            label={label}
            colors={colors}
            styles={styles}
            showDot={route.name === 'Chats'}
            onPress={onPress}
          />
        );
      })}
    </View>
  );
}
