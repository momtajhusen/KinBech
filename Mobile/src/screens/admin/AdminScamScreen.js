import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
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
import { formatDateTime, formatNpr, timeAgo, titleCase } from '../../utils/admin';

const FILTERS = [
  { value: 'open', label: 'Open', icon: 'warning' },
  { value: 'actioned', label: 'Actioned', icon: 'checkmark-circle' },
  { value: 'dismissed', label: 'False alarm', icon: 'close-circle' },
  { value: 'all', label: 'All', icon: 'apps' },
];

const ACTION_COPY = {
  warn: { title: 'Warn sender', confirm: 'Send warning', placeholder: 'e.g. Asking for advance payment outside KinBech' },
  restrict_chat: { title: 'Restrict sender chat', confirm: 'Restrict chat', placeholder: 'Reason (the user sees this)' },
  strike: { title: 'Add a strike', confirm: 'Add strike', placeholder: 'Reason for the strike' },
};

export default function AdminScamScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [status, setStatus] = useState('open');
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim(), 350);
  const [prompt, ask] = usePrompt();

  const load = useCallback(async (page) => {
    const { data, error } = await api.adminScamFlags({ status, q, days: 30, page, limit: 20 });
    if (error) return { error };
    return {
      items: data?.flags || [],
      total: data?.total,
      totalPages: data?.totalPages,
      extra: data?.summary || null,
    };
  }, [status, q]);

  const list = useAdminList(load, `${status}|${q}`);
  const summary = list.extra || {};

  const act = async (flag, action) => {
    const copy = ACTION_COPY[action];
    const answer = await ask({
      title: copy.title,
      message: `All open flags from ${flag.sender?.name || 'this sender'} are closed as actioned.`,
      placeholder: copy.placeholder,
      required: true,
      destructive: action !== 'warn',
      confirmText: copy.confirm,
      maxLength: 300,
      ...(action === 'restrict_chat'
        ? { choices: [1, 3, 7, 30].map((d) => ({ value: d, label: `${d} day${d === 1 ? '' : 's'}` })), choiceInitial: 3 }
        : {}),
    });
    if (answer === null) return;
    const reason = typeof answer === 'string' ? answer : answer.text;
    const { error } = await api.adminActOnScamFlag(flag.id, {
      action,
      reason,
      ...(action === 'restrict_chat' ? { days: answer.choice } : {}),
    });
    if (error) {
      showAdminError(error);
      return;
    }
    list.reload('refresh');
  };

  const review = async (flag, next) => {
    const { error } = await api.adminReviewScamFlag(flag.id, { status: next });
    if (error) {
      showAdminError(error);
      return;
    }
    if (status === 'all') list.patchItem(flag.id, { review: { ...flag.review, status: next } });
    else list.removeItem(flag.id);
  };

  const renderItem = ({ item }) => {
    const reviewed = item.review?.status;
    const sender = item.sender || {};
    return (
      <AdminCard>
        <View style={styles.head}>
          <Pulse active={!reviewed} to={1.12} style={styles.icon}>
            <Icon name="warning" size={16} color={colors.error} />
          </Pulse>
          <View style={styles.flex1}>
            <Text
              style={styles.sender}
              numberOfLines={1}
              onPress={sender.id ? () => navigation.navigate('AdminUserDetail', { userId: sender.id, name: sender.name }) : undefined}
            >
              {sender.name || 'Unknown'} <Text style={styles.arrow}>→ {item.recipient?.name || 'someone'}</Text>
            </Text>
            <View style={styles.timeRow}>
              <Icon name="time-outline" size={11} color={colors.textMuted} />
              <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
            </View>
          </View>
          <StatusPill status={reviewed === 'actioned' ? 'resolved' : reviewed === 'dismissed' ? 'dismissed' : 'pending'} label={reviewed ? titleCase(reviewed) : 'Open'} />
        </View>

        <View style={styles.bubble}>
          <Icon name="chatbubble-ellipses-outline" size={13} color={colors.textMuted} />
          <Text style={styles.message} selectable>{item.text || '(no text)'}</Text>
        </View>

        {item.matches?.length ? (
          <MetaRow>
            {item.matches.slice(0, 5).map((m) => (
              <MetaChip
                key={m.category}
                icon="alert-circle"
                tone="error"
                label={`${titleCase(m.category)}${m.phrases?.length ? `: ${m.phrases.slice(0, 3).join(', ')}` : ''}`}
              />
            ))}
          </MetaRow>
        ) : null}

        <MetaRow>
          {item.listing ? <MetaChip icon="pricetag" label={`${item.listing.title} · ${formatNpr(item.listing.price)}`} /> : null}
          {sender.strikes ? <MetaChip icon="warning" tone="warning" label={`${sender.strikes} strike${sender.strikes === 1 ? '' : 's'}`} /> : null}
          {sender.chatRestricted ? <MetaChip icon="lock-closed" tone="error" label="Chat restricted" /> : null}
          <MetaChip icon="calendar" label={formatDateTime(item.createdAt)} />
        </MetaRow>
        {item.review?.note ? <Text style={styles.note}>Note: {item.review.note}{item.review.by ? ` (${item.review.by})` : ''}</Text> : null}

        <AdminActions
          actions={
            reviewed
              ? [{ label: 'Reopen', icon: 'refresh', tone: 'warning', onPress: () => review(item, '') }]
              : [
                  { label: 'Warn', icon: 'notifications', tone: 'warning', solid: true, onPress: () => act(item, 'warn') },
                  { label: 'Restrict', icon: 'chatbubbles', tone: 'error', onPress: () => act(item, 'restrict_chat') },
                  { label: 'Strike', icon: 'ban', tone: 'error', onPress: () => act(item, 'strike') },
                  { label: 'False alarm', icon: 'checkmark', tone: 'muted', onPress: () => review(item, 'dismissed') },
                ]
          }
        />
      </AdminCard>
    );
  };

  return (
    <View style={styles.container}>
      <AdminList
        list={list}
        renderItem={renderItem}
        emptyIcon="shield-checkmark"
        emptyTitle={status === 'open' ? 'No open scam flags' : 'Nothing here'}
        emptyBody="Chat messages with scam words (advance payment, OTP, outside links) show up here."
        header={
          <>
            <AdminHeader
              icon="warning"
              title="Scam monitor"
              subtitle={`${summary.open ?? 0} open · ${summary.last24h ?? 0} in last 24h · last 30 days`}
              onBack={() => navigation.goBack()}
            />
            <AdminSearch value={query} onChangeText={setQuery} placeholder="Search sender name or phone" />
            <AdminChips options={FILTERS} value={status} onChange={setStatus} />
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
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pastelRed, boxShadow: colors.clayTint },
  sender: { fontSize: 14, fontWeight: '800', color: colors.text },
  arrow: { fontWeight: '600', color: colors.textTertiary },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  time: { fontSize: 10.5, fontWeight: '700', color: colors.textMuted },
  bubble: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 9,
    padding: 10,
    borderRadius: 16,
    borderTopLeftRadius: 6,
    backgroundColor: colors.backgroundSecondary,
    boxShadow: colors.clayPressed,
  },
  message: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.text },
  note: { marginTop: 6, fontSize: 12, fontStyle: 'italic', color: colors.textTertiary },
});
