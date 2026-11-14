import { Button, PhoneField, Screen, Text } from '@aiaia/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { PublicFooter } from '@/features/public';
import { isValidIndianMobile, setPendingPhone } from './pending-phone';
import { useApi } from './useApi';

export const PHONE_INVALID = 'Enter a valid 10-digit mobile number.';

export function PhoneScreen() {
  const { auth } = useApi();
  const router = useRouter();
  const [national, setNational] = useState('');
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (sending) return;
    if (!isValidIndianMobile(national)) {
      setError(PHONE_INVALID);
      return;
    }
    setError(undefined);
    setSending(true);
    const phone = `+91${national}`;
    const result = await auth.requestCode(phone);
    setSending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setPendingPhone(phone);
    router.push('/otp');
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen contentStyle={{ justifyContent: 'center' }}>
        <View style={{ maxWidth: 420, width: '100%', alignSelf: 'center', gap: 16 }}>
          <Text variant="title" accessibilityRole="header">
            Sign in
          </Text>
          <Text tone="textMuted">
            Enter your mobile number. We will send you a 6-digit code to sign in.
          </Text>
          <PhoneField
            value={national}
            onChangeText={(v) => {
              setNational(v);
              if (error) setError(undefined);
            }}
            error={error}
            editable={!sending}
            autoFocus
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          <Button title="Send code" onPress={submit} loading={sending} fullWidth />
        </View>
      </Screen>
      <PublicFooter />
    </View>
  );
}
