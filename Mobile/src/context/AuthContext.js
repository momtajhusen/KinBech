import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, onAuthTokenChange, setAuthToken } from '../services/api';
import { clearToken, readToken, writeToken } from '../services/tokenStorage';
import { resetToLogin } from '../navigation/navigationRef';
import { setDisplayCurrency } from '../utils/currency';
import { setCacheAudience } from '../utils/homeListingsCache';

const USER_KEY = 'kinbech_user';
const ONBOARD_KEY = 'kinbech_onboarded';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const storedToken = await readToken();
        const [[, storedUser], [, storedOnboard]] =
          await AsyncStorage.multiGet([USER_KEY, ONBOARD_KEY]);

        if (cancelled) return;

        setOnboarded(storedOnboard === '1');

        if (storedToken) {
          setAuthToken(storedToken);
          setToken(storedToken);
          if (storedUser) {
            try {
              setUser(JSON.parse(storedUser));
            } catch (_error) {
              // ignore
            }
          }

          const { data, error } = await api.me();
          if (cancelled) return;
          if (data?.user) {
            if (data.token) {
              setAuthToken(data.token);
              setToken(data.token);
              await writeToken(data.token);
            }
            setUser(data.user);
            await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
          } else if (error) {
            setAuthToken(null);
            setToken(null);
            setUser(null);
            await clearToken();
            await AsyncStorage.removeItem(USER_KEY);
          }
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setDisplayCurrency(user?.preferences?.currency);
  }, [user?.preferences?.currency]);

  useEffect(() => {
    setCacheAudience(user?.isTester ? 'test' : 'public');
  }, [user?.isTester]);

  // api.js refreshes tokens silently; mirror them here, or sign out when the session ended.
  useEffect(
    () =>
      onAuthTokenChange((nextToken) => {
        if (nextToken) {
          setToken(nextToken);
          return;
        }
        setToken(null);
        setUser(null);
        clearToken().catch(() => {});
        AsyncStorage.removeItem(USER_KEY).catch(() => {});
        resetToLogin();
      }),
    []
  );

  const value = useMemo(
    () => ({
      token,
      user,
      ready,
      onboarded,
      isLoggedIn: Boolean(token),
      async saveSession(nextToken, nextUser) {
        setAuthToken(nextToken);
        setToken(nextToken);
        setUser(nextUser);
        await writeToken(nextToken);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(nextUser));
      },
      async refreshUser() {
        const { data, error } = await api.me();
        if (data?.user && !error) {
          if (data.token) {
            setAuthToken(data.token);
            setToken(data.token);
            await writeToken(data.token);
          }
          setUser(data.user);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
          return { user: data.user, error: null };
        }
        return { user: null, error };
      },
      async logout() {
        // Header is captured synchronously, before the token is cleared below.
        api.logout().catch(() => {});
        setAuthToken(null);
        setToken(null);
        setUser(null);
        await clearToken();
        await AsyncStorage.removeItem(USER_KEY);
      },
      async completeOnboarding() {
        setOnboarded(true);
        await AsyncStorage.setItem(ONBOARD_KEY, '1');
      },
    }),
    [token, user, ready, onboarded]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
