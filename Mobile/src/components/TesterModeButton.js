import { Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from './Icon';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../navigation/helpers';

const TINT = '#7C3AED';

/** Purple flask button for header bars, shown to accounts an admin moved into the test sandbox. Opens the tester details. */
export default function TesterModeButton({ style }) {
  const { user } = useAuth();
  const navigation = useNavigation();
  if (!user?.isTester) return null;
  return (
    <Pressable
      onPress={() => navigation.navigate(ROUTES.TESTER_MODE)}
      hitSlop={8}
      style={({ pressed }) => [styles.btn, style, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
      accessibilityLabel="Tester mode is on. Tap for details."
    >
      <Icon name="flask" size={16} color="#FFFFFF" />
    </Pressable>
  );
}

const styles = {
  btn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TINT,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
  },
};
