import type { InfoRequest } from '@aiaia/api';
import type { MyProfileResult } from '@aiaia/shared/src/schemas/membership';
import { Button, Card, Screen, Text } from '@aiaia/ui';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { useApi } from '@/features/auth/useApi';
import { SignOutButton } from '@/features/auth/SignOutButton';
import { homeRouteFor, useRefreshMembership } from '@/lib/session';
import { ProfileSetupScreen } from './ProfileSetupScreen';
import { draftFromProfile } from './form';

/** How often a waiting applicant's status is re-read while the app is in the foreground. */
export const WAITING_POLL_MS = 60_000;

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <Text>
      <Text bold>{label}: </Text>
      {value}
    </Text>
  );
}

/** Pending applicants: status, what they sent (editable), approver questions, auto-advance. */
export function WaitingRoomScreen() {
  const { profile } = useApi();
  const router = useRouter();
  const refreshMembership = useRefreshMembership();
  const [data, setData] = useState<MyProfileResult | null>(null);
  const [requests, setRequests] = useState<InfoRequest[]>([]);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const [mine, asked] = await Promise.all([profile.myProfile(), profile.infoRequests()]);
    if (mine.ok) {
      setData(mine.profile);
      setFailed(false);
    } else {
      setFailed(true);
    }
    if (asked.ok) setRequests(asked.items);
  }, [profile]);

  const check = useCallback(async () => {
    const state = await refreshMembership();
    if (state && state !== 'pending') {
      router.replace(homeRouteFor(state) as Href);
      return;
    }
    await load();
  }, [refreshMembership, router, load]);

  useEffect(() => {
    void Promise.resolve().then(load);
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      stop();
      timer = setInterval(() => void check(), WAITING_POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    if (AppState.currentState !== 'background') start();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void check();
        start();
      } else {
        stop();
      }
    });
    return () => {
      stop();
      sub?.remove();
    };
  }, [load, check]);

  if (editing && data) {
    return (
      <ProfileSetupScreen
        heading="Edit your application"
        initial={draftFromProfile(data)}
        onCancel={() => setEditing(false)}
        onDone={async () => {
          setEditing(false);
          await load();
        }}
      />
    );
  }

  const member = data?.member;
  const priv = data?.private;
  return (
    <Screen>
      <View style={{ maxWidth: 520, width: '100%', alignSelf: 'center', gap: 16 }}>
        <Text variant="title" accessibilityRole="header">
          Waiting room
        </Text>
        <Text>Your application is with your branch. We will let you know when it is approved.</Text>
        {failed ? (
          <Text tone="danger">
            Could not refresh your status. We will keep trying while the app is open.
          </Text>
        ) : null}

        {requests.map((r) => (
          <Card key={r.id}>
            <Text bold>An officer has asked for more information</Text>
            <Text>{r.message}</Text>
          </Card>
        ))}

        {member ? (
          <Card>
            <Text variant="label" bold>
              What you submitted
            </Text>
            <Row label="Name" value={member.full_name} />
            <Row label="Date of birth" value={priv?.dob} />
            <Row label="City" value={member.city} />
            <Row label="Occupation" value={member.occupation} />
            <Row label="Education" value={member.education} />
            <Row label="Emergency contact" value={priv?.emergency_contact_name} />
            <Row label="Email" value={priv?.email} />
          </Card>
        ) : null}

        {member ? (
          <Button
            title="Edit my application"
            variant="secondary"
            onPress={() => setEditing(true)}
          />
        ) : null}
        <Button title="Check now" variant="ghost" onPress={() => void check()} />
        <SignOutButton />
      </View>
    </Screen>
  );
}
