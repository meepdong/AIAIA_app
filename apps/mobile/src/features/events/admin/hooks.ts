import type { EventCapability, EventInput, EventPatch } from '@aiaia/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEventsApi } from '../hooks';

export function useAdminEvents() {
  const api = useEventsApi();
  return useQuery({ queryKey: ['events', 'admin-list'], queryFn: () => api.listAdminEvents() });
}

export function useBranches() {
  const api = useEventsApi();
  return useQuery({ queryKey: ['events', 'branches'], queryFn: () => api.listBranches() });
}

export function useAttendees(eventId: string) {
  const api = useEventsApi();
  return useQuery({
    queryKey: ['events', 'attendees', eventId],
    queryFn: () => api.attendees(eventId),
  });
}

export function useTeam(eventId: string) {
  const api = useEventsApi();
  return useQuery({ queryKey: ['events', 'team', eventId], queryFn: () => api.team(eventId) });
}

export function useMemberSearch(q: string) {
  const api = useEventsApi();
  return useQuery({
    queryKey: ['events', 'member-search', q],
    queryFn: () => api.searchMembers(q),
    enabled: q.trim().length >= 2,
  });
}

export function useCreateEvent() {
  const api = useEventsApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EventInput) => api.createEvent(input),
    onSettled: () => qc.invalidateQueries({ queryKey: ['events'] }),
  });
}

export function useUpdateEvent(eventId: string) {
  const api = useEventsApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: EventPatch) => api.updateEvent(eventId, patch),
    onSettled: () => qc.invalidateQueries({ queryKey: ['events'] }),
  });
}

export function useSetStaff(eventId: string) {
  const api = useEventsApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { memberId: string; capabilities: EventCapability[] }) =>
      api.setStaff(eventId, v.memberId, v.capabilities),
    onSettled: () => qc.invalidateQueries({ queryKey: ['events', 'team', eventId] }),
  });
}

export function useRemoveStaff(eventId: string) {
  const api = useEventsApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => api.removeStaff(eventId, memberId),
    onSettled: () => qc.invalidateQueries({ queryKey: ['events', 'team', eventId] }),
  });
}
