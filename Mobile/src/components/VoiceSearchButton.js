import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, Text, View } from 'react-native';
import Icon from './Icon';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { useTheme } from '../theme';

let sessionOwner = 0;

function PulseRing({ delay, color }) {
  const scale = useSharedValue(0.72);
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(withTiming(1.7, { duration: 1500, easing: Easing.out(Easing.cubic) }), -1, false)
    );
    opacity.value = withDelay(
      delay,
      withRepeat(withTiming(0, { duration: 1500, easing: Easing.out(Easing.cubic) }), -1, false)
    );
    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, [delay, opacity, scale]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Reanimated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: 148,
          height: 148,
          borderRadius: 74,
          borderWidth: 2,
          borderColor: color,
        },
        style,
      ]}
    />
  );
}

function SpinRing({ color }) {
  const rotate = useSharedValue(0);

  useEffect(() => {
    rotate.value = withRepeat(withTiming(360, { duration: 800, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(rotate);
  }, [rotate]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value}deg` }],
  }));

  return (
    <Reanimated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          width: 34,
          height: 34,
          borderRadius: 17,
          borderWidth: 2.5,
          borderColor: 'transparent',
          borderTopColor: color,
          borderRightColor: color,
        },
        style,
      ]}
    />
  );
}

/**
 * Circular mic. Spins while the recognizer warms up, then opens the listening modal.
 * Calls `onResult(text, isFinal)`.
 */
export default function VoiceSearchButton({ onResult, color = '#6B7280', size = 18 }) {
  const { colors } = useTheme();
  const ownerRef = useRef(0);
  const langRef = useRef(0);
  const startTimerRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const [open, setOpen] = useState(false);
  const [heard, setHeard] = useState('');

  const clearStartTimer = () => {
    if (startTimerRef.current) {
      clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    }
  };

  useEffect(() => {
    ownerRef.current = Math.random();
    return () => {
      clearStartTimer();
      if (sessionOwner !== ownerRef.current) return;
      sessionOwner = 0;
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        /* module not in this build yet */
      }
    };
  }, []);

  const mine = () => sessionOwner === ownerRef.current;

  const closeModal = () => {
    clearStartTimer();
    setStarting(false);
    setOpen(false);
    setListening(false);
    setHeard('');
  };

  useSpeechRecognitionEvent('start', () => {
    if (!mine()) return;
    clearStartTimer();
    setStarting(false);
    setListening(true);
    setOpen(true);
  });
  useSpeechRecognitionEvent('end', () => {
    if (!mine()) return;
    closeModal();
  });
  useSpeechRecognitionEvent('result', (event) => {
    if (!mine()) return;
    const text = String(event.results?.[0]?.transcript || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    setHeard(text);
    onResult(text, Boolean(event.isFinal));
  });
  useSpeechRecognitionEvent('error', (event) => {
    if (!mine()) return;
    if (event.error === 'aborted' || event.error === 'no-speech') {
      closeModal();
      return;
    }
    if (event.error === 'language-not-supported' && langRef.current === 0) {
      langRef.current = 1;
      startListening();
      return;
    }
    closeModal();
    if (event.error === 'not-allowed') {
      Alert.alert('Microphone', 'Allow the microphone so you can search by speaking.');
      return;
    }
    Alert.alert('Voice search', 'Could not hear that. Try again.');
  });

  const startListening = async () => {
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        closeModal();
        Alert.alert('Microphone', 'Allow the microphone so you can search by speaking.');
        return;
      }
      sessionOwner = ownerRef.current;
      setHeard('');
      clearStartTimer();
      startTimerRef.current = setTimeout(() => {
        if (!mine()) return;
        try {
          ExpoSpeechRecognitionModule.abort();
        } catch {
          /* already stopped */
        }
        closeModal();
        Alert.alert('Voice search', 'Microphone did not start. Try again.');
      }, 8000);
      ExpoSpeechRecognitionModule.start({
        lang: langRef.current === 0 ? 'ne-NP' : 'en-US',
        interimResults: true,
        continuous: false,
        androidIntentOptions: { EXTRA_LANGUAGE_MODEL: 'web_search' },
      });
    } catch {
      closeModal();
      Alert.alert(
        'Voice search',
        'Rebuild the app once so the microphone button can listen on this phone.'
      );
    }
  };

  const stopListening = () => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      closeModal();
    }
  };

  const toggle = () => {
    if (starting && mine()) {
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        /* already stopped */
      }
      closeModal();
      return;
    }
    if ((listening || open) && mine()) {
      stopListening();
      return;
    }
    langRef.current = 0;
    setStarting(true);
    startListening();
  };

  return (
    <>
      <Pressable
        onPress={toggle}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={starting ? 'Starting microphone' : listening ? 'Stop voice search' : 'Search by voice'}
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: listening ? '#FEE2E2' : starting ? `${colors.primary}1F` : `${color}22`,
        }}
      >
        {starting ? <SpinRing color={colors.primary} /> : null}
        <Icon
          name={listening || starting ? 'mic' : 'mic-outline'}
          size={size}
          color={listening ? '#EF4444' : starting ? colors.primary : color}
        />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={stopListening} statusBarTranslucent>
        <Pressable
          onPress={stopListening}
          style={{
            flex: 1,
            backgroundColor: 'rgba(8,10,18,0.72)',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 28,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: '100%',
              maxWidth: 340,
              borderRadius: 28,
              backgroundColor: colors.surface,
              alignItems: 'center',
              paddingTop: 28,
              paddingBottom: 26,
              paddingHorizontal: 22,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: 0.4, color: colors.textMuted }}>
              LISTENING
            </Text>
            <Text
              style={{
                marginTop: 8,
                fontSize: 22,
                fontWeight: '800',
                color: colors.text,
                textAlign: 'center',
              }}
            >
              {heard || 'Speak now'}
            </Text>
            <Text style={{ marginTop: 6, fontSize: 13, color: colors.textMuted, textAlign: 'center' }}>
              Tap the circle to stop
            </Text>

            <View style={{ width: 220, height: 220, alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
              <PulseRing delay={0} color={colors.primary} />
              <PulseRing delay={500} color={colors.primary} />
              <Pressable onPress={stopListening} accessibilityLabel="Stop recording">
                <LinearGradient
                  colors={colors.gradient || [colors.primary, colors.primary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    width: 112,
                    height: 112,
                    borderRadius: 56,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <View
                    style={{
                      width: 96,
                      height: 96,
                      borderRadius: 48,
                      backgroundColor: 'rgba(255,255,255,0.16)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name="mic" size={42} color="#FFFFFF" />
                  </View>
                </LinearGradient>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
