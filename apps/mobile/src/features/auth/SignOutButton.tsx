import { Button } from '@aiaia/ui';
import { useState } from 'react';
import { useSignOut } from './useSignOut';

export function SignOutButton() {
  const signOut = useSignOut();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      title="Sign out"
      variant="ghost"
      loading={busy}
      onPress={async () => {
        setBusy(true);
        await signOut();
        setBusy(false);
      }}
    />
  );
}
