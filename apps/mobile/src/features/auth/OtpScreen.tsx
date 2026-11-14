import { Button, OtpField, Screen, Text } from '@aiaia/ui';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { formatPhone, getPendingPhone, setPendingPhone } from './pending-phone';
import { useApi } from './useApi';

export const RESEND_SECONDS = 30;

export function OtpScreen() {
  const { auth } = useApi();
  const router = useRouter();
  const [phone] = useState(getPendingPhone);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const busy = useRef(false);

  // No number in memory (a reload, or a direct link): start again.
  useEffect(() => {
    if (!phone) router.replace('/phone');
  }, [phone, router]);

  const counting = seconds > 0;
  useEffect(() => {
    if (!counting) return;
    const timer = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [counting]);

  const verify = useCallback(
    async (token: string) => {
      if (!phone || busy.current) return;
      busy.current = true;
      setVerifying(true);
      setError(undefined);
      const result = await auth.verifyCode(phone, token);
      busy.current = false;
      setVerifying(false);
      if (!result.ok) {
        setError(result.message);
        setCode('');
      }
      // On success the session change flips the auth gate; nothing to navigate to here.
    },
    [auth, phone],
  );

  const resend = async () => {
    if (!phone || seconds > 0 || resending) return;
    setResending(true);
    setError(undefined);
    const result = await auth.requestCode(phone);
    setResending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setCode('');
    setSeconds(RESEND_SECONDS);
  };

  const changeNumber = () => {
    setPendingPhone(null);
    router.replace('/phone');
  };

  if (!phone) return null;

  return (
    <Screen contentStyle={{ justifyContent: 'center' }}>
      <View style={{ maxWidth: 420, width: '100%', alignSelf: 'center', gap: 16 }}>
        <Text variant="title" accessibilityRole="header">
          Enter the code
        </Text>
        <Text tone="textMuted">We sent a 6-digit code to {formatPhone(phone)}.</Text>
        <OtpField
          value={code}
          onChangeText={(c) => {
            setCode(c);
            if (error) setError(undefined);
          }}
          onComplete={verify}
          error={error}
          disabled={verifying}
          autoFocus
        />
        <Button
          title={seconds > 0 ? `Resend code in ${seconds}s` : 'Resend code'}
          variant="secondary"
          disabled={seconds > 0 || verifying}
          loading={resending}
          onPress={resend}
          fullWidth
        />
        <Button title="Change number" variant="ghost" onPress={changeNumber} fullWidth />
      </View>
    </Screen>
  );
}
