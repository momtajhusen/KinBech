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
import Icon from './Icon';
import { useTheme, useThemedStyles } from '../theme';
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
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
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
    setBusy(false);
    setHistory([]);
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

  const showPhoto = (nextPhoto) => {
    const base = Math.max(frameW / nextPhoto.width, frameH / nextPhoto.height);
    const start = {
      x: (frameW - nextPhoto.width * base) / 2,
      y: (frameH - nextPhoto.height * base) / 2,
    };
    viewRef.current = { zoom: 1, offset: start };
    setPhoto(nextPhoto);
    setZoom(1);
    setOffset(start);
  };

  const bake = async (actions) => {
    if (!photo || busy || saving) return;
    setBusy(true);
    try {
      const out = await ImageManipulator.manipulateAsync(photo.uri, actions, {
        compress: 1,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      setHistory((stack) => [...stack, photo].slice(-12));
      showPhoto({
        uri: out.uri || photo.uri,
        width: out.width || photo.width,
        height: out.height || photo.height,
      });
    } finally {
      setBusy(false);
    }
  };

  const undo = () => {
    if (!history.length || busy || saving) return;
    const previous = history[history.length - 1];
    setHistory((stack) => stack.slice(0, -1));
    showPhoto(previous);
  };

  const changeZoom = (delta) => {
    applyView(zoom + delta, offset);
  };

  const resetView = () => {
    if (!photo || !layout) return;
    applyView(1, {
      x: (layout.frameW - photo.width * layout.base) / 2,
      y: (layout.frameH - photo.height * layout.base) / 2,
    });
  };

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
        <View style={[styles.card, { width: sheetWidth }]}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Crop photo</Text>
              <Text style={styles.subtitle}>Drag to move · pinch to zoom · rotate, flip, straighten</Text>
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

          <View style={styles.tools}>
            {[
              { key: 'left', icon: 'refresh', flip: true, label: 'Left', action: () => bake([{ rotate: -90 }]) },
              { key: 'right', icon: 'refresh', label: 'Right', action: () => bake([{ rotate: 90 }]) },
              { key: 'flipH', icon: 'swap-horizontal', label: 'Flip', action: () => bake([{ flip: ImageManipulator.FlipType.Horizontal }]) },
              { key: 'flipV', icon: 'swap-vertical', label: 'Mirror', action: () => bake([{ flip: ImageManipulator.FlipType.Vertical }]) },
              { key: 'tiltL', icon: 'return-down-back', label: '-5°', action: () => bake([{ rotate: -5 }]) },
              { key: 'tiltR', icon: 'return-down-forward', label: '+5°', action: () => bake([{ rotate: 5 }]) },
            ].map((tool) => (
              <Pressable
                key={tool.key}
                style={styles.tool}
                disabled={!photo || busy || saving}
                onPress={tool.action}
              >
                <Icon
                  name={tool.icon}
                  size={18}
                  color={colors.text}
                  style={tool.flip ? { transform: [{ scaleX: -1 }] } : undefined}
                />
                <Text style={styles.toolLabel}>{tool.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.editRow}>
            <Pressable style={styles.undo} onPress={undo} disabled={!history.length || busy || saving}>
              <Icon name="arrow-undo" size={16} color={history.length ? colors.text : colors.textSecondary} />
              <Text style={[styles.undoText, !history.length && { color: colors.textSecondary }]}>Undo</Text>
            </Pressable>
            {busy ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.editHint}>Edits apply on the photo</Text>}
          </View>

          <View style={styles.zoomRow}>
            <Pressable style={styles.zoomBtn} onPress={() => changeZoom(-0.25)} disabled={zoom <= 1}>
              <Icon name="remove" size={18} color={colors.text} />
            </Pressable>
            <View style={styles.zoomTrack}>
              <View style={[styles.zoomFill, { width: `${((zoom - 1) / 3) * 100}%` }]} />
            </View>
            <Pressable style={styles.zoomBtn} onPress={() => changeZoom(0.25)} disabled={zoom >= 4}>
              <Icon name="add" size={18} color={colors.text} />
            </Pressable>
            <Text style={styles.zoomLabel}>{Math.round(zoom * 100)}%</Text>
            <Pressable style={styles.zoomBtn} onPress={resetView}>
              <Icon name="refresh" size={16} color={colors.text} />
            </Pressable>
          </View>

          <Pressable style={styles.use} onPress={applyCrop} disabled={!photo || saving}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.useText}>Use photo</Text>
            )}
          </Pressable>
        </View>
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
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
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
    tools: {
      flexDirection: 'row',
      alignSelf: 'stretch',
      gap: 6,
      marginTop: 12,
    },
    tool: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: colors.background,
    },
    toolLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    editRow: {
      alignSelf: 'stretch',
      minHeight: 28,
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    undo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
      paddingRight: 8,
    },
    undoText: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.text,
    },
    editHint: {
      flex: 1,
      textAlign: 'right',
      fontSize: 11,
      color: colors.textSecondary,
    },
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
    zoomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 14,
      alignSelf: 'stretch',
    },
    zoomBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    zoomTrack: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.background,
      overflow: 'hidden',
    },
    zoomFill: {
      height: '100%',
      backgroundColor: colors.primary,
    },
    zoomLabel: {
      minWidth: 42,
      textAlign: 'right',
      fontSize: 12,
      fontWeight: '800',
      color: colors.text,
    },
    use: {
      alignSelf: 'stretch',
      height: 50,
      marginTop: 14,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    useText: {
      fontSize: 16,
      fontWeight: '800',
      color: '#fff',
    },
  });
}
