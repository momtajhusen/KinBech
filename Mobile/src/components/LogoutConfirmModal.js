import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, Text, View } from 'react-native';
import { useTheme, useThemedStyles } from '../theme';

const createStyles = (colors) => ({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.58)',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 16,
  },
  iconRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 21,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 22,
    paddingHorizontal: 4,
  },
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: colors.iconBackground,
    marginBottom: 20,
  },
  userName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  buttons: {
    width: '100%',
    gap: 10,
  },
  logoutBtn: {
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  cancelBtn: {
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.iconBackground,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
});

export default function LogoutConfirmModal({ visible, onCancel, onConfirm, userName }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={onCancel} />
        <View style={styles.card}>
          <View style={styles.iconRing}>
            <View style={styles.iconInner}>
              <Ionicons name="log-out-outline" size={28} color="#fff" />
            </View>
          </View>
          <Text style={styles.title}>Log out of KinBech?</Text>
          <Text style={styles.message}>
            You will need to sign in again with your phone number to see chats, listings, and saved items.
          </Text>
          {userName ? (
            <View style={styles.userChip}>
              <Ionicons name="person-circle-outline" size={18} color={colors.primary} />
              <Text style={styles.userName}>{userName}</Text>
            </View>
          ) : null}
          <View style={styles.buttons}>
            <Pressable style={styles.logoutBtn} onPress={onConfirm}>
              <Ionicons name="log-out-outline" size={18} color="#fff" />
              <Text style={styles.logoutText}>Log Out</Text>
            </Pressable>
            <Pressable style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>Stay signed in</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
