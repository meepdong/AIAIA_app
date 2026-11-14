import { View } from 'react-native';
import { Placeholder } from '@/components/Placeholder';
import { PublicFooter } from '@/features/public';

export default function PhoneScreen() {
  return (
    <View style={{ flex: 1 }}>
      <Placeholder title="Phone number" note="Placeholder. P1 builds phone sign-in." />
      <PublicFooter />
    </View>
  );
}
