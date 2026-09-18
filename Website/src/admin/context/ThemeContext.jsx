import { createContext, useContext, useEffect, useState } from 'react';
import { darkColors, lightColors } from '../theme/colors';

const AdminThemeContext = createContext(null);
const ADMIN_THEME_KEY = 'admin-theme';

export function AdminThemeProvider({ children }) {
  const [theme, setTheme] = useState('dark');
  const [colors, setColors] = useState(darkColors);

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem(ADMIN_THEME_KEY);
      if (savedTheme === 'light' || savedTheme === 'dark') {
        setTheme(savedTheme);
        setColors(savedTheme === 'dark' ? darkColors : lightColors);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    setColors(newTheme === 'dark' ? darkColors : lightColors);
    try {
      localStorage.setItem(ADMIN_THEME_KEY, newTheme);
    } catch {
      /* ignore */
    }
  };

  return (
    <AdminThemeContext.Provider value={{ theme, toggleTheme, colors }}>
      <div className="admin-app" data-admin-theme={theme}>
        {children}
      </div>
    </AdminThemeContext.Provider>
  );
}

export const useTheme = () => {
  const ctx = useContext(AdminThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within AdminThemeProvider');
  }
  return ctx;
};
