import React, { createContext, useContext, useCallback, useMemo, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Theme, buildColors } from './colors';

const ThemeContext = createContext();

const THEME_STORAGE_KEY = '@kinbech_theme';
const THEME_OPTIONS = {
  SYSTEM: 'system',
  LIGHT: 'light',
  DARK: 'dark',
};

export const ThemeProvider = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState(THEME_OPTIONS.DARK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme && Object.values(THEME_OPTIONS).includes(savedTheme)) {
          setThemeMode(savedTheme);
        }
      } catch (e) {
        console.error('Failed to load theme:', e);
      } finally {
        setLoading(false);
      }
    };
    loadTheme();
  }, []);

  const setTheme = useCallback(async (mode) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
      setThemeMode(mode);
    } catch (e) {
      console.error('Failed to save theme:', e);
    }
  }, []);

  const actualTheme = useMemo(() => {
    if (themeMode === THEME_OPTIONS.SYSTEM) {
      return systemColorScheme === 'dark' ? 'dark' : 'light';
    }
    return themeMode;
  }, [themeMode, systemColorScheme]);

  const isDarkMode = actualTheme === 'dark';
  const palette = useMemo(() => buildColors(isDarkMode ? 'dark' : 'light'), [isDarkMode]);

  const theme = useMemo(
    () => ({
      isDarkMode,
      isDark: isDarkMode,
      themeMode,
      setTheme,
      THEME_OPTIONS,
      Theme,
      colors: palette,
      spacing: {
        xs: 4,
        sm: 8,
        md: 16,
        lg: 24,
        xl: 32,
      },
      borderRadius: {
        sm: 8,
        md: 12,
        lg: 20,
        full: 999,
      },
    }),
    [isDarkMode, themeMode, setTheme, palette]
  );

  // Nothing yet, so the native launch gradient (plugins/withLaunchGradient) stays visible.
  if (loading) {
    return null;
  }

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
