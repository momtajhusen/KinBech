import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import Icon from './Icon';

const CHOICES = [
  {
    id: 'messages',
    icon: 'chatbubble-ellipses-outline',
    title: 'Block messages',
    body: 'No texts or voice messages from them. They can still call.',
    flags: { messages: true, calls: false },
  },
  {
    id: 'calls',
    icon: 'call-outline',
    title: 'Block calls',
    body: 'Their calls will not ring your phone. They can still message.',
    flags: { messages: false, calls: true },
  },
  {
    id: 'both',
    icon: 'ban',
    title: 'Block messages & calls',
    body: 'Stop all contact from this person in KinBech.',
    flags: { messages: true, calls: true },
  },
];

function choiceFor(block) {
  if (block?.messages && block?.calls) return 'both';
  if (block?.messages) return 'messages';
  if (block?.calls) return 'calls';
  return 'both';
}

export function blockSummary(block) {
  if (block?.messages && block?.calls) return 'Messages & calls blocked';
  if (block?.messages) return 'Messages blocked';
  if (block?.calls) return 'Calls blocked';
  return '';
}

export default function ChatBlockSheet({
  visible,
  startMode = 'menu',
  name,
  block,
  busy,
  bottomInset = 16,
  onClose,
  onApply,
  onUnblock,
  onReport,
}) {
  const [mode, setMode] = useState(startMode);
  const [choice, setChoice] = useState(choiceFor(block));
  const isBlocked = Boolean(block?.messages || block?.calls);
  const shownName = name || 'this person';

  useEffect(() => {
    if (!visible) return;
    setMode(startMode);
    setChoice(choiceFor(block));
  }, [visible, startMode, block]);

  const selected = CHOICES.find((item) => item.id === choice) || CHOICES[2];
  const unchanged =
    isBlocked && Boolean(block?.messages) === selected.flags.messages && Boolean(block?.calls) === selected.flags.calls;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: Math.max(bottomInset, 16) }]} onPress={() => {}}>
          <View style={styles.handle} />
          {mode === 'menu' ? (
            <>
              <Text style={styles.sheetTitle} numberOfLines={1}>{shownName}</Text>
              {isBlocked ? <Text style={styles.status}>{blockSummary(block)}</Text> : null}
              <Pressable style={styles.row} onPress={() => setMode('block')}>
                <View style={[styles.rowIcon, styles.rowIconDanger]}>
                  <Icon name="ban" size={18} color="#F87171" />
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{isBlocked ? 'Manage block' : 'Block'}</Text>
                  <Text style={styles.rowBody}>Stop their messages, calls, or both</Text>
                </View>
                <Icon name="chevron-forward" size={18} color="#8696A0" />
              </Pressable>
              <Pressable style={styles.row} onPress={onReport}>
                <View style={styles.rowIcon}>
                  <Icon name="flag-outline" size={18} color="#E9EDEF" />
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>Report</Text>
                  <Text style={styles.rowBody}>Tell KinBech about scams or harassment</Text>
                </View>
                <Icon name="chevron-forward" size={18} color="#8696A0" />
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.sheetTitle} numberOfLines={1}>
                {isBlocked ? `Manage block for ${shownName}` : `Block ${shownName}?`}
              </Text>
              <Text style={styles.sheetBody}>
                Choose what to stop. If {shownName} tries to message or call you, they will see that you blocked them.
              </Text>

              {CHOICES.map((item) => {
                const active = item.id === choice;
                return (
                  <Pressable
                    key={item.id}
                    style={[styles.choice, active && styles.choiceActive]}
                    onPress={() => setChoice(item.id)}
                    disabled={busy}
                  >
                    <View style={[styles.rowIcon, active && styles.rowIconDanger]}>
                      <Icon name={item.icon} size={18} color={active ? '#F87171' : '#E9EDEF'} />
                    </View>
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle}>{item.title}</Text>
                      <Text style={styles.rowBody}>{item.body}</Text>
                    </View>
                    <View style={[styles.radio, active && styles.radioActive]}>
                      {active ? <View style={styles.radioDot} /> : null}
                    </View>
                  </Pressable>
                );
              })}

              <Pressable
                style={[styles.primary, (busy || unchanged) && styles.disabled]}
                disabled={busy || unchanged}
                onPress={() => onApply(selected.flags)}
              >
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryText}>{isBlocked ? 'Update block' : selected.title}</Text>
                )}
              </Pressable>
              {isBlocked ? (
                <Pressable style={styles.secondary} disabled={busy} onPress={onUnblock}>
                  <Text style={styles.secondaryText}>Unblock {shownName}</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.secondary} disabled={busy} onPress={onClose}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
              )}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = {
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#233138',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(233,237,239,0.25)',
    marginBottom: 12,
  },
  sheetTitle: {
    color: '#E9EDEF',
    fontSize: 18,
    fontWeight: '800',
    paddingHorizontal: 2,
  },
  sheetBody: {
    color: '#8696A0',
    fontSize: 13.5,
    lineHeight: 19,
    marginTop: 4,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  status: {
    color: '#F87171',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
    paddingHorizontal: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    marginTop: 6,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(233,237,239,0.08)',
  },
  rowIconDanger: {
    backgroundColor: 'rgba(248,113,113,0.14)',
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    color: '#E9EDEF',
    fontSize: 15.5,
    fontWeight: '700',
  },
  rowBody: {
    color: '#8696A0',
    fontSize: 13,
    lineHeight: 18,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(233,237,239,0.08)',
    backgroundColor: 'rgba(11,20,26,0.35)',
  },
  choiceActive: {
    borderColor: 'rgba(248,113,113,0.6)',
    backgroundColor: 'rgba(248,113,113,0.08)',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#8696A0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: '#F87171',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F87171',
  },
  primary: {
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    marginTop: 8,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  disabled: {
    opacity: 0.5,
  },
  secondary: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  secondaryText: {
    color: '#00A884',
    fontSize: 15.5,
    fontWeight: '800',
  },
  cancelText: {
    color: '#8696A0',
    fontSize: 15.5,
    fontWeight: '700',
  },
};
