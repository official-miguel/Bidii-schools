import { Tabs, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { LayoutDashboard, BookOpen, QrCode, CreditCard, Settings, BarChart3, User } from 'lucide-react-native';
import { useAuth, isPrincipal, isLibrarian, isStudent } from '@/lib/auth';
import { useTheme } from '@/lib/ThemeContext';

/**
 * Role-based tab navigation
 * 
 * Principal:   Dashboard | Catalogue | Analytics | Settings
 * Librarian:   Circulation | Catalogue | Reservations | Cards | Scan
 * Student:     My Card | Browse | My Borrows
 */
export default function TabsLayout() {
  const { user } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();

  const tabBarScreenOptions = {
    headerShown: false,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.mutedForeground,
    tabBarStyle: {
      backgroundColor: colors.card,
      borderTopColor: colors.border,
      height: 64,
      paddingBottom: 8,
      paddingTop: 8,
    },
    tabBarLabelStyle: {
      fontSize: 11,
      fontWeight: '500' as const,
    },
  };

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!user) {
      router.replace('/(auth)/login');
    }
  }, [user, router]);

  if (!user) {
    return null;
  }

  // Principal tabs
  if (isPrincipal()) {
    return (
      <Tabs screenOptions={tabBarScreenOptions}>
        <Tabs.Screen
          name="dashboard"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="catalogue"
          options={{
            title: 'Catalogue',
            tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="analytics"
          options={{
            title: 'Analytics',
            tabBarIcon: ({ color, size }) => <BarChart3 color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
          }}
        />
        {/* Hide unused tabs */}
        <Tabs.Screen name="circulate" options={{ href: null }} />
        <Tabs.Screen name="reservations" options={{ href: null }} />
        <Tabs.Screen name="cards" options={{ href: null }} />
        <Tabs.Screen name="scan" options={{ href: null }} />
        <Tabs.Screen name="my-card" options={{ href: null }} />
        <Tabs.Screen name="browse" options={{ href: null }} />
        <Tabs.Screen name="my-borrows" options={{ href: null }} />
      </Tabs>
    );
  }

  // Librarian tabs
  if (isLibrarian()) {
    return (
      <Tabs screenOptions={tabBarScreenOptions}>
        <Tabs.Screen
          name="circulate"
          options={{
            title: 'Circulate',
            tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="scan"
          options={{
            title: 'Scan',
            tabBarIcon: ({ color, size }) => <QrCode color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="cards"
          options={{
            title: 'Cards',
            tabBarIcon: ({ color, size }) => <CreditCard color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="reservations"
          options={{
            title: 'Reservations',
            tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="catalogue"
          options={{
            title: 'Catalogue',
            tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size} />,
          }}
        />
        {/* Hide unused tabs */}
        <Tabs.Screen name="dashboard" options={{ href: null }} />
        <Tabs.Screen name="analytics" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="my-card" options={{ href: null }} />
        <Tabs.Screen name="browse" options={{ href: null }} />
        <Tabs.Screen name="my-borrows" options={{ href: null }} />
      </Tabs>
    );
  }

  // Student tabs
  if (isStudent()) {
    return (
      <Tabs screenOptions={tabBarScreenOptions}>
        <Tabs.Screen
          name="my-card"
          options={{
            title: 'My Card',
            tabBarIcon: ({ color, size }) => <CreditCard color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="browse"
          options={{
            title: 'Browse',
            tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="my-borrows"
          options={{
            title: 'My Books',
            tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
          }}
        />
        {/* Hide unused tabs */}
        <Tabs.Screen name="dashboard" options={{ href: null }} />
        <Tabs.Screen name="circulate" options={{ href: null }} />
        <Tabs.Screen name="catalogue" options={{ href: null }} />
        <Tabs.Screen name="reservations" options={{ href: null }} />
        <Tabs.Screen name="cards" options={{ href: null }} />
        <Tabs.Screen name="scan" options={{ href: null }} />
        <Tabs.Screen name="analytics" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
      </Tabs>
    );
  }

  // Fallback for other roles (TEACHER, etc.) — show limited access
  return (
    <Tabs screenOptions={tabBarScreenOptions}>
      <Tabs.Screen
        name="browse"
        options={{
          title: 'Browse',
          tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size} />,
        }}
      />
      {/* Hide all other tabs */}
      <Tabs.Screen name="dashboard" options={{ href: null }} />
      <Tabs.Screen name="circulate" options={{ href: null }} />
      <Tabs.Screen name="catalogue" options={{ href: null }} />
      <Tabs.Screen name="reservations" options={{ href: null }} />
      <Tabs.Screen name="cards" options={{ href: null }} />
      <Tabs.Screen name="scan" options={{ href: null }} />
      <Tabs.Screen name="analytics" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="my-card" options={{ href: null }} />
      <Tabs.Screen name="my-borrows" options={{ href: null }} />
    </Tabs>
  );
}
