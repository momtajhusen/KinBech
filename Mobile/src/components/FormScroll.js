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

function keyboardOverlap(event) {
  const windowHeight = Dimensions.get('window').height;
  const screenY = event?.endCoordinates?.screenY ?? windowHeight;
  const overlap = Math.max(0, Math.round(windowHeight - screenY));
  return overlap > 24 ? overlap : 0;
}

export function useKeyboardOverlap() {
  const [overlap, setOverlap] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setOverlap(keyboardOverlap(event));
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setOverlap(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return overlap;
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
    const input = TextInput.State?.currentlyFocusedInput?.();
    if (!input || !scrollNode?.scrollResponderScrollNativeHandleToKeyboard) return;
    scrollNode.scrollResponderScrollNativeHandleToKeyboard(input, extraOffset, true);
  }, [extraOffset, scrollNode]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (event) => {
      setKeyboardPad(lift ? keyboardOverlap(event) : 0);
      setTimeout(scrollFocused, 40);
      setTimeout(scrollFocused, 260);
    };
    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardPad(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [lift, scrollFocused]);

  const flat = StyleSheet.flatten(contentContainerStyle) || {};
  const baseBottom = Number(flat.paddingBottom) || 0;

  return (
    <ScrollView
      ref={setRef}
      style={[{ flex: 1 }, style]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator={false}
      {...rest}
      contentContainerStyle={[
        contentContainerStyle,
        { paddingBottom: baseBottom + keyboardPad + (keyboardPad ? 16 : 0) },
      ]}
    >
      {children}
    </ScrollView>
  );
});
