import { useLocalSearchParams } from 'expo-router';
import { MemberDetailScreen } from '@/features/admin/members/MemberDetailScreen';

export default function AdminMemberDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MemberDetailScreen memberId={String(id)} />;
}
