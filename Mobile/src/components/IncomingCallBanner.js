import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from './Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { declineIncomingCall } from '../services/callNotifications';
import { resolveMediaUrl } from '../utils/listing';
import { callHaptic } from '../services/callHaptics';
import {
  dismissNativeIncomingCall,
  hideIncomingCallBanner,
  subscribeIncomingBanner,
} from '../services/CallKeepManager';

export default function IncomingCallBanner() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [call, setCall] = useState(null);

  useEffect(() => subscribeIncomingBanner(setCall), []);

  if (!call) return null;

  const initial = call.callerName?.charAt(0)?.toUpperCase() || 'K';

  const decline = () => {
    const chatId = call.chatId;
    hideIncomingCallBanner();
    callHaptic('decline');
    dismissNativeIncomingCall(chatId);
    declineIncomingCall(chatId);
  };

  const accept = () => {
    const next = call;
    hideIncomingCallBanner({ keepLock: true });
    callHaptic('answer');
    navigation.navigate('Call', {
      chatId: next.chatId,
      name: next.callerName,
      image: next.callerImage || undefined,
      incoming: true,
      autoAnswer: true,
    });
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 8 }]}>
      <View style={styles.card}>
        <View style={styles.identity}>
          {call.callerImage ? (
            <Image source={{ uri: resolveMediaUrl(call.callerImage) }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarLetter}>{initial}</Text>
            </View>
          )}
          <View style={styles.copy}>
            <Text numberOfLines={1} style={styles.name}>
              {call.callerName || 'KinBech user'}
            </Text>
            <Text style={styles.subtitle}>Incoming voice call</Text>
          </View>
        </View>
        <View style={styles.actions}>
          <Pressable onPress={decline} style={[styles.action, styles.decline]} accessibilityLabel="Decline">
            <Icon name="call" size={22} color="#FFFFFF" style={styles.declineIcon} />
          </Pressable>
          <Pressable onPress={accept} style={[styles.action, styles.accept]} accessibilityLabel="Accept">
            <Icon name="call" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 40,
    elevation: 40,
  },
  card: {
    backgroundColor: '#1F2C34',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  identity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#005C4B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  copy: {
    flex: 1,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    color: '#8696A0',
    fontSize: 13,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  action: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  decline: {
    backgroundColor: '#EF4444',
  },
  declineIcon: {
    transform: [{ rotate: '135deg' }],
  },
  accept: {
    backgroundColor: '#22C55E',
  },
});
