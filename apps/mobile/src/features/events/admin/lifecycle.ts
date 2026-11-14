import type { EventPatch, EventRow } from '@aiaia/api';

export const publishPatch = (): EventPatch => ({ status: 'published' });
export const cancelPatch = (): EventPatch => ({ status: 'cancelled' });
/** There is no `completed` status. Completing an event that has started ends it now. */
export const completePatch = (now: Date = new Date()): EventPatch => ({
  ends_at: now.toISOString(),
});

export type LifecycleActions = { publish: boolean; cancel: boolean; complete: boolean };

/**
 * Draft: publish. Published: cancel, and complete once it has started and not yet ended.
 * A published event cannot go back to draft (the table refuses it).
 */
export function lifecycleActions(
  e: Pick<EventRow, 'status' | 'starts_at' | 'ends_at'>,
  now: Date = new Date(),
): LifecycleActions {
  const t = now.getTime();
  return {
    publish: e.status === 'draft',
    cancel: e.status === 'published',
    complete:
      e.status === 'published' &&
      new Date(e.starts_at).getTime() <= t &&
      new Date(e.ends_at).getTime() > t,
  };
}
