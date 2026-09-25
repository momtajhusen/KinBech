import { useEffect } from 'react';
import { ErrorUtils } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider } from './src/context/AuthContext';
import { SharedTransitionProvider } from './src/context/SharedTransitionContext';
import { ThemeProvider } from './src/theme';
import { getAuthToken, getWorkingApiBaseUrl } from './src/services/api';
import { reportMobileError } from './src/utils/errorReporting';

function GlobalErrorBridge({ children }) {
  useEffect(() => {
    const previous = ErrorUtils.getGlobalHandler?.();
    ErrorUtils.setGlobalHandler?.((error, isFatal) => {
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
  }, []);

  return children;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SharedTransitionProvider>
          <ThemeProvider>
            <AuthProvider>
              <GlobalErrorBridge>
                <AppNavigator />
              </GlobalErrorBridge>
            </AuthProvider>
          </ThemeProvider>
        </SharedTransitionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
