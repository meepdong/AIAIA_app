import { Button, DateField, PhoneField, Screen, Select, Text, TextField } from '@aiaia/ui';
import { Link, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Switch, View } from 'react-native';
import { useApi } from '@/features/auth/useApi';
import { useRefreshMembership } from '@/lib/session';
import { AGE_COPY, isMinorDob } from './age';
import { clearDraft, loadDraft, saveDraft } from './draft-store';
import {
  LAST_STEP,
  STEPS,
  bandOf,
  emptyDraft,
  firstInvalidStep,
  toPayload,
  validateStep,
  type FieldErrors,
  type PrivacyKey,
  type ProfileDraft,
} from './form';

export const GENDERS = [
  { label: 'Female', value: 'female' },
  { label: 'Male', value: 'male' },
  { label: 'Non-binary', value: 'non_binary' },
  { label: 'Prefer not to say', value: 'prefer_not_to_say' },
] as const;

export const PRIVACY_TOGGLES: { key: PrivacyKey; label: string }[] = [
  { key: 'show_phone', label: 'Show my phone number to other members' },
  { key: 'show_email', label: 'Show my email to other members' },
  { key: 'show_city', label: 'Show my city in the directory' },
  { key: 'show_occupation', label: 'Show my occupation in the directory' },
  { key: 'show_photo', label: 'Show my photo in the directory' },
];

/** A minor's phone and email are never shown to other members, so the toggles are not offered. */
export function privacyTogglesFor(dob: string | null | undefined) {
  if (!isMinorDob(dob)) return PRIVACY_TOGGLES;
  return PRIVACY_TOGGLES.filter(({ key }) => key !== 'show_phone' && key !== 'show_email');
}

/** The 10-digit India field, or a plain field when a stored number is a full +E.164 one. */
export function EmergencyPhoneField({
  value,
  onChangeText,
  error,
}: {
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
}) {
  if (value.startsWith('+')) {
    return (
      <TextField
        label="Emergency contact number"
        value={value}
        onChangeText={(text) => onChangeText(text.replace(/[^\d+]/g, ''))}
        keyboardType="phone-pad"
        error={error}
      />
    );
  }
  return (
    <PhoneField
      label="Emergency contact number"
      value={value}
      onChangeText={onChangeText}
      error={error}
    />
  );
}

export function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text style={{ flex: 1 }}>{label}</Text>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} />
    </View>
  );
}

/** Profile setup: four steps, with the draft kept on the device until the application is sent. */
export function ProfileSetupScreen({
  initial,
  onDone,
  heading = 'Set up your profile',
  onCancel,
}: {
  /** Edit an existing application (waiting room): no device draft, `onDone` runs after a save. */
  initial?: ProfileDraft;
  onDone?: () => void | Promise<void>;
  heading?: string;
  onCancel?: () => void;
} = {}) {
  const { profile, directory } = useApi();
  const router = useRouter();
  const refreshMembership = useRefreshMembership();
  const [draft, setDraft] = useState<ProfileDraft>(() => initial ?? emptyDraft());
  const [ready, setReady] = useState(Boolean(initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [branches, setBranches] = useState<{ label: string; value: string }[]>([]);
  const [branchError, setBranchError] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const owner = useRef<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let live = true;
    if (!initial)
      void (async () => {
        owner.current = await profile.userId();
        const saved = owner.current ? await loadDraft(owner.current) : null;
        if (!live) return;
        if (saved) setDraft(saved);
        setReady(true);
      })();
    directory
      .branches()
      .then((rows) => live && setBranches(rows.map((b) => ({ label: b.name, value: b.id }))))
      .catch(() => live && setBranchError(true));
    return () => {
      live = false;
    };
  }, [profile, directory, initial]);

  const update = useCallback((patch: Partial<ProfileDraft>) => {
    setDraft((current) => {
      const next = { ...current, ...patch };
      if (owner.current) void saveDraft(owner.current, next);
      return next;
    });
    setErrors({});
    setSubmitError(undefined);
  }, []);

  const band = bandOf(draft);
  const ageNote = band ? AGE_COPY[band] : null;
  const step = draft.step;

  const next = () => {
    const found = validateStep(step, draft);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    update({ step: step + 1 });
  };

  const submit = async () => {
    if (busy.current) return;
    const bad = firstInvalidStep(draft);
    if (bad !== null) {
      update({ step: bad });
      setErrors(validateStep(bad, draft));
      return;
    }
    busy.current = true;
    setSubmitting(true);
    setSubmitError(undefined);
    const result = await profile.submitApplication(toPayload(draft));
    busy.current = false;
    setSubmitting(false);
    if (!result.ok) {
      setSubmitError(result.message);
      return;
    }
    if (onDone) {
      await onDone();
      return;
    }
    await clearDraft();
    const state = await refreshMembership();
    if (!state) {
      // The read failed: stay here. The session's own retry moves the user on.
      setReconnecting(true);
      setSubmitting(true);
      return;
    }
    router.replace('/waiting-room');
  };

  if (!ready) return <Screen>{null}</Screen>;

  return (
    <Screen>
      <View style={{ maxWidth: 520, width: '100%', alignSelf: 'center', gap: 16 }}>
        <Text variant="title" accessibilityRole="header">
          {heading}
        </Text>
        <Text tone="textMuted">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </Text>

        {step === 0 ? (
          <>
            <TextField
              label="Full name"
              value={draft.fullName}
              onChangeText={(fullName) => update({ fullName })}
              error={errors.fullName}
              autoComplete="name"
            />
            <Select
              label="Branch"
              options={branches}
              value={draft.branchId}
              onChange={(branchId) => update({ branchId })}
              placeholder={branchError ? 'Could not load branches' : 'Choose your branch'}
              error={errors.branchId}
            />
            <DateField
              label="Date of birth"
              value={draft.dob}
              onChange={(dob) => update({ dob })}
              error={errors.dob}
            />
            {ageNote ? (
              <Text tone={band === 'blocked' ? 'danger' : 'textMuted'}>{ageNote}</Text>
            ) : null}
            <Select
              label="Gender (optional)"
              options={GENDERS}
              value={draft.gender}
              onChange={(gender) => update({ gender })}
              placeholder="Prefer not to say"
              error={errors.gender}
            />
            <Link href="/claim" accessibilityRole="link">
              <Text tone="textMuted">Have a family code?</Text>
            </Link>
          </>
        ) : null}

        {step === 1 ? (
          <>
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
            <EmergencyPhoneField
              value={draft.emergencyPhone}
              onChangeText={(emergencyPhone) => update({ emergencyPhone })}
              error={errors.emergencyPhone}
            />
            <TextField
              label="Email (optional)"
              hint="For receipts and updates; you can add it later"
              value={draft.email}
              onChangeText={(email) => update({ email })}
              error={errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text>A profile photo is optional.</Text>
            <Text tone="textMuted">Photo upload is coming soon. You can add one later.</Text>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Link href="/privacy" accessibilityRole="link">
              <Text tone="textMuted">Read the privacy notice</Text>
            </Link>
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
            <Text variant="label" bold>
              Directory visibility
            </Text>
            {privacyTogglesFor(draft.dob).map(({ key, label }) => (
              <ToggleRow
                key={key}
                label={label}
                value={draft.privacy[key]}
                onChange={(value) => update({ privacy: { ...draft.privacy, [key]: value } })}
              />
            ))}
            {ageNote && band !== 'blocked' ? <Text tone="textMuted">{ageNote}</Text> : null}
            {reconnecting ? (
              <Text accessibilityLiveRegion="polite">Saved. Reconnecting…</Text>
            ) : null}
            {submitError ? (
              <Text tone="danger" accessibilityLiveRegion="polite">
                {submitError}
              </Text>
            ) : null}
          </>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 12 }}>
          {step > 0 ? (
            <Button
              title="Back"
              variant="secondary"
              onPress={() => update({ step: step - 1 })}
              disabled={submitting}
            />
          ) : null}
          {onCancel ? (
            <Button title="Cancel" variant="ghost" onPress={onCancel} disabled={submitting} />
          ) : null}
          {step < LAST_STEP ? (
            <Button title="Next" onPress={next} />
          ) : (
            <Button title="Submit application" onPress={submit} loading={submitting} />
          )}
        </View>
      </View>
    </Screen>
  );
}
