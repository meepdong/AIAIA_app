import { Button } from '@aiaia/ui';
import { useRouter } from 'expo-router';
import { SignOutButton } from '@/features/auth/SignOutButton';
import { Placeholder } from '@/components/Placeholder';

export default function HomeScreen() {
  const router = useRouter();
  return (
    <Placeholder title="Home" note="Placeholder member area.">
      <Button title="My pass" onPress={() => router.push('/pass')} />
      <SignOutButton />
    </Placeholder>
  );
}
