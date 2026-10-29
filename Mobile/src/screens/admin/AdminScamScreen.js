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
  StatusPill,
  showAdminError,
  useAdminList,
  useDebouncedValue,
  usePrompt,
} from '../../components/admin/AdminKit';
import { api } from '../../services/api';
import { useTheme, useThemedStyles } from '../../theme';
import { formatDateTime, formatNpr, titleCase } from '../../utils/admin';

const FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'actioned', label: 'Actioned' },
  { value: 'dismissed', label: 'False alarm' },
  { value: 'all', label: 'All' },
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
          <View style={styles.icon}>
            <Icon name="warning" size={16} color={colors.error} />
          </View>
          <View style={styles.flex1}>
            <Text
              style={styles.sender}
              numberOfLines={1}
              onPress={sender.id ? () => navigation.navigate('AdminUserDetail', { userId: sender.id, name: sender.name }) : undefined}
            >
              {sender.name || 'Unknown'} <Text style={styles.arrow}>→ {item.recipient?.name || 'someone'}</Text>
            </Text>
            <Text style={styles.time}>{formatDateTime(item.createdAt)}</Text>
          </View>
          <StatusPill status={reviewed === 'actioned' ? 'resolved' : reviewed === 'dismissed' ? 'dismissed' : 'pending'} label={reviewed ? titleCase(reviewed) : 'Open'} />
        </View>

        <View style={styles.bubble}>
          <Text style={styles.message} selectable>{item.text || '(no text)'}</Text>
        </View>

        {item.matches?.length ? (
          <View style={styles.matches}>
            {item.matches.slice(0, 5).map((m) => (
              <View key={m.category} style={styles.match}>
                <Text style={styles.matchText}>
                  {titleCase(m.category)}{m.phrases?.length ? `: ${m.phrases.slice(0, 3).join(', ')}` : ''}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.meta} numberOfLines={1}>
          {[
            item.listing ? `${item.listing.title} · ${formatNpr(item.listing.price)}` : '',
            sender.strikes ? `${sender.strikes} strike${sender.strikes === 1 ? '' : 's'}` : '',
            sender.chatRestricted ? 'Chat restricted' : '',
          ].filter(Boolean).join(' · ')}
        </Text>
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
  container: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pastelRed },
  sender: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  arrow: { fontWeight: '600', color: colors.textTertiary },
  time: { marginTop: 1, fontSize: 11.5, color: colors.textMuted },
  bubble: { marginTop: 10, padding: 12, borderRadius: 14, borderTopLeftRadius: 4, backgroundColor: colors.surfaceMuted },
  message: { fontSize: 14, lineHeight: 20, color: colors.text },
  matches: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  match: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.pastelRed },
  matchText: { fontSize: 11.5, fontWeight: '700', color: colors.error },
  meta: { marginTop: 8, fontSize: 12, color: colors.textTertiary },
  note: { marginTop: 4, fontSize: 12, fontStyle: 'italic', color: colors.textTertiary },
});
