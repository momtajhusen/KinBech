import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Icon from './Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cropImageRect } from '../utils/pickImage';

let opener = null;

export function requestListingCapture({ aspect = [4, 5], maxWidth = 1080 } = {}) {
  return new Promise((resolve) => {
    if (typeof opener !== 'function') {
      resolve(null);
      return;
    }
    opener({ aspect, maxWidth, resolve });
  });
}

export function ListingCameraHost() {
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
    resolve?.(uri || null);
  };

  return (
    <ListingCamera
      visible={Boolean(request)}
      aspect={request?.aspect || [4, 5]}
      maxWidth={request?.maxWidth || 1080}
      onCancel={() => finish(null)}
      onDone={finish}
    />
  );
}

function mapFrameToPhoto(photoW, photoH, viewW, viewH, frame) {
  if (!photoW || !photoH || !viewW || !viewH || !frame?.width) return null;
  const photoAspect = photoW / photoH;
  const viewAspect = viewW / viewH;
  let visibleW = photoW;
  let visibleH = photoH;
  let offsetX = 0;
  let offsetY = 0;
  if (photoAspect > viewAspect) {
    visibleH = photoH;
    visibleW = photoH * viewAspect;
    offsetX = (photoW - visibleW) / 2;
  } else if (photoAspect < viewAspect) {
    visibleW = photoW;
    visibleH = photoW / viewAspect;
    offsetY = (photoH - visibleH) / 2;
  }
  return {
    originX: offsetX + (frame.x / viewW) * visibleW,
    originY: offsetY + (frame.y / viewH) * visibleH,
    width: (frame.width / viewW) * visibleW,
    height: (frame.height / viewH) * visibleH,
  };
}

function ListingCamera({ visible, aspect, maxWidth, onCancel, onDone }) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef(null);
  const viewSize = useRef({ width: 0, height: 0 });
  const frameRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [shooting, setShooting] = useState(false);
  const [frame, setFrame] = useState(null);

  useEffect(() => {
    if (!visible) {
      setReady(false);
      setShooting(false);
      setFrame(null);
    }
  }, [visible]);

  const onCameraLayout = (event) => {
    const { width, height } = event.nativeEvent.layout;
    viewSize.current = { width, height };
    const ratio = (aspect[0] || 4) / (aspect[1] || 5);
    const padTop = insets.top + 64;
    const padBottom = insets.bottom + 128;
    const maxW = width - 48;
    const maxH = Math.max(120, height - padTop - padBottom);
    let frameW = maxW;
    let frameH = frameW / ratio;
    if (frameH > maxH) {
      frameH = maxH;
      frameW = frameH * ratio;
    }
    const next = {
      x: (width - frameW) / 2,
      y: padTop + (maxH - frameH) / 2,
      width: frameW,
      height: frameH,
    };
    frameRef.current = next;
    setFrame(next);
  };

  const shoot = async () => {
    if (!cameraRef.current || !ready || shooting) return;
    setShooting(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (!photo?.uri) {
        onDone(null);
        return;
      }
      const rect = mapFrameToPhoto(
        photo.width,
        photo.height,
        viewSize.current.width,
        viewSize.current.height,
        frameRef.current,
      );
      const cropped = rect ? await cropImageRect(photo.uri, rect, maxWidth) : photo.uri;
      onDone(cropped);
    } catch {
      setShooting(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.root}>
      <View style={styles.cameraWrap} onLayout={onCameraLayout}>
        {permission?.granted ? (
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            mode="picture"
            onCameraReady={() => setReady(true)}
          />
        ) : (
          <View style={styles.permission}>
            <Text style={styles.permissionText}>Allow camera access to take a listing photo.</Text>
            <Pressable style={styles.permissionBtn} onPress={requestPermission}>
              <Text style={styles.permissionBtnText}>Allow camera</Text>
            </Pressable>
          </View>
        )}

        {frame ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <View style={[styles.dim, { height: frame.y }]} />
            <View style={{ height: frame.height, flexDirection: 'row' }}>
              <View style={[styles.dim, { width: frame.x }]} />
              <View style={[styles.frame, { width: frame.width, height: frame.height }]}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
              <View style={[styles.dim, { flex: 1 }]} />
            </View>
            <View style={[styles.dim, styles.dimRest, { alignItems: 'center' }]}>
              <Text style={styles.hint}>Keep the product inside this frame</Text>
            </View>
          </View>
        ) : null}
      </View>

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.close} onPress={onCancel} hitSlop={12}>
          <Icon name="close" size={26} color="#fff" />
        </Pressable>
      </View>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable
          style={[styles.shutter, (!ready || shooting) && styles.shutterDisabled]}
          onPress={shoot}
          disabled={!ready || shooting}
        >
          {shooting ? <ActivityIndicator color="#111" /> : <View style={styles.shutterInner} />}
        </Pressable>
      </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraWrap: {
    flex: 1,
    backgroundColor: '#000',
  },
  permission: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 16,
  },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionBtn: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  permissionBtnText: {
    fontWeight: '800',
    color: '#111',
  },
  dim: {
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  dimRest: {
    flex: 1,
    paddingTop: 14,
  },
  frame: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
  },
  corner: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderColor: '#fff',
  },
  cornerTL: {
    top: -1,
    left: -1,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 16,
  },
  cornerTR: {
    top: -1,
    right: -1,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 16,
  },
  cornerBL: {
    bottom: -1,
    left: -1,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 16,
  },
  cornerBR: {
    bottom: -1,
    right: -1,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 16,
  },
  hint: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
  },
  close: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  shutter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  shutterDisabled: {
    opacity: 0.45,
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#fff',
  },
});
