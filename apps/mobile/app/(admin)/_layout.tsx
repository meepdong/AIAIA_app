import { Slot, useRouter, usePathname, type Href } from 'expo-router';
import { AdminShell, adminNav } from '@/features/admin';

export default function AdminLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const active =
    adminNav.find((e) => e.href !== '/admin' && pathname.startsWith(e.href))?.key ?? 'dashboard';
  return (
    <AdminShell
      activeKey={active}
      onNavigate={(entry) => router.push(entry.href as Href)}
      onSwitchToMemberView={() => router.replace('/home' as Href)}
    >
      <Slot />
    </AdminShell>
  );
}
