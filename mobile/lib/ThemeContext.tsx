import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Appearance, ColorSchemeName, useColorScheme } from 'react-native';
import { getColors, ColorTokens } from '@/constants/colors';

type Scheme = 'light' | 'dark';

interface ThemeContextValue {
  scheme: Scheme;
  colors: ColorTokens;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveScheme(s: ColorSchemeName): Scheme {
  return s === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [scheme, setScheme] = useState<Scheme>(resolveScheme(systemScheme));

  // Sync with OS changes while the app is in the foreground
  useEffect(() => {
    try {
      const sub = Appearance.addChangeListener(({ colorScheme }) => {
        setScheme(resolveScheme(colorScheme));
      });
      return () => sub.remove();
    } catch {
      // Appearance.addChangeListener not available on this SDK version
    }
  }, []);

  // Stable reference: only recreates when scheme changes (Property 4)
  const value = useMemo<ThemeContextValue>(
    () => ({ scheme, colors: getColors(scheme) }),
    [scheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
