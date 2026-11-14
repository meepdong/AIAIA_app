import { useRouter, type Href } from 'expo-router';
import { Button } from '@aiaia/ui';
import { LegalPage } from '@/features/public';

export default function DeleteAccountPage() {
  const router = useRouter();
  return (
    <LegalPage slug="delete-account">
      {/* The web login leads to Settings, where the member chooses Delete account.
          TODO(P1-13a): push to the settings delete route once app/(app)/settings/ exists. */}
      <Button title="Sign in to delete" onPress={() => router.push('/' as Href)} />
    </LegalPage>
  );
}
