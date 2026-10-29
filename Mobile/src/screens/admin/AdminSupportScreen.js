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
  MetaChip,
  MetaRow,
  StatusPill,
  showAdminError,
  useAdminList,
  useDebouncedValue,
  usePrompt,
} from '../../components/admin/AdminKit';
import { Pulse } from '../../components/Motion';
import { api } from '../../services/api';
import { useAdminStyles as useThemedStyles, useAdminTheme as useTheme } from '../../components/admin/adminTheme';
import { formatDateTime, timeAgo, waitingFor } from '../../utils/admin';

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
        <Pulse active={item.status === 'open'} to={1.1} pause={2200} style={styles.icon}>
          <Icon name="chatbubble-ellipses" size={16} color={colors.info} />
        </Pulse>
        <View style={styles.flex1}>
          <Text style={styles.subject} numberOfLines={2}>{item.subject || 'Support request'}</Text>
          <View style={styles.timeRow}>
            <Icon name="time-outline" size={11} color={colors.textMuted} />
            <Text style={styles.meta}>
              {timeAgo(item.createdAt)}
              {item.status === 'open' ? ` · waiting ${waitingFor(item.createdAt)}` : ''}
            </Text>
          </View>
        </View>
        <StatusPill status={item.status} />
      </View>

      <MetaRow>
        {item.name ? <MetaChip icon="person" label={item.name} /> : null}
        {item.phone ? <MetaChip icon="call" tone="info" label={item.phone} /> : null}
        <MetaChip icon="calendar" label={formatDateTime(item.createdAt)} />
      </MetaRow>

      <Text style={styles.message} selectable>{item.message}</Text>

      {item.reply ? (
        <View style={styles.replyBox}>
          <View style={styles.replyHead}>
            <Icon name="return-down-forward" size={12} color={colors.success} />
            <Text style={styles.replyLabel}>Your reply{item.repliedAt ? ` · ${timeAgo(item.repliedAt)}` : ''}</Text>
          </View>
          <Text style={styles.replyText}>{item.reply}</Text>
        </View>
      ) : null}
      {item.adminNote ? (
        <View style={styles.noteRow}>
          <Icon name="create-outline" size={12} color={colors.textTertiary} />
          <Text style={styles.note}>{item.adminNote}</Text>
        </View>
      ) : null}

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
            <AdminHeader icon="headset" title="Support" subtitle="Help requests from users" onBack={() => navigation.goBack()} />
            <AdminSearch value={query} onChangeText={setQuery} placeholder="Search name, phone or subject" />
            <AdminChips
              options={[
                { value: 'open', label: 'Open', icon: 'mail', count: counts.open },
                { value: 'resolved', label: 'Resolved', icon: 'checkmark-circle', count: counts.resolved },
                { value: '', label: 'All', icon: 'apps' },
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
  container: { flex: 1, backgroundColor: colors.background, experimental_backgroundImage: colors.canvas },
  flex1: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pastelBlue, boxShadow: colors.clayTint },
  subject: { fontSize: 14, fontWeight: '800', color: colors.text },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  meta: { fontSize: 10.5, fontWeight: '700', color: colors.textMuted },
  message: { marginTop: 9, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  replyBox: { marginTop: 10, padding: 10, borderRadius: 14, backgroundColor: colors.pastelGreen, boxShadow: colors.clayTint },
  replyHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  replyLabel: { fontSize: 11, fontWeight: '800', color: colors.success },
  replyText: { marginTop: 3, fontSize: 12.5, lineHeight: 17, color: colors.textSecondary },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 8 },
  note: { flex: 1, fontSize: 12, fontStyle: 'italic', color: colors.textTertiary },
});
