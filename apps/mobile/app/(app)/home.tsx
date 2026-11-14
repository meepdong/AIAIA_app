import { SignOutButton } from '@/features/auth/SignOutButton';
import { Placeholder } from '@/components/Placeholder';

export default function HomeScreen() {
  return (
    <Placeholder title="Home" note="Placeholder member area.">
      <SignOutButton />
    </Placeholder>
  );
}
