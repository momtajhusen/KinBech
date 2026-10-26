import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { ImageCropSheetHost } from './src/components/ImageCropSheet';
import { ListingCameraHost } from './src/components/ListingCamera';
import { PhotoSourceSheetHost } from './src/components/PhotoSourceSheet';
import { AuthProvider } from './src/context/AuthContext';
import { WishlistProvider } from './src/context/WishlistContext';
import { ThemeProvider } from './src/theme';
import { getAuthToken, getWorkingApiBaseUrl } from './src/services/api';
import { reportMobileError } from './src/utils/errorReporting';
import { getFCMToken, setupFCMListeners, getInitialNotification } from './src/services/notifications';
 
function getErrorUtils() {
  try {
    // RN exposes ErrorUtils on global in release; named import can be undefined.
    // eslint-disable-next-line no-undef
    return global.ErrorUtils || null;
  } catch {
    return null;
  }
}

function GlobalErrorBridge({ children }) {
  useEffect(() => {
    const ErrorUtils = getErrorUtils();
    if (!ErrorUtils?.getGlobalHandler || !ErrorUtils?.setGlobalHandler) {
      return undefined;
    }
    const previous = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error, isFatal) => {
      reportMobileError(
        {
          message: error?.message || 'Unhandled JS exception',
          stack: error?.stack || '',
          name: error?.name || 'Error',
          severity: isFatal ? 'fatal' : 'error',
          extra: { isFatal: Boolean(isFatal) },
        },
        { baseUrl: getWorkingApiBaseUrl(), token: getAuthToken() }
      ).catch(() => {});
      if (typeof previous === 'function') previous(error, isFatal);
    });
    return undefined;
  }, []);

  return children;
}

export default function App() {
  useEffect(() => {
    // Setup FCM
    const setupFCM = async () => {
      // Check if app was opened from notification
      const initialNotification = await getInitialNotification();
      if (initialNotification) {
        // Handle navigation based on notification data
        console.log('Initial notification:', initialNotification);
      }

      // Get FCM token
      const token = await getFCMToken();
      if (token) {
        // Send this token to your backend to save it for the user
        console.log('FCM token to send to backend:', token);
        // You can call your API here to save the token
        // await api.saveFCMToken(token);
      }

      // Setup notification listeners
      const cleanup = setupFCMListeners((remoteMessage) => {
        // Handle notification tap
        console.log('Notification tapped:', remoteMessage);
        // Navigate based on notification data
        // Example: navigation.navigate('ChatScreen', { chatId: remoteMessage.data.chatId });
      });

      return cleanup;
    };

    let cleanup;
    setupFCM()
      .then((result) => {
        cleanup = result;
      })
      .catch((error) => {
        console.warn('Push notifications were not started:', error?.message || error);
      });

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <WishlistProvider>
              <GlobalErrorBridge>
                <AppNavigator />
                <PhotoSourceSheetHost />
                <ListingCameraHost />
                <ImageCropSheetHost />
              </GlobalErrorBridge>
            </WishlistProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
