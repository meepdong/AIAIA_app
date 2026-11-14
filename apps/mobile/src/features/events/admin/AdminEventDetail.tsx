import type { EventPatch, EventRow } from '@aiaia/api';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Header,
  QueryState,
  Screen,
  Text,
  toast,
} from '@aiaia/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { CheckinEntry } from '@/features/checkin/CheckinEntry';
import { whenText } from '../helpers';
import { useEvent } from '../hooks';
import { AttendeesPanel } from './AttendeesPanel';
import { EventForm } from './EventForm';
import { useUpdateEvent } from './hooks';
import { cancelPatch, completePatch, lifecycleActions, publishPatch } from './lifecycle';
import { TeamPanel } from './TeamPanel';

const STATUS_TONE = { draft: 'neutral', published: 'success', cancelled: 'danger' } as const;
const STATUS_LABEL = { draft: 'Draft', published: 'Published', cancelled: 'Cancelled' } as const;

export function AdminEventDetail({ eventId }: { eventId: string }) {
  const router = useRouter();
  const event = useEvent(eventId);
  return (
    <Screen padded={false}>
      <Header title="Manage event" onBack={() => router.back()} />
      <View style={{ width: '100%', maxWidth: 960, alignSelf: 'center', padding: 16, gap: 16 }}>
        <QueryState
          query={event}
          isEmpty={(e) => e == null}
          emptyTitle="Event not found"
          emptyMessage="It may have been removed, or you cannot manage it."
        >
          {(e) => (e ? <Body event={e} /> : null)}
        </QueryState>
      </View>
    </Screen>
  );
}

function Body({ event }: { event: EventRow }) {
  const update = useUpdateEvent(event.id);
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const actions = lifecycleActions(event);
  const status = event.status as keyof typeof STATUS_TONE;

  function apply(patch: EventPatch, done: string, after?: () => void) {
    update.mutate(patch, {
      onSuccess: () => {
        toast.success(done);
        after?.();
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not update the event'),
    });
  }

  return (
    <>
      <Card>
        <Text variant="heading">{event.title}</Text>
        <Text tone="textMuted">{whenText(event)}</Text>
        <View style={{ flexDirection: 'row', marginTop: 6 }}>
          <Badge
            label={STATUS_LABEL[status] ?? event.status}
            tone={STATUS_TONE[status] ?? 'neutral'}
          />
        </View>
      </Card>

      <Card>
        <Text variant="heading">Status</Text>
        <View style={{ gap: 8, marginTop: 8 }}>
          {actions.publish ? (
            <Button
              title="Publish"
              loading={update.isPending}
              onPress={() => apply(publishPatch(), 'Event published')}
            />
          ) : null}
          {actions.complete ? (
            <Button
              variant="secondary"
              title="Mark as complete"
              loading={update.isPending}
              onPress={() => apply(completePatch(), 'Event marked complete')}
            />
          ) : null}
          {actions.cancel ? (
            <Button
              variant="secondary"
              title="Cancel event"
              onPress={() => setConfirmCancel(true)}
            />
          ) : null}
          {!actions.publish && !actions.cancel ? (
            <Text tone="textMuted">No status changes are available for this event.</Text>
          ) : null}
        </View>
      </Card>

      <ConfirmDialog
        visible={confirmCancel}
        destructive
        title="Cancel this event?"
        message="Everyone who registered is told right away. This cannot be undone."
        confirmLabel="Cancel event"
        cancelLabel="Keep event"
        loading={update.isPending}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => apply(cancelPatch(), 'Event cancelled', () => setConfirmCancel(false))}
      />

      <Card>
        <Text variant="heading">Details</Text>
        {editing ? (
          <View style={{ marginTop: 8 }}>
            <EventForm
              event={event}
              onSaved={() => setEditing(false)}
              onCancel={() => setEditing(false)}
            />
          </View>
        ) : (
          <View style={{ marginTop: 8 }}>
            <Button variant="secondary" title="Edit details" onPress={() => setEditing(true)} />
          </View>
        )}
      </Card>

      {event.status === 'published' ? <CheckinEntry eventId={event.id} /> : null}
      {event.status !== 'draft' ? <AttendeesPanel eventId={event.id} /> : null}
      <TeamPanel eventId={event.id} />
    </>
  );
}
