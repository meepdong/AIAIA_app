import { useRouter, type Href } from 'expo-router';
import { DashboardScreen } from '@/features/admin/dashboard/DashboardScreen';

export default function AdminHomeScreen() {
  const router = useRouter();
  return <DashboardScreen onOpenPending={() => router.push('/members?status=pending' as Href)} />;
}
