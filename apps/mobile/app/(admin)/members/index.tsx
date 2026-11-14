import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { MembersListScreen } from '@/features/admin/members/MembersListScreen';

export default function AdminMembersScreen() {
  const router = useRouter();
  const { status } = useLocalSearchParams<{ status?: string }>();
  return (
    <MembersListScreen
      initialStatus={status}
      onOpenMember={(id) => router.push(`/members/${id}` as Href)}
    />
  );
}
