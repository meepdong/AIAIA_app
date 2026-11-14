import type { MyProfileResult } from '@aiaia/shared/src/schemas/membership';
import { Button, PhoneField, Screen, Select, Text, TextField } from '@aiaia/ui';
import { Link, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useApi } from '@/features/auth/useApi';
import { SignOutButton } from '@/features/auth/SignOutButton';
import { toUpdateInput, validateEdit } from './edit';
import { canSeeFamily } from './family';
import { draftFromProfile, type FieldErrors, type ProfileDraft } from './form';
import { GENDERS, PRIVACY_TOGGLES, ToggleRow } from './ProfileSetupScreen';

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <Text>
      <Text bold>{label}: </Text>
      {value}
    </Text>
  );
}

/** My profile: edit the allowed fields, directory privacy and opt-ins. Email, DOB and branch are read-only. */
export function MyProfileScreen() {
  const { profile, directory } = useApi();
  const [data, setData] = useState<MyProfileResult | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [branchName, setBranchName] = useState<string>();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loadError, setLoadError] = useState<string>();
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string }>();
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const result = await profile.myProfile();
    if (!result.ok || !result.profile) {
      setLoadError(result.ok ? 'Could not load your profile.' : result.message);
      return;
    }
    setLoadError(undefined);
    setData(result.profile);
    setDraft(draftFromProfile(result.profile));
  }, [profile]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  useEffect(() => {
    if (!data) return;
    let live = true;
    directory
      .branches()
      .then((rows) => {
        if (live) setBranchName(rows.find((b) => b.id === data.member.branch_id)?.name);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [directory, data]);

  const update = (patch: Partial<ProfileDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setErrors({});
    setMessage(undefined);
  };

  const save = async () => {
    if (!draft || !data || saving) return;
    const found = validateEdit(draft);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    setSaving(true);
    setMessage(undefined);
    const result = await profile.updateProfile(toUpdateInput(draft, data.member.id));
    setSaving(false);
    if (!result.ok) {
      setMessage({ tone: 'danger', text: result.message });
      return;
    }
    setMessage({ tone: 'success', text: 'Your profile is saved.' });
    await load();
  };

  if (!draft || !data) {
    return (
      <Screen>
        <View style={{ maxWidth: 520, width: '100%', alignSelf: 'center', gap: 16 }}>
          <Text variant="title" accessibilityRole="header">
            My profile
          </Text>
          {loadError ? (
            <>
              <Text tone="danger" accessibilityLiveRegion="polite">
                {loadError}
              </Text>
              <Button title="Try again" variant="secondary" onPress={() => void load()} />
            </>
          ) : (
            <Text tone="textMuted">Loading…</Text>
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ maxWidth: 520, width: '100%', alignSelf: 'center', gap: 16 }}>
        <Text variant="title" accessibilityRole="header">
          My profile
        </Text>

        <ReadOnlyRow label="Email" value={data.private?.email ?? 'Not added'} />
        <ReadOnlyRow label="Date of birth" value={data.private?.dob ?? 'Not added'} />
        {branchName ? <ReadOnlyRow label="Branch" value={branchName} /> : null}
        <Text tone="textMuted">
          To change your email, date of birth or branch, ask your branch officer.
        </Text>

        <TextField
          label="Full name"
          value={draft.fullName}
          onChangeText={(fullName) => update({ fullName })}
          error={errors.fullName}
          autoComplete="name"
        />
        <Select
          label="Gender (optional)"
          options={GENDERS}
          value={draft.gender}
          onChange={(gender) => update({ gender })}
          placeholder="Prefer not to say"
          error={errors.gender}
        />
        <TextField
          label="City"
          value={draft.city}
          onChangeText={(city) => update({ city })}
          error={errors.city}
        />
        <TextField
          label="Occupation"
          value={draft.occupation}
          onChangeText={(occupation) => update({ occupation })}
          error={errors.occupation}
        />
        <TextField
          label="Education"
          value={draft.education}
          onChangeText={(education) => update({ education })}
          error={errors.education}
        />
        <TextField
          label="Emergency contact name"
          value={draft.emergencyName}
          onChangeText={(emergencyName) => update({ emergencyName })}
          error={errors.emergencyName}
        />
        <PhoneField
          label="Emergency contact number"
          value={draft.emergencyPhone}
          onChangeText={(emergencyPhone) => update({ emergencyPhone })}
          error={errors.emergencyPhone}
        />

        <Text variant="heading" accessibilityRole="header">
          Updates and privacy
        </Text>
        <ToggleRow
          label="Send me updates on WhatsApp"
          value={draft.whatsappOptIn}
          onChange={(whatsappOptIn) => update({ whatsappOptIn })}
        />
        <ToggleRow
          label="Send me updates by email"
          value={draft.emailUpdatesOptIn}
          onChange={(emailUpdatesOptIn) => update({ emailUpdatesOptIn })}
        />
        {PRIVACY_TOGGLES.map(({ key, label }) => (
          <ToggleRow
            key={key}
            label={label}
            value={draft.privacy[key]}
            onChange={(value) => update({ privacy: { ...draft.privacy, [key]: value } })}
          />
        ))}

        {message ? (
          <Text
            tone={message.tone}
            accessibilityLiveRegion="polite"
            accessibilityRole={message.tone === 'danger' ? 'alert' : undefined}
          >
            {message.text}
          </Text>
        ) : null}
        <Button title="Save changes" onPress={save} loading={saving} fullWidth />

        <Link href={'/pass' as Href} accessibilityRole="link">
          <Text>My pass</Text>
        </Link>
        {canSeeFamily(data) ? (
          <Link href={'/profile/family' as Href} accessibilityRole="link">
            <Text>My family</Text>
          </Link>
        ) : null}
        <Link href="/privacy" accessibilityRole="link">
          <Text tone="textMuted">Privacy notice</Text>
        </Link>
        <SignOutButton />
      </View>
    </Screen>
  );
}
