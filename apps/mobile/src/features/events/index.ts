export { EventsList } from './EventsList';
export { EventDetail } from './EventDetail';
export { MyDuties } from './MyDuties';

/** Tab registry entry. The (app) layout adds one line for it when P1-05's Tabs layout lands. */
export const eventsTab = { name: 'events/index', title: 'Events' } as const;
export { AdminEventsList, AdminEventDetail, NewEvent } from './admin';

/**
 * Admin nav entry. Registered in `adminNav` when P1-04 merges. The admin routes live under
 * `/events/manage` because `/events` is the member list. Shown to holders of either permission.
 */
export const eventsAdminNav = {
  key: 'events',
  label: 'Events',
  href: '/events/manage',
  anyOf: ['events.national', 'events.branch'],
} as const;
