import type { PrivacyFlags } from '@aiaia/shared/src/schemas/membership';
import { Button, Screen, Text } from '@aiaia/ui';
import { Link, useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useApi } from '@/features/auth/useApi';
import { homeRouteFor, useRefreshMembership } from '@/lib/session';
import { DEFAULT_PRIVACY, type PrivacyKey } from './form';
import { PRIVACY_TOGGLES, ToggleRow } from './ProfileSetupScreen';

/** The 18th-birthday handover: the member reviews their settings, then accepts the account. */
export function AdultConsentScreen() {
  const { profile } = useApi();
  const router = useRouter();
  const refreshMembership = useRefreshMembership();
  const [privacy, setPrivacy] = useState<Record<PrivacyKey, boolean> | null>(null);
  const [whatsapp, setWhatsapp] = useState(false);
  const [emailUpdates, setEmailUpdates] = useState(false);
  const [error, setError] = useState<string>();
  const [reconnecting, setReconnecting] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void profile.myProfile().then((r) => {
      if (!live) return;
      if (!r.ok || !r.profile) {
        setError(r.ok ? 'Could not load your settings.' : r.message);
        return;
      }
      const saved = (r.profile.member.privacy ?? {}) as PrivacyFlags;
      const next = { ...DEFAULT_PRIVACY };
      for (const k of Object.keys(next) as PrivacyKey[]) {
        if (typeof saved[k] === 'boolean') next[k] = saved[k] as boolean;
      }
      const prefs = (r.profile.private?.notify_prefs ?? {}) as Record<string, unknown>;
      setPrivacy(next);
      setWhatsapp(prefs.whatsapp === true);
      setEmailUpdates(prefs.email_updates === true);
    });
    return () => {
      live = false;
    };
  }, [profile]);

  const accept = async () => {
    if (!privacy || busy) return;
    setBusy(true);
    setError(undefined);
    const result = await profile.giveAdultConsent({
      whatsapp_opt_in: whatsapp,
      email_updates_opt_in: emailUpdates,
      privacy,
    });
    if (!result.ok) {
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
    setBusy(false);
    router.replace(homeRouteFor(state) as Href);
  };

  return (
    <Screen>
      <View style={{ maxWidth: 520, width: '100%', alignSelf: 'center', gap: 16 }}>
        <Text variant="title" accessibilityRole="header">
          You are 18
        </Text>
        <Text>You&apos;re 18, so your AIAIA account is now fully yours.</Text>
        <Link href="/privacy" accessibilityRole="link">
          <Text tone="textMuted">Read the privacy notice</Text>
        </Link>
        <Text tone="textMuted">
          These are your current settings. Change anything you like, then accept.
        </Text>
        {privacy ? (
          <>
            <ToggleRow
              label="Send me updates on WhatsApp"
              value={whatsapp}
              onChange={setWhatsapp}
            />
            <ToggleRow
              label="Send me updates by email"
              value={emailUpdates}
              onChange={setEmailUpdates}
            />
            {PRIVACY_TOGGLES.map(({ key, label }) => (
              <ToggleRow
                key={key}
                label={label}
                value={privacy[key]}
                onChange={(value) => setPrivacy({ ...privacy, [key]: value })}
              />
            ))}
          </>
        ) : null}
        {error ? (
          <Text tone="danger" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        {reconnecting ? <Text accessibilityLiveRegion="polite">Saved. Reconnecting…</Text> : null}
        <Button title="Accept" onPress={accept} loading={busy} disabled={!privacy} fullWidth />
        <Text tone="textMuted">Download my data: coming soon.</Text>
        <Link href="/delete-account" accessibilityRole="link">
          <Text tone="textMuted">Delete my account</Text>
        </Link>
      </View>
    </Screen>
  );
}
