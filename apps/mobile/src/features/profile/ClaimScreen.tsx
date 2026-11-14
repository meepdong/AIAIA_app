import { Button, Screen, Text, TextField } from '@aiaia/ui';
import { useRouter, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useApi } from '@/features/auth/useApi';
import { homeRouteFor, useRefreshMembership } from '@/lib/session';

const CODE_LENGTH = 8;

/** "Have a family code?": a guardian-issued code links this login to an existing profile. */
export function ClaimScreen() {
  const { profile } = useApi();
  const router = useRouter();
  const refreshMembership = useRefreshMembership();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const inFlight = useRef(false);

  const submit = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    const result = await profile.graduateDependent(code);
    if (!result.ok) {
      inFlight.current = false;
      setBusy(false);
      setError(result.message);
      return;
    }
    const state = await refreshMembership();
    if (!state) {
      // The read failed: stay here. The session's own retry moves the user on.
      setReconnecting(true);
      return;
    }
    inFlight.current = false;
    setBusy(false);
    router.replace(homeRouteFor(state) as Href);
  };

  return (
    <Screen contentStyle={{ justifyContent: 'center' }}>
      <View style={{ maxWidth: 420, width: '100%', alignSelf: 'center', gap: 16 }}>
        <Text variant="title" accessibilityRole="header">
          Have a family code?
        </Text>
        <Text tone="textMuted">
          A parent or guardian can give you a code to take over your own login. Enter the{' '}
          {CODE_LENGTH} letters and numbers here.
        </Text>
        <TextField
          label="Family code"
          value={code}
          onChangeText={(text) => {
            setCode(
              text
                .replace(/[^a-zA-Z0-9]/g, '')
                .toUpperCase()
                .slice(0, CODE_LENGTH),
            );
            if (error) setError(undefined);
          }}
          error={error}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={CODE_LENGTH}
          editable={!busy}
        />
        {reconnecting ? <Text accessibilityLiveRegion="polite">Saved. Reconnecting…</Text> : null}
        <Button
          title="Use this code"
          onPress={submit}
          loading={busy}
          disabled={code.length !== CODE_LENGTH}
          fullWidth
        />
        <Button
          title="No code, set up my profile"
          variant="ghost"
          onPress={() => router.replace('/profile-setup')}
          fullWidth
        />
      </View>
    </Screen>
  );
}
