import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ImageManipulator from 'expo-image-manipulator';
import { LinearGradient } from 'expo-linear-gradient';
import { FadeInDown, withSpring, withTiming } from 'react-native-reanimated';
import Icon from './Icon';
import { PressableScale, Reanimated } from './Motion';
import { useTheme, useThemedStyles } from '../theme';

function cardIn() {
  'worklet';
  const spring = { damping: 16, stiffness: 170, mass: 0.8 };
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 50 }, { scale: 0.94 }] },
    animations: {
      opacity: withTiming(1, { duration: 200 }),
      transform: [{ translateY: withSpring(0, spring) }, { scale: withSpring(1, spring) }],
    },
  };
}
import { cropImageRect } from '../utils/pickImage';

let opener = null;

export function requestImageCrop({ uri, aspect = [4, 5], maxWidth = 1080 }) {
  return new Promise((resolve) => {
    if (!uri || typeof opener !== 'function') {
      resolve(null);
      return;
    }
    opener({ uri, aspect, maxWidth, resolve });
  });
}

export function ImageCropSheetHost() {
  const resolverRef = useRef(null);
  const [request, setRequest] = useState(null);

  useEffect(() => {
    opener = (next) => {
      if (resolverRef.current) resolverRef.current(null);
      resolverRef.current = next.resolve;
      setRequest(next);
    };
    return () => {
      opener = null;
    };
  }, []);

  const finish = (uri) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setRequest(null);
    resolve?.(uri);
  };

  return (
    <ImageCropSheet
      visible={Boolean(request)}
      uri={request?.uri}
      aspect={request?.aspect}
      maxWidth={request?.maxWidth}
      onCancel={() => finish(null)}
      onDone={(uri) => finish(uri)}
    />
  );
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function ImageCropSheet({ visible, uri, aspect = [4, 5], maxWidth = 1080, onCancel, onDone }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [photo, setPhoto] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const viewRef = useRef({ zoom: 1, offset: { x: 0, y: 0 } });
  const panStart = useRef({ x: 0, y: 0 });
  const pinchStart = useRef({ zoom: 1, offset: { x: 0, y: 0 } });

  const ratio = (aspect?.[0] || 4) / (aspect?.[1] || 5);
  const sheetWidth = Math.min(screenW - 28, 440);
  let frameW = sheetWidth - 28;
  let frameH = frameW / ratio;
  const maxFrameH = Math.min(screenH * 0.56, 520);
  if (frameH > maxFrameH) {
    frameH = maxFrameH;
    frameW = frameH * ratio;
  }

  const layout = useMemo(() => {
    if (!photo) return null;
    const base = Math.max(frameW / photo.width, frameH / photo.height);
    return { base, frameW, frameH };
  }, [photo, frameW, frameH]);

  const place = (nextZoom, nextOffset, currentLayout = layout) => {
    if (!currentLayout || !photo) return { x: 0, y: 0 };
    const scale = currentLayout.base * nextZoom;
    const dispW = photo.width * scale;
    const dispH = photo.height * scale;
    return {
      x: clamp(nextOffset.x, currentLayout.frameW - dispW, 0),
      y: clamp(nextOffset.y, currentLayout.frameH - dispH, 0),
    };
  };

  const applyView = (nextZoom, nextOffset) => {
    const zoomed = clamp(nextZoom, 1, 4);
    const placed = place(zoomed, nextOffset);
    viewRef.current = { zoom: zoomed, offset: placed };
    setZoom(zoomed);
    setOffset(placed);
  };

  useEffect(() => {
    if (!visible || !uri) return undefined;
    let cancelled = false;
    setPhoto(null);
    setZoom(1);
    setSaving(false);
    ImageManipulator.manipulateAsync(uri, []).then((measured) => {
      if (cancelled) return;
      const nextPhoto = {
        uri: measured.uri || uri,
        width: measured.width,
        height: measured.height,
      };
      const base = Math.max(frameW / nextPhoto.width, frameH / nextPhoto.height);
      const start = {
        x: (frameW - nextPhoto.width * base) / 2,
        y: (frameH - nextPhoto.height * base) / 2,
      };
      viewRef.current = { zoom: 1, offset: start };
      setPhoto(nextPhoto);
      setZoom(1);
      setOffset(start);
    }).catch(() => {
      if (!cancelled) onCancel();
    });
    return () => {
      cancelled = true;
    };
  }, [visible, uri]);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .runOnJS(true)
      .maxPointers(1)
      .onBegin(() => {
        panStart.current = { ...viewRef.current.offset };
      })
      .onUpdate((event) => {
        applyView(viewRef.current.zoom, {
          x: panStart.current.x + event.translationX,
          y: panStart.current.y + event.translationY,
        });
      });

    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onBegin(() => {
        pinchStart.current = {
          zoom: viewRef.current.zoom,
          offset: { ...viewRef.current.offset },
        };
      })
      .onUpdate((event) => {
        const start = pinchStart.current;
        const nextZoom = clamp(start.zoom * event.scale, 1, 4);
        const ratioZoom = nextZoom / start.zoom;
        const focalX = event.focalX;
        const focalY = event.focalY;
        applyView(nextZoom, {
          x: focalX - (focalX - start.offset.x) * ratioZoom,
          y: focalY - (focalY - start.offset.y) * ratioZoom,
        });
      });

    return Gesture.Simultaneous(pan, pinch);
  }, [layout, photo]);

  const applyCrop = async () => {
    if (!photo || !layout || saving) return;
    setSaving(true);
    try {
      const scale = layout.base * viewRef.current.zoom;
      const current = viewRef.current.offset;
      let originX = -current.x / scale;
      let originY = -current.y / scale;
      let cropW = layout.frameW / scale;
      let cropH = layout.frameH / scale;
      originX = clamp(originX, 0, photo.width - 1);
      originY = clamp(originY, 0, photo.height - 1);
      cropW = Math.min(cropW, photo.width - originX);
      cropH = Math.min(cropH, photo.height - originY);
      const cropped = await cropImageRect(
        photo.uri,
        { originX, originY, width: cropW, height: cropH },
        maxWidth,
      );
      onDone(cropped);
    } catch {
      setSaving(false);
    }
  };

  const scale = layout ? layout.base * zoom : 1;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <GestureHandlerRootView style={styles.overlay}>
        {visible ? (
        <Reanimated.View entering={cardIn} style={[styles.card, { width: sheetWidth }]}>
          <View style={styles.header}>
            <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerIcon}>
              <Icon name="crop" size={18} color="#FFFFFF" />
            </LinearGradient>
            <View style={styles.headerText}>
              <Text style={styles.title}>Crop photo</Text>
              <Text style={styles.subtitle}>Drag to move · pinch to zoom</Text>
            </View>
            <Pressable style={styles.iconBtn} onPress={onCancel} hitSlop={8}>
              <Icon name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <GestureDetector gesture={gesture}>
            <View style={[styles.frame, { width: frameW, height: frameH }]}>
              {photo ? (
                <Image
                  source={{ uri: photo.uri }}
                  resizeMode="stretch"
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: photo.width * scale,
                    height: photo.height * scale,
                    transform: [{ translateX: offset.x }, { translateY: offset.y }],
                  }}
                />
              ) : (
                <ActivityIndicator color="#fff" />
              )}
              <View pointerEvents="none" style={styles.grid}>
                <View style={[styles.gridLine, styles.gridV1]} />
                <View style={[styles.gridLine, styles.gridV2]} />
                <View style={[styles.gridLine, styles.gridH1]} />
                <View style={[styles.gridLine, styles.gridH2]} />
              </View>
              <View pointerEvents="none" style={styles.corners}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
            </View>
          </GestureDetector>

          <Reanimated.View entering={FadeInDown.delay(200).duration(280)} style={styles.useWrap}>
            <PressableScale scaleTo={0.97} onPress={applyCrop} disabled={!photo || saving}>
              <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.use}>
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Icon name="checkmark-circle" size={19} color="#FFFFFF" />
                    <Text style={styles.useText}>Use photo</Text>
                  </>
                )}
              </LinearGradient>
            </PressableScale>
          </Reanimated.View>
        </Reanimated.View>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(8, 12, 20, 0.72)',
      paddingHorizontal: 14,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 28,
      paddingTop: 16,
      paddingHorizontal: 14,
      paddingBottom: 14,
      alignItems: 'center',
    },
    headerIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
      alignSelf: 'stretch',
    },
    headerText: {
      flex: 1,
    },
    title: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
    },
    subtitle: {
      marginTop: 3,
      fontSize: 12,
      lineHeight: 16,
      color: colors.textSecondary,
    },
    iconBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    frame: {
      overflow: 'hidden',
      borderRadius: 18,
      backgroundColor: '#0b1220',
    },
    grid: {
      ...StyleSheet.absoluteFillObject,
    },
    gridLine: {
      position: 'absolute',
      backgroundColor: 'rgba(255,255,255,0.28)',
    },
    gridV1: { left: '33.33%', top: 0, bottom: 0, width: 1 },
    gridV2: { left: '66.66%', top: 0, bottom: 0, width: 1 },
    gridH1: { top: '33.33%', left: 0, right: 0, height: 1 },
    gridH2: { top: '66.66%', left: 0, right: 0, height: 1 },
    corners: {
      ...StyleSheet.absoluteFillObject,
    },
    corner: {
      position: 'absolute',
      width: 22,
      height: 22,
      borderColor: '#fff',
    },
    cornerTL: { top: 8, left: 8, borderTopWidth: 3, borderLeftWidth: 3 },
    cornerTR: { top: 8, right: 8, borderTopWidth: 3, borderRightWidth: 3 },
    cornerBL: { bottom: 8, left: 8, borderBottomWidth: 3, borderLeftWidth: 3 },
    cornerBR: { bottom: 8, right: 8, borderBottomWidth: 3, borderRightWidth: 3 },
    useWrap: {
      alignSelf: 'stretch',
      marginTop: 14,
    },
    use: {
      height: 52,
      borderRadius: 16,
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    useText: {
      fontSize: 16,
      fontWeight: '800',
      color: '#fff',
    },
  });
}
