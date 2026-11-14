import { SignOutButton } from '@/features/auth/SignOutButton';
import { Placeholder } from '@/components/Placeholder';

export default function WaitingRoomScreen() {
  return (
    <Placeholder title="Waiting room" note="Placeholder. Your application is being reviewed.">
      <SignOutButton />
    </Placeholder>
  );
}
