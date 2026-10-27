import 'react-native-gesture-handler';
import 'react-native-reanimated';
import { AppRegistry } from 'react-native';
import { registerRootComponent } from 'expo';
import './src/services/callBackground';
import { callDeclineHeadlessTask, callKeepHeadlessTask } from './src/services/CallKeepManager';
import App from './App';

AppRegistry.registerHeadlessTask('RNCallKeepBackgroundMessage', () => callKeepHeadlessTask);
AppRegistry.registerHeadlessTask('KinBechCallDecline', () => callDeclineHeadlessTask);

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
