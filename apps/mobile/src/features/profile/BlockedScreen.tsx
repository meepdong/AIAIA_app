import { Card, Screen, Text } from '@aiaia/ui';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useApi } from '@/features/auth/useApi';
import { SignOutButton } from '@/features/auth/SignOutButton';

export type Grievance = {
  title: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const PHONE = /^\+?[0-9][0-9 ()-]{4,18}$/;

/** Reads the public `grievance_officer` setting defensively; anything else is ignored. */
export function parseGrievance(value: unknown): Grievance | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.title !== 'string') return null;
  const text = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : null);
  return { title: v.title, name: text(v.name), email: text(v.email), phone: text(v.phone) };
}

/** The links are built here from validated text; the stored value is never used as a URL. */
export const mailtoFor = (email: string | null) =>
  email && EMAIL.test(email) ? `mailto:${email}` : null;
export const telFor = (phone: string | null) =>
  phone && PHONE.test(phone) ? `tel:${phone.replace(/[^0-9+]/g, '')}` : null;

function LinkText({ label, url }: { label: string; url: string | null }) {
  if (!url) return <Text>{label}</Text>;
  return (
    <Text accessibilityRole="link" tone="text" onPress={() => void Linking.openURL(url)}>
      {label}
    </Text>
  );
}

/** Rejected, suspended and deleted accounts: the reason and who to contact. */
export function BlockedScreen() {
  const { profile, settings } = useApi();
  const [status, setStatus] = useState<string>();
  const [reason, setReason] = useState<string | null>(null);
  const [grievance, setGrievance] = useState<Grievance | null>(null);

  useEffect(() => {
    let live = true;
    void profile.myProfile().then((r) => {
      if (!live || !r.ok || !r.profile) return;
      setStatus(r.profile.member.status);
      setReason(r.profile.member.status_reason);
    });
    void settings.getSetting('grievance_officer').then((r) => {
      if (live && r.ok) setGrievance(parseGrievance(r.value));
    });
    return () => {
      live = false;
    };
  }, [profile, settings]);

  const headline =
    status === 'rejected'
      ? 'Your application was not approved'
      : status === 'deleted'
        ? 'This account was deleted'
        : 'Your account is suspended';

  return (
    <Screen>
      <View style={{ maxWidth: 520, width: '100%', alignSelf: 'center', gap: 16 }}>
        <Text variant="title" accessibilityRole="header">
          {headline}
        </Text>
        {status && status !== 'deleted' && reason ? (
          <Card>
            <Text bold>Reason</Text>
            <Text>{reason}</Text>
          </Card>
        ) : null}
        {status === 'deleted' ? (
          <Text>Changed your mind? Contact support within 6 months.</Text>
        ) : null}
        {grievance ? (
          <Card>
            <Text bold>{grievance.title}</Text>
            {grievance.name ? <Text>{grievance.name}</Text> : null}
            {grievance.email ? (
              <LinkText label={grievance.email} url={mailtoFor(grievance.email)} />
            ) : null}
            {grievance.phone ? (
              <LinkText label={grievance.phone} url={telFor(grievance.phone)} />
            ) : null}
          </Card>
        ) : null}
        <SignOutButton />
      </View>
    </Screen>
  );
}
