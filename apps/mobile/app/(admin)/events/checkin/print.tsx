import { useLocalSearchParams } from 'expo-router';
import { PrintSheetScreen } from '@/features/checkin';

/** /events/checkin/print?event=<id> or ?branch=<id>; with neither, the screen asks for a branch. */
export default function PrintPassesRoute() {
  const { event, branch } = useLocalSearchParams<{ event?: string; branch?: string }>();
  const scope = event ? { event_id: String(event) } : branch ? { branch_id: String(branch) } : null;
  return <PrintSheetScreen scope={scope} />;
}
