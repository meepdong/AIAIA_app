import { Redirect, type Href } from 'expo-router';
import { homeRouteFor, useSessionState } from '@/lib/session';

export default function Index() {
  const state = useSessionState();
  return <Redirect href={homeRouteFor(state) as Href} />;
}
