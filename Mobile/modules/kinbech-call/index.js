import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

// Null on iOS and on app builds made before this module existed.
const KinBechCall = Platform.OS === 'android' ? requireOptionalNativeModule('KinBechCall') : null;

export default KinBechCall;
