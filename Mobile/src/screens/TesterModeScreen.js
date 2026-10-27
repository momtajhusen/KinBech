import { useCallback, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../navigation/helpers';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

const TINT = '#7C3AED';

const CHANGES = [
  {
    icon: 'eye-off-outline',
    title: 'Your posts are hidden from the public',
    sub: 'Your listings and shop show only to other testers. Real buyers on KinBech cannot see them.',
  },
  {
    icon: 'storefront-outline',
    title: 'You see the test marketplace',
    sub: 'Home, search, shops and sellers show only test items posted by testers.',
  },
  {
    icon: 'chatbubbles-outline',
    title: 'Chats and calls with testers only',
    sub: 'You can message and call other testers. Public users cannot reach you.',
  },
  {
    icon: 'card-outline',
    title: 'Plan payments are test payments',
    sub: 'When the team runs eSewa in test mode, you pay with test eSewa accounts and no real money moves.',
  },
  {
    icon: 'star-outline',
    title: 'Reviews and reports stay in the test',
    sub: 'Anything you rate or report here never touches real sellers.',
  },
];

const FLOW = [
  { title: 'The KinBech team turned it on', sub: 'Only the team can switch Tester mode on or off.' },
  { title: 'Your earlier listings go quiet', sub: 'Posts from before testing are hidden from the public, not deleted.' },
  { title: 'Test everything freely', sub: 'Post, chat, call, pay and review. Nothing reaches real users.' },
  {
    title: 'When testing ends',
    sub: 'Your earlier listings come back. Everything made during testing (posts, shops, chats, reviews) is deleted.',
  },
];

const sinceLabel = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('en-NP', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_) {
    return '';
  }
};

export default function TesterModeScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const refreshUserRef = useRef(refreshUser);
  refreshUserRef.current = refreshUser;
  const on = Boolean(user?.isTester);

  useFocusEffect(
    useCallback(() => {
      Promise.resolve(refreshUserRef.current?.()).catch(() => {});
    }, [])
  );

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.navBtn}>
          <Icon name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Tester mode</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={on ? ['#4C1D95', TINT, '#A855F7'] : [colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroCircle} pointerEvents="none" />
          <View style={styles.heroIcon}>
            <Icon name={on ? 'flask' : 'globe-outline'} size={26} color={on ? TINT : colors.gradientStart} />
          </View>
          <Text style={styles.heroTitle}>{on ? 'Your account is in Tester mode' : 'Your account is public'}</Text>
          <Text style={styles.heroSub}>
            {on
              ? `${user?.testerSince ? `On since ${sinceLabel(user.testerSince)}. ` : ''}You are using a private copy of KinBech made for testing.`
              : 'Tester mode is off. Buyers can see your posts and reach you as usual.'}
          </Text>
          {on ? (
            <View style={styles.heroPill}>
              <View style={styles.heroDot} />
              <Text style={styles.heroPillText}>Test sandbox active</Text>
            </View>
          ) : null}
        </LinearGradient>

        {on ? (
          <>
            <Text style={styles.sectionTitle}>What changes for you</Text>
            <View style={styles.card}>
              {CHANGES.map((item, index) => (
                <View key={item.title} style={[styles.change, index > 0 && styles.changeLine]}>
                  <View style={styles.changeIcon}>
                    <Icon name={item.icon} size={18} color={TINT} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.changeTitle}>{item.title}</Text>
                    <Text style={styles.changeSub}>{item.sub}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Text style={styles.sectionTitle}>How it works</Text>
            <View style={styles.card}>
              {FLOW.map((step, index) => (
                <View key={step.title} style={styles.step}>
                  <View style={styles.stepRail}>
                    <View style={[styles.stepNum, index === FLOW.length - 1 && styles.stepNumLast]}>
                      <Text style={styles.stepNumText}>{index + 1}</Text>
                    </View>
                    {index < FLOW.length - 1 ? <View style={styles.stepLine} /> : null}
                  </View>
                  <View style={styles.stepBody}>
                    <Text style={styles.changeTitle}>{step.title}</Text>
                    <Text style={styles.changeSub}>{step.sub}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.warn}>
              <Icon name="warning-outline" size={18} color={colors.warning} />
              <Text style={styles.warnText}>
                Do not post real items to sell while testing. Real buyers cannot see them, and test posts are deleted
                when Tester mode ends.
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.card}>
            <View style={styles.change}>
              <View style={[styles.changeIcon, { backgroundColor: colors.glow }]}>
                <Icon name="checkmark-circle-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.changeTitle}>Nothing to do</Text>
                <Text style={styles.changeSub}>
                  If you were testing before, your earlier listings are public again and test posts and chats were removed.
                </Text>
              </View>
            </View>
          </View>
        )}

        <Pressable onPress={() => navigation.navigate(ROUTES.CONTACT_US)} style={({ pressed }) => [styles.help, pressed && { opacity: 0.8 }]}>
          <Icon name="chatbubbles-outline" size={17} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.helpTitle}>{on ? 'Want to leave Tester mode?' : 'Questions?'}</Text>
            <Text style={styles.changeSub}>Only the KinBech team can change it. Message support.</Text>
          </View>
          <Icon name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: colors.background },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  content: { paddingHorizontal: 16, paddingTop: 6, gap: 14 },
  hero: { borderRadius: 24, padding: 20, overflow: 'hidden', alignItems: 'flex-start' },
  heroCircle: { position: 'absolute', width: 220, height: 220, borderRadius: 110, top: -90, right: -70, backgroundColor: 'rgba(255,255,255,0.09)' },
  heroIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  heroTitle: { marginTop: 14, fontSize: 22, fontWeight: '900', color: '#FFFFFF' },
  heroSub: { marginTop: 4, fontSize: 13, lineHeight: 19, color: 'rgba(255,255,255,0.88)' },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  heroDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ADE80' },
  heroPillText: { fontSize: 11.5, fontWeight: '800', color: '#FFFFFF' },
  sectionTitle: { marginTop: 4, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textMuted },
  card: { paddingHorizontal: 14, paddingVertical: 4, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  change: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  changeLine: { borderTopWidth: 1, borderTopColor: colors.border },
  changeIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: `${TINT}17` },
  changeTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  changeSub: { marginTop: 2, fontSize: 12.5, lineHeight: 18, color: colors.textMuted },
  step: { flexDirection: 'row', gap: 12 },
  stepRail: { alignItems: 'center', paddingTop: 12 },
  stepNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: TINT },
  stepNumLast: { backgroundColor: colors.warning },
  stepNumText: { fontSize: 12, fontWeight: '900', color: '#FFFFFF' },
  stepLine: { flex: 1, width: 2, marginTop: 4, backgroundColor: `${TINT}33` },
  stepBody: { flex: 1, paddingVertical: 12 },
  warn: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: `${colors.warning}55`,
    backgroundColor: `${colors.warning}12`,
  },
  warnText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.text },
  help: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  helpTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
});
