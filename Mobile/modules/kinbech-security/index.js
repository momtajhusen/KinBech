import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

// Null on iOS and on app builds made before this module existed.
const KinBechSecurity = Platform.OS === 'android' ? requireOptionalNativeModule('KinBechSecurity') : null;

export default KinBechSecurity;
