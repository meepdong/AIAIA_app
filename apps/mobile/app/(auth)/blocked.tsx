import { SignOutButton } from '@/features/auth/SignOutButton';
import { Placeholder } from '@/components/Placeholder';

export default function BlockedScreen() {
  return (
    <Placeholder
      title="Account unavailable"
      note="Placeholder. Shown to rejected, suspended and deleted accounts."
    >
      <SignOutButton />
    </Placeholder>
  );
}
