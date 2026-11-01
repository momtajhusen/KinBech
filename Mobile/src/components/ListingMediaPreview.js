import { Image, Modal, StyleSheet, Text, View } from 'react-native';
import { FadeIn, FadeInDown, FadeInUp, withSpring, withTiming } from 'react-native-reanimated';
import Icon from './Icon';
import { PressableScale, Reanimated } from './Motion';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { resolveMediaUrl } from '../utils/listing';

function PreviewVideo({ uri }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
    instance.play();
  });

  return (
    <VideoView
      style={styles.video}
      player={player}
      nativeControls
      contentFit="contain"
      allowsFullscreen
    />
  );
}

function mediaIn() {
  'worklet';
  const spring = { damping: 18, stiffness: 160, mass: 0.9 };
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.86 }] },
    animations: {
      opacity: withTiming(1, { duration: 220 }),
      transform: [{ scale: withSpring(1, spring) }],
    },
  };
}

export default function ListingMediaPreview({ visible, item, onClose }) {
  return (
    <Modal visible={!!visible} animationType="none" transparent statusBarTranslucent onRequestClose={onClose}>
      {visible ? <PreviewContent item={item} onClose={onClose} /> : null}
    </Modal>
  );
}

function PreviewContent({ item, onClose }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const isVideo = item?.type === 'video';
  const label = isVideo ? 'Video preview' : 'Photo preview';

  return (
    <Reanimated.View entering={FadeIn.duration(200)} style={styles.backdrop}>
        <Reanimated.View entering={FadeInDown.delay(80).duration(260)} style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <View style={styles.headerPill}>
            <Icon name={isVideo ? 'videocam' : 'image'} size={15} color="#fff" />
            <Text style={styles.headerTitle}>{label}</Text>
          </View>
          <PressableScale onPress={onClose} hitSlop={12} contentStyle={styles.closeBtn}>
            <Icon name="close" size={22} color="#fff" />
          </PressableScale>
        </Reanimated.View>

        <Reanimated.View entering={mediaIn} style={styles.body}>
          {item?.uri && isVideo ? (
            <PreviewVideo key={item.uri} uri={resolveMediaUrl(item.uri)} />
          ) : item?.uri ? (
            <Image source={{ uri: resolveMediaUrl(item.uri) }} style={styles.image} resizeMode="contain" />
          ) : (
            <View style={styles.empty}>
              <Icon name="image-outline" size={48} color="rgba(255,255,255,0.6)" />
              <Text style={styles.emptyText}>Nothing to preview</Text>
            </View>
          )}
        </Reanimated.View>

        <Reanimated.View entering={FadeInUp.delay(120).duration(260)} style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <PressableScale
            onPress={onClose}
            scaleTo={0.97}
            contentStyle={[styles.doneBtn, { backgroundColor: colors.primary }]}
          >
            <Icon name="checkmark" size={18} color="#fff" />
            <Text style={styles.doneBtnText}>Done</Text>
          </PressableScale>
        </Reanimated.View>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  empty: {
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  doneBtn: {
    height: 52,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
