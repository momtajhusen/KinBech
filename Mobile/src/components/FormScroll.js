import { forwardRef, useCallback, useEffect, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

function keyboardInset(event) {
  const windowHeight = Dimensions.get('window').height;
  const screenY = event?.endCoordinates?.screenY ?? windowHeight;
  const overlap = Math.max(0, Math.round(windowHeight - screenY));
  const height = Math.round(event?.endCoordinates?.height || 0);
  const inset = Math.max(overlap, height);
  if (inset > 24) return inset;
  return Math.round(windowHeight * 0.42);
}

export function useKeyboardOverlap() {
  const [overlap, setOverlap] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setOverlap(keyboardInset(event));
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setOverlap(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return overlap;
}

export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setHeight(keyboardInset(event));
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}

let keyboardTop = null;
Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (event) => {
  const screenY = event?.endCoordinates?.screenY;
  keyboardTop = Number.isFinite(screenY) && screenY > 0 ? screenY : null;
});
Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
  keyboardTop = null;
});

// FormScroll records its offset here so window measurements can be turned into scrollTo targets.
const scrollOffsets = new WeakMap();

/** Scrolls only when the focused input is hidden behind the keyboard or above the visible area. */
export function revealFocusedInput(scrollRef, extraOffset = 24) {
  const scroll = scrollRef?.current;
  const input = TextInput.State?.currentlyFocusedInput?.();
  if (!scroll?.scrollTo || !scroll.measureInWindow || !input?.measureInWindow) return;
  scroll.measureInWindow((_sx, scrollY, _sw, scrollHeight) => {
    input.measureInWindow((_ix, inputY, _iw, inputHeight) => {
      const visibleTop = scrollY + 8;
      const visibleBottom = Math.min(scrollY + scrollHeight, keyboardTop ?? Infinity) - extraOffset;
      let delta = 0;
      if (inputY + inputHeight > visibleBottom) {
        delta = Math.min(inputY + inputHeight - visibleBottom, inputY - visibleTop);
      } else if (inputY < visibleTop) {
        delta = inputY - visibleTop;
      }
      if (Math.abs(delta) < 4) return;
      const offset = scrollOffsets.get(scroll) || 0;
      scroll.scrollTo({ y: Math.max(0, offset + delta), animated: true });
    });
  });
}

export function scrollFieldToTop(scrollRef, anchorRef) {
  const scroll = scrollRef?.current;
  const anchor = anchorRef?.current;
  if (!scroll?.scrollTo || !scroll.measureInWindow || !anchor?.measureInWindow) return;
  scroll.measureInWindow((_sx, scrollY) => {
    anchor.measureInWindow((_ax, anchorY) => {
      const offset = scrollOffsets.get(scroll) || 0;
      scroll.scrollTo({ y: Math.max(0, offset + anchorY - scrollY - 12), animated: true });
    });
  });
}

export function KeyboardForm({ children, style }) {
  const overlap = useKeyboardOverlap();
  return <View style={[{ flex: 1, paddingBottom: overlap }, style]}>{children}</View>;
}

export const FormScroll = forwardRef(function FormScroll(
  {
    children,
    style,
    contentContainerStyle,
    extraOffset = 36,
    lift = true,
    autoScroll = true,
    onScroll,
    ...rest
  },
  ref
) {
  const [scrollNode, setScrollNode] = useState(null);
  const [keyboardPad, setKeyboardPad] = useState(0);

  const setRef = useCallback(
    (node) => {
      setScrollNode(node);
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref]
  );

  const scrollFocused = useCallback(() => {
    revealFocusedInput({ current: scrollNode }, extraOffset);
  }, [extraOffset, scrollNode]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (event) => {
      setKeyboardPad(lift ? keyboardInset(event) : 0);
      if (!autoScroll) return;
      setTimeout(scrollFocused, 40);
      setTimeout(scrollFocused, 260);
    };
    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardPad(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [autoScroll, lift, scrollFocused]);

  const flat = StyleSheet.flatten(contentContainerStyle) || {};
  const baseBottom = Number(flat.paddingBottom) || 0;

  return (
    <ScrollView
      ref={setRef}
      style={[{ flex: 1 }, style]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
      nestedScrollEnabled
      automaticallyAdjustKeyboardInsets
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      {...rest}
      onScroll={(event) => {
        if (scrollNode) scrollOffsets.set(scrollNode, event.nativeEvent.contentOffset.y);
        onScroll?.(event);
      }}
      contentContainerStyle={[
        contentContainerStyle,
        { paddingBottom: baseBottom + keyboardPad + (keyboardPad ? 16 : 0) },
      ]}
    >
      {children}
    </ScrollView>
  );
});
