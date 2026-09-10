import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { LogOut, RefreshCw } from 'lucide-react-native';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/ThemeContext';

/**
 * Principal Dashboard — Overview and quick actions
 * Full implementation in task #13 (Analytics)
 */
export default function DashboardScreen() {
  const { logout, user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <View className="flex-1 bg-paper">
      {/* Header */}
      <View className="bg-teal px-6 pt-12 pb-6">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-white text-2xl font-bold">Dashboard</Text>
          <TouchableOpacity onPress={handleLogout} className="p-2">
            <LogOut color={'#FFFFFF'} size={24} />
          </TouchableOpacity>
        </View>
        <Text className="text-white/80 text-sm">Welcome, {user?.email}</Text>
      </View>

      <ScrollView className="flex-1 px-6 py-6">
        <View className="bg-card rounded-xl p-6 border border-line items-center justify-center" style={{ minHeight: 200 }}>
          <RefreshCw color={colors.primary} size={48} />
          <Text className="text-ink text-lg font-semibold mt-4 mb-2">
            Dashboard Coming Soon
          </Text>
          <Text className="text-slate text-sm text-center">
            Analytics and overview widgets will be implemented in task #13
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
