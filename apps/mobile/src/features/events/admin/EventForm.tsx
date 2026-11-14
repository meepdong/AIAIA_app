import type { EventAudience, EventRow } from '@aiaia/api';
import { Button, Select, Text, TextField, toast } from '@aiaia/ui';
import { useState } from 'react';
import { View } from 'react-native';
import {
  EMPTY_FORM,
  formFromEvent,
  validateEventForm,
  type EventFormErrors,
  type EventFormValues,
} from './form';
import { useSpots } from '../hooks';
import { useBranches, useCreateEvent, useUpdateEvent } from './hooks';

const SCOPES = [
  { value: 'national', label: 'National' },
  { value: 'branch', label: 'Branch' },
] as const;

const AUDIENCES: { value: EventAudience; label: string }[] = [
  { value: 'youth', label: 'Youth' },
  { value: 'aiaia', label: 'AIAIA' },
  { value: 'all', label: 'Everyone' },
];

/** Create (no `event`) or edit. Dates are typed in Asia/Kolkata time. */
export function EventForm({
  event,
  onSaved,
  onCancel,
}: {
  event?: EventRow;
  onSaved: (saved: EventRow) => void;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<EventFormValues>(event ? formFromEvent(event) : EMPTY_FORM);
  const [errors, setErrors] = useState<EventFormErrors>({});
  const branches = useBranches();
  const create = useCreateEvent();
  const update = useUpdateEvent(event?.id ?? '');
  const saving = create.isPending || update.isPending;
  const spots = useSpots(event ? [event.id] : []);
  const counts = spots.data?.find((s) => s.event_id === event?.id);
  const registered = (counts?.going ?? 0) + (counts?.waitlisted ?? 0);
  // Scope, branch and audience decide who may see and join the event, so they are fixed once
  // people could have registered.
  const locked = Boolean(event) && (event?.status === 'published' || registered > 0);
  const lockReason = 'Locked: the event is published or has registrations.';
  const capacityNum = values.capacity.trim() === '' ? null : Number(values.capacity);
  const capacityBelowGoing =
    Boolean(event) &&
    capacityNum != null &&
    Number.isInteger(capacityNum) &&
    capacityNum < (counts?.going ?? 0);

  const set = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  function submit() {
    const result = validateEventForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    const done = {
      onSuccess: (saved: EventRow) => {
        toast.success(event ? 'Event saved' : 'Draft created');
        onSaved(saved);
      },
      onError: (e: unknown) =>
        toast.error(e instanceof Error ? e.message : 'Could not save the event'),
    };
    if (event) update.mutate(result.input, done);
    else create.mutate(result.input, done);
  }

  return (
    <View style={{ gap: 12 }}>
      <TextField
        label="Title"
        value={values.title}
        onChangeText={(t) => set('title', t)}
        error={errors.title}
      />
      <TextField
        label="Description"
        value={values.description}
        onChangeText={(t) => set('description', t)}
        multiline
        error={errors.description}
      />
      <Select
        label="Scope"
        options={SCOPES}
        value={values.scope}
        onChange={(s) => set('scope', s)}
        disabled={locked}
        hint={locked ? lockReason : undefined}
      />
      {values.scope === 'branch' ? (
        <Select
          label="Branch"
          placeholder="Choose a branch"
          options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
          value={values.branchId || null}
          onChange={(id) => set('branchId', id)}
          error={errors.branchId}
          disabled={locked}
          hint={locked ? lockReason : undefined}
        />
      ) : null}
      <Select
        label="Audience"
        options={AUDIENCES}
        value={values.audience}
        onChange={(a) => set('audience', a)}
        disabled={locked}
        hint={locked ? lockReason : undefined}
      />
      <TextField
        label="Starts (IST)"
        hint="YYYY-MM-DD HH:mm"
        value={values.startsAt}
        onChangeText={(t) => set('startsAt', t)}
        error={errors.startsAt}
        autoCapitalize="none"
      />
      <TextField
        label="Ends (IST)"
        hint="YYYY-MM-DD HH:mm"
        value={values.endsAt}
        onChangeText={(t) => set('endsAt', t)}
        error={errors.endsAt}
        autoCapitalize="none"
      />
      <TextField
        label="Venue name"
        value={values.venueName}
        onChangeText={(t) => set('venueName', t)}
        error={errors.venueName}
      />
      <TextField
        label="Venue address"
        value={values.venueAddress}
        onChangeText={(t) => set('venueAddress', t)}
        error={errors.venueAddress}
      />
      <TextField
        label="Map link"
        hint="Optional. Must start with https://"
        value={values.mapUrl}
        onChangeText={(t) => set('mapUrl', t)}
        error={errors.mapUrl}
        autoCapitalize="none"
        keyboardType="url"
      />
      <TextField
        label="Capacity"
        hint="Leave empty for no limit"
        value={values.capacity}
        onChangeText={(t) => set('capacity', t)}
        error={errors.capacity}
        keyboardType="number-pad"
      />
      {capacityBelowGoing ? (
        <Text tone="warning" accessibilityRole="alert">
          {`${counts?.going ?? 0} people are already going. Lowering capacity below that will not remove anyone.`}
        </Text>
      ) : null}
      <TextField
        label="Registration opens (IST)"
        hint="Optional. YYYY-MM-DD HH:mm"
        value={values.registrationOpensAt}
        onChangeText={(t) => set('registrationOpensAt', t)}
        error={errors.registrationOpensAt}
        autoCapitalize="none"
      />
      <TextField
        label="Registration closes (IST)"
        hint="Optional. At or before the start"
        value={values.registrationClosesAt}
        onChangeText={(t) => set('registrationClosesAt', t)}
        error={errors.registrationClosesAt}
        autoCapitalize="none"
      />
      {Object.keys(errors).length > 0 ? (
        <Text tone="danger" accessibilityRole="alert">
          Fix the fields marked above, then save again.
        </Text>
      ) : null}
      <Button title={event ? 'Save changes' : 'Create draft'} loading={saving} onPress={submit} />
      {onCancel ? <Button variant="secondary" title="Cancel" onPress={onCancel} /> : null}
    </View>
  );
}
