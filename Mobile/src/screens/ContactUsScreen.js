import { useCallback, useState } from 'react';
import Icon from '../components/Icon';
import { Linking, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import GradientButton from '../components/GradientButton';
import { FormScroll } from '../components/FormScroll';
import HeroHeader, { HeroStat } from '../components/HeroHeader';
import { EditField } from '../components/ProfileEditKit';
import { PressableScale, Reanimated, enterUp } from '../components/Motion';
import { AlertModal, showErrorAlert, showSuccessAlert } from '../components/AlertModal';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { timeAgo } from '../utils/listing';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

const SUBJECTS = [
  { key: 'Account help', icon: 'person-circle-outline', tint: '#3B82F6' },
  { key: 'Listing issue', icon: 'pricetag-outline', tint: '#10B981' },
  { key: 'Payment / meetup', icon: 'cash-outline', tint: '#F59E0B' },
  { key: 'Report a bug', icon: 'bug-outline', tint: '#EF4444' },
  { key: 'Other', icon: 'ellipsis-horizontal-circle-outline', tint: '#8B5CF6' },
];

const MESSAGE_MAX = 1000;
const DEFAULT_EMAIL = 'support@kinbech.com';

function subjectMeta(key) {
  return SUBJECTS.find((s) => s.key === key) || SUBJECTS[SUBJECTS.length - 1];
}

export default function ContactUsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [subject, setSubject] = useState(SUBJECTS[0].key);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [supportEmail, setSupportEmail] = useState(DEFAULT_EMAIL);
  const [expanded, setExpanded] = useState(null);
  const [alertConfig, setAlertConfig] = useState(null);

  const closeAlert = () => setAlertConfig(null);

  const load = useCallback(async () => {
    const { data } = await api.getSupportTickets();
    setTickets(Array.isArray(data?.tickets) ? data.tickets : []);
    if (data?.supportEmail) setSupportEmail(data.supportEmail);
  }, []);

  const { refreshing, onRefresh } = usePullRefresh(load);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const emailUs = () => {
    Linking.openURL(`mailto:${supportEmail}?subject=${encodeURIComponent(`KinBech: ${subject}`)}`).catch(() => {
      setAlertConfig(
        showErrorAlert({
          title: 'No email app',
          message: `Write to us at ${supportEmail}, or send a ticket below.`,
          onConfirm: closeAlert,
        })
      );
    });
  };

  const send = async () => {
    if (message.trim().length < 10) {
      setAlertConfig(
        showErrorAlert({
          title: 'Tell us a bit more',
          message: 'Describe the problem in a sentence or two so we can help.',
          onConfirm: closeAlert,
        })
      );
      return;
    }
    setSending(true);
    const { data, error } = await api.createSupportTicket({ subject, message: message.trim() });
    setSending(false);
    if (error) {
      setAlertConfig(showErrorAlert({ title: 'Could not send', message: error, onConfirm: closeAlert }));
      return;
    }
    setMessage('');
    await load();
    setAlertConfig(
      showSuccessAlert({
        title: 'Request sent',
        message: data?.message || 'Our team will follow up on your registered phone or in-app notifications.',
        onConfirm: closeAlert,
      })
    );
  };

  const openCount = tickets.filter((t) => t.status !== 'resolved').length;
  const resolvedCount = tickets.length - openCount;

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right']}>
      <ThemeStatusBar variant="header" />
      <HeroHeader
        icon="chatbubbles"
        title="Contact Us"
        subtitle="Tell us what went wrong and our team will look into it."
        onBack={() => navigation.goBack()}
      >
        <View style={styles.statRow}>
          <HeroStat icon="time-outline" value={openCount} label="Open" />
          <HeroStat icon="checkmark-done-outline" value={resolvedCount} label="Resolved" />
          <HeroStat icon="receipt-outline" value={tickets.length} label="Tickets" />
        </View>
      </HeroHeader>

      <FormScroll
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 56 }]}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        <View style={styles.quickRow}>
          <PressableScale style={styles.flex1} contentStyle={styles.quickCard} onPress={() => navigation.navigate(ROUTES.HELP)}>
            <View style={[styles.quickIcon, { backgroundColor: colors.pastelGreen }]}>
              <Icon name="help-buoy-outline" size={20} color={colors.primary} />
            </View>
            <Text style={styles.quickTitle}>Help Center</Text>
            <Text style={styles.quickSub}>Quick answers to common questions</Text>
          </PressableScale>
          <PressableScale style={styles.flex1} contentStyle={styles.quickCard} onPress={emailUs}>
            <View style={[styles.quickIcon, { backgroundColor: colors.pastelBlue }]}>
              <Icon name="mail-outline" size={20} color={colors.info} />
            </View>
            <Text style={styles.quickTitle}>Email us</Text>
            <Text style={styles.quickSub} numberOfLines={1}>{supportEmail}</Text>
          </PressableScale>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.cardHeadIcon, { backgroundColor: `${subjectMeta(subject).tint}1F` }]}>
              <Icon name="create-outline" size={17} color={subjectMeta(subject).tint} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.cardTitle}>Send a ticket</Text>
              <Text style={styles.cardSub}>Pick a topic and describe the issue</Text>
            </View>
          </View>

          <View style={styles.topicGrid}>
            {SUBJECTS.map((item) => {
              const active = subject === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => setSubject(item.key)}
                  style={[styles.topic, active && { borderColor: item.tint, backgroundColor: `${item.tint}14` }]}
                >
                  <Icon name={item.icon} size={17} color={active ? item.tint : colors.textMuted} />
                  <Text style={[styles.topicText, active && { color: colors.text }]} numberOfLines={1}>
                    {item.key}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <EditField
            label="Message"
            icon="chatbox-ellipses-outline"
            value={message}
            onChangeText={setMessage}
            placeholder="What happened? Add the listing title or seller name if it helps."
            multiline
            maxLength={MESSAGE_MAX}
            hint="We reply in your notifications or on your registered phone."
          />

          <GradientButton title={sending ? 'Sending…' : 'Send to support'} icon="send" disabled={sending} onPress={send} />
        </View>

        <View style={styles.safetyCard}>
          <Icon name="warning-outline" size={18} color={colors.warning} />
          <Text style={styles.safetyText}>
            Someone asking for advance payment or your OTP? Report them from the chat ⋮ menu so we can act fast.
          </Text>
        </View>

        {tickets.length > 0 ? (
          <View style={styles.ticketsWrap}>
            <Text style={styles.sectionLabel}>Your requests</Text>
            {tickets.map((ticket, index) => {
              const meta = subjectMeta(ticket.subject);
              const resolved = ticket.status === 'resolved';
              const open = expanded === ticket.id;
              return (
                <Reanimated.View key={ticket.id} entering={enterUp(index)}>
                  <Pressable style={styles.ticket} onPress={() => setExpanded(open ? null : ticket.id)}>
                    <View style={[styles.ticketIcon, { backgroundColor: `${meta.tint}1F` }]}>
                      <Icon name={meta.icon} size={18} color={meta.tint} />
                    </View>
                    <View style={styles.flex1}>
                      <View style={styles.ticketTop}>
                        <Text style={styles.ticketSubject} numberOfLines={1}>{ticket.subject}</Text>
                        <View style={[styles.statusPill, { backgroundColor: resolved ? colors.pastelLime : colors.pastelOrange }]}>
                          <Icon
                            name={resolved ? 'checkmark-circle' : 'time'}
                            size={11}
                            color={resolved ? colors.success : colors.warning}
                          />
                          <Text style={[styles.statusText, { color: resolved ? colors.success : colors.warning }]}>
                            {resolved ? 'Resolved' : 'Open'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.ticketMessage} numberOfLines={open ? undefined : 2}>{ticket.message}</Text>
                      {ticket.reply ? (
                        <View style={styles.replyBox}>
                          <View style={styles.replyHead}>
                            <Icon name="chatbubble-ellipses" size={12} color={colors.primary} />
                            <Text style={styles.replyLabel}>KinBech support</Text>
                          </View>
                          <Text style={styles.replyText} numberOfLines={open ? undefined : 3}>{ticket.reply}</Text>
                        </View>
                      ) : null}
                      <Text style={styles.ticketDate}>{timeAgo(ticket.createdAt).replace(/^Posted /, '')}</Text>
                    </View>
                  </Pressable>
                </Reanimated.View>
              );
            })}
          </View>
        ) : null}
      </FormScroll>

      <AlertModal visible={!!alertConfig} onClose={closeAlert} {...(alertConfig || {})} />
    </SafeAreaView>
  );
}

const createStyles = (colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  statRow: { flexDirection: 'row', gap: 8 },
  content: { padding: 16, gap: 14 },
  quickRow: { flexDirection: 'row', gap: 10 },
  quickCard: {
    padding: 14,
    gap: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  quickIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  quickTitle: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  quickSub: { fontSize: 11.5, lineHeight: 15, color: colors.textMuted },
  card: {
    padding: 16,
    gap: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardHeadIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15.5, fontWeight: '900', color: colors.text },
  cardSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  topicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  topic: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  topicText: { fontSize: 12.5, fontWeight: '700', color: colors.textSecondary },
  safetyCard: {
    flexDirection: 'row',
    gap: 10,
    padding: 13,
    borderRadius: 16,
    backgroundColor: colors.pastelOrange,
  },
  safetyText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.textSecondary },
  ticketsWrap: { gap: 10 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  ticket: {
    flexDirection: 'row',
    gap: 12,
    padding: 13,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  ticketIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  ticketTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ticketSubject: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.text },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9,
  },
  statusText: { fontSize: 11, fontWeight: '800' },
  ticketMessage: { marginTop: 4, fontSize: 12.5, lineHeight: 18, color: colors.textSecondary },
  ticketDate: { marginTop: 6, fontSize: 11, fontWeight: '600', color: colors.textTertiary },
  replyBox: { marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: `${colors.primary}12`, borderLeftWidth: 3, borderLeftColor: colors.primary },
  replyHead: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  replyLabel: { fontSize: 11, fontWeight: '800', color: colors.primary },
  replyText: { fontSize: 12.5, lineHeight: 18, color: colors.text },
});
