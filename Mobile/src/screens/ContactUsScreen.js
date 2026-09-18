import { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import GradientButton from '../components/GradientButton';
import { AlertModal, showErrorAlert, showSuccessAlert } from '../components/AlertModal';
import { api } from '../services/api';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

const SUBJECTS = ['Account help', 'Listing issue', 'Payment / meetup', 'Report a bug', 'Other'];

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
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.pastelIndigo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  contactSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.iconBackground,
  },
  chipActive: { backgroundColor: colors.pastelIndigo, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.text },
  input: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.inputBackground,
  },
  ticket: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  ticketSubject: { fontSize: 14, fontWeight: '700', color: colors.text },
  ticketMeta: { fontSize: 12, color: colors.textMuted },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 4,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
});

export default function ContactUsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [alertConfig, setAlertConfig] = useState(null);

  const load = useCallback(async () => {
    const { data } = await api.getSupportTickets();
    setTickets(Array.isArray(data?.tickets) ? data.tickets : []);
  }, []);

  const { refreshing, onRefresh } = usePullRefresh(load);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const send = async () => {
    if (!message.trim()) {
      setAlertConfig(
        showErrorAlert({
          title: 'Message required',
          message: 'Tell us what you need help with.',
          onConfirm: () => setAlertConfig(null),
        })
      );
      return;
    }
    setSending(true);
    const { data, error } = await api.createSupportTicket({
      subject,
      message: message.trim(),
    });
    setSending(false);
    if (error) {
      setAlertConfig(
        showErrorAlert({
          title: 'Could not send',
          message: error,
          onConfirm: () => setAlertConfig(null),
        })
      );
      return;
    }
    setMessage('');
    await load();
    setAlertConfig(
      showSuccessAlert({
        title: 'Request sent',
        message: data?.message || 'Our team will follow up on your registered phone or in-app notifications.',
        onConfirm: () => setAlertConfig(null),
      })
    );
  };

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
        <Text style={styles.headerTitle}>Contact Us</Text>
        <View style={{ width: 24 }} />
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 56 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl(colors, refreshing, onRefresh)}
        >
          <View style={styles.card}>
            <View style={styles.contactRow}>
              <View style={styles.iconCircle}>
                <Ionicons name="mail-outline" size={18} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.contactTitle}>support@kinbech.app</Text>
                <Text style={styles.contactSub}>Email for account and listing help</Text>
              </View>
            </View>
            <View style={styles.contactRow}>
              <View style={styles.iconCircle}>
                <Ionicons name="call-outline" size={18} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.contactTitle}>+977-1-5900000</Text>
                <Text style={styles.contactSub}>Weekdays 10:00–18:00 NST</Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Topic</Text>
            <View style={styles.chips}>
              {SUBJECTS.map((item) => (
                <Pressable
                  key={item}
                  style={[styles.chip, subject === item && styles.chipActive]}
                  onPress={() => setSubject(item)}
                >
                  <Text style={styles.chipText}>{item}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>Message</Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Describe the issue. Include listing title or seller name if relevant."
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { minHeight: 120, textAlignVertical: 'top' }]}
              multiline
            />
            <GradientButton
              title={sending ? 'Sending…' : 'Send to support'}
              icon="send"
              disabled={sending}
              onPress={send}
            />
            {sending ? <ActivityIndicator color={colors.primary} /> : null}
          </View>

          {tickets.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.contactTitle}>Your recent requests</Text>
              {tickets.map((ticket) => (
                <View key={ticket.id} style={styles.ticket}>
                  <Text style={styles.ticketSubject}>{ticket.subject}</Text>
                  <Text style={styles.ticketMeta} numberOfLines={2}>
                    {ticket.message}
                  </Text>
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor:
                          ticket.status === 'resolved' ? colors.pastelLime : colors.pastelCyan,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        {
                          color:
                            ticket.status === 'resolved' ? colors.statusActive : colors.info,
                        },
                      ]}
                    >
                      {ticket.status === 'resolved' ? 'Resolved' : 'Open'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <AlertModal
        visible={!!alertConfig}
        onClose={() => setAlertConfig(null)}
        {...(alertConfig || {})}
      />
    </SafeAreaView>
  );
}
