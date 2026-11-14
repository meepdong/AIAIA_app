import type { ListEventsOptions } from '@aiaia/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/features/auth/useApi';

export function useEventsApi() {
  return useApi().events;
}

export function useMyMember() {
  const api = useEventsApi();
  return useQuery({ queryKey: ['events', 'me'], queryFn: () => api.myMember() });
}

export function useDependents() {
  const api = useEventsApi();
  return useQuery({ queryKey: ['events', 'dependents'], queryFn: () => api.myDependents() });
}

export function useEventList(opts: ListEventsOptions) {
  const api = useEventsApi();
  return useQuery({
    queryKey: ['events', 'list', opts],
    queryFn: () => api.listEvents(opts),
  });
}

export function useEvent(id: string) {
  const api = useEventsApi();
  return useQuery({ queryKey: ['events', 'one', id], queryFn: () => api.getEvent(id) });
}

export function useSpots(eventIds: string[]) {
  const api = useEventsApi();
  return useQuery({
    queryKey: ['events', 'spots', eventIds],
    queryFn: () => api.spots(eventIds),
    enabled: eventIds.length > 0,
  });
}

export function useRsvps(memberIds: string[], eventIds?: string[]) {
  const api = useEventsApi();
  return useQuery({
    queryKey: ['events', 'rsvps', memberIds, eventIds ?? null],
    queryFn: () => api.rsvpsFor(memberIds, eventIds),
    enabled: memberIds.length > 0,
  });
}

export function useMyDuties() {
  const api = useEventsApi();
  return useQuery({ queryKey: ['events', 'duties'], queryFn: () => api.myDuties() });
}

export function useRsvpMutation(eventId: string) {
  const api = useEventsApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { memberId: string; status: 'going' | 'cancelled' }) =>
      api.rsvp(eventId, v.memberId, v.status),
    // Spots, cards and the panel all depend on the result, so refresh every events query.
    onSettled: () => qc.invalidateQueries({ queryKey: ['events'] }),
  });
}
