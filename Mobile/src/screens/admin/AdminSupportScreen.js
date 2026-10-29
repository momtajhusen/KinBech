import { useCallback, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import Icon from '../../components/Icon';
import {
  AdminActions,
  AdminCard,
  AdminChips,
  AdminHeader,
  AdminList,
  AdminSearch,
  StatusPill,
  showAdminError,
  useAdminList,
  useDebouncedValue,
  usePrompt,
} from '../../components/admin/AdminKit';
import { api } from '../../services/api';
import { useTheme, useThemedStyles } from '../../theme';
import { formatDateTime } from '../../utils/admin';

export default function AdminSupportScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [status, setStatus] = useState('open');
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim(), 350);
  const [prompt, ask] = usePrompt();

  const load = useCallback(async (page) => {
    const { data, error } = await api.adminSupportTickets({ status, q, page });
    if (error) return { error };
    return {
      items: (data?.tickets || []).map((t) => ({ ...t, id: String(t.id || t._id) })),
      total: data?.total,
      totalPages: data?.totalPages,
      extra: data?.counts || null,
    };
  }, [status, q]);

  const list = useAdminList(load, `${status}|${q}`);
  const counts = list.extra || {};

  const save = async (ticket, payload) => {
    const { data, error } = await api.adminUpdateTicket(ticket.id, payload);
    if (error) {
      showAdminError(error);
      return;
    }
    const next = { ...ticket, ...payload, ...(data?.ticket || {}) };
    if (status && next.status !== status) list.removeItem(ticket.id);
    else list.patchItem(ticket.id, next);
  };

  const reply = async (ticket) => {
    const text = await ask({
      title: `Reply to ${ticket.name || 'user'}`,
      message: 'The user sees this reply in the app.',
      placeholder: 'Write your reply',
      initial: ticket.reply || '',
      required: true,
      confirmText: 'Send & resolve',
      maxLength: 1000,
    });
    if (text === null) return;
    await save(ticket, { reply: text, status: 'resolved' });
  };

  const note = async (ticket) => {
    const text = await ask({
      title: 'Internal note',
      message: 'Only admins see this.',
      placeholder: 'Add a note',
      initial: ticket.adminNote || '',
      confirmText: 'Save note',
      maxLength: 1000,
    });
    if (text === null) return;
    await save(ticket, { adminNote: text });
  };

  const renderItem = ({ item }) => (
    <AdminCard>
      <View style={styles.row}>
        <View style={styles.icon}>
          <Icon name="chatbubble-ellipses" size={18} color={colors.info} />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.subject} numberOfLines={2}>{item.subject || 'Support request'}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {[item.name, item.phone, formatDateTime(item.createdAt)].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <StatusPill status={item.status} />
      </View>

      <Text style={styles.message} selectable>{item.message}</Text>

      {item.reply ? (
        <View style={styles.replyBox}>
          <Text style={styles.replyLabel}>Your reply{item.repliedAt ? ` · ${formatDateTime(item.repliedAt)}` : ''}</Text>
          <Text style={styles.replyText}>{item.reply}</Text>
        </View>
      ) : null}
      {item.adminNote ? <Text style={styles.note}>Note: {item.adminNote}</Text> : null}

      <AdminActions
        actions={[
          { label: item.reply ? 'Edit reply' : 'Reply', icon: 'send', tone: 'success', solid: !item.reply, onPress: () => reply(item) },
          item.phone && {
            label: 'Call',
            icon: 'call',
            tone: 'info',
            onPress: () => Linking.openURL(`tel:${String(item.phone).replace(/\s+/g, '')}`),
          },
          { label: 'Note', icon: 'create', tone: 'muted', onPress: () => note(item) },
          item.status === 'open'
            ? { label: 'Resolve', icon: 'checkmark-done', tone: 'success', onPress: () => save(item, { status: 'resolved' }) }
            : { label: 'Reopen', icon: 'refresh', tone: 'warning', onPress: () => save(item, { status: 'open' }) },
        ]}
      />
    </AdminCard>
  );

  return (
    <View style={styles.container}>
      <AdminList
        list={list}
        renderItem={renderItem}
        emptyIcon="headset"
        emptyTitle={status === 'open' ? 'No open tickets' : 'No tickets here'}
        emptyBody="Messages users send from Help & Support show up here."
        header={
          <>
            <AdminHeader title="Support" subtitle="Help requests from users" onBack={() => navigation.goBack()} />
            <AdminSearch value={query} onChangeText={setQuery} placeholder="Search name, phone or subject" />
            <AdminChips
              options={[
                { value: 'open', label: 'Open', count: counts.open },
                { value: 'resolved', label: 'Resolved', count: counts.resolved },
                { value: '', label: 'All' },
              ]}
              value={status}
              onChange={setStatus}
            />
          </>
        }
      />
      {prompt}
    </View>
  );
}

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pastelBlue },
  subject: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  meta: { marginTop: 1, fontSize: 11.5, color: colors.textMuted },
  message: { marginTop: 10, fontSize: 13.5, lineHeight: 19, color: colors.textSecondary },
  replyBox: { marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: colors.pastelGreen },
  replyLabel: { fontSize: 11.5, fontWeight: '700', color: colors.success },
  replyText: { marginTop: 3, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  note: { marginTop: 8, fontSize: 12.5, fontStyle: 'italic', color: colors.textTertiary },
});
