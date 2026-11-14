import {
  AdminLayout,
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  DateField,
  EmptyState,
  Header,
  IconButton,
  ListItem,
  OtpField,
  PhoneField,
  QueryState,
  Screen,
  Select,
  Sheet,
  Tag,
  Text,
  TextField,
  ThemeProvider,
  toast,
  useTheme,
  type ColorScheme,
} from '@aiaia/ui';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

// Fake people only (AGENTS.md).
const PEOPLE = [
  { id: '1', name: 'Asha Verma', city: 'Pune' },
  { id: '2', name: 'Ravi Nair', city: 'Kochi' },
  { id: '3', name: 'Meera Iyer', city: 'Chennai' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { tokens } = useTheme();
  return (
    <View style={{ gap: tokens.spacing[2] }}>
      <Text variant="heading">{title}</Text>
      {children}
    </View>
  );
}

function Gallery({ scheme }: { scheme: ColorScheme }) {
  const { colors, tokens } = useTheme();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [date, setDate] = useState('');
  const [role, setRole] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [active, setActive] = useState('home');
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Screen>
        <Text variant="display">{`Gallery (${scheme})`}</Text>
        <Section title="Buttons">
          <View style={{ gap: tokens.spacing[2] }}>
            <Button title="Primary" />
            <Button title="Secondary" variant="secondary" />
            <Button title="Ghost" variant="ghost" />
            <Button title="Danger" variant="danger" />
            <Button title="Loading" loading />
            <Button title="Disabled" disabled />
            <IconButton accessibilityLabel="Add" icon={<Text variant="heading">+</Text>} />
          </View>
        </Section>
        <Section title="Form controls">
          <TextField label="Name" hint="As on your ID" />
          <TextField label="Email" error="Enter a valid email" />
          <PhoneField value={phone} onChangeText={setPhone} />
          <OtpField value={otp} onChangeText={setOtp} />
          <Select
            label="Role"
            value={role}
            onChange={setRole}
            options={[
              { label: 'Member', value: 'member' },
              { label: 'Volunteer', value: 'volunteer' },
            ]}
          />
          <DateField label="Date of birth" value={date} onChange={setDate} />
        </Section>
        <Section title="Display">
          <Header title="Header" subtitle="Subtitle" onBack={() => {}} />
          <Card>
            <ListItem
              title="Asha Verma"
              subtitle="Pune"
              left={<Avatar name="Asha Verma" />}
              divider
            />
            <ListItem
              title="Ravi Nair"
              subtitle="Kochi"
              left={<Avatar name="Ravi Nair" />}
              onPress={() => {}}
            />
          </Card>
          <View style={{ flexDirection: 'row', gap: tokens.spacing[2], flexWrap: 'wrap' }}>
            <Badge label="Active" tone="success" />
            <Badge label="Pending" tone="warning" />
            <Badge label="Suspended" tone="danger" />
            <Tag label="Youth" />
            <Tag label="Selected" selected onPress={() => {}} />
            <Tag label="Removable" onRemove={() => {}} />
          </View>
          <EmptyState title="Nothing yet" message="Items you add will show here." />
          <QueryState
            query={{ data: undefined, isPending: false, isError: true, refetch: () => {} }}
          >
            {() => null}
          </QueryState>
        </Section>
        <Section title="Overlays">
          <Button title="Toast" variant="secondary" onPress={() => toast.show('Saved')} />
          <Button title="Sheet" variant="secondary" onPress={() => setSheet(true)} />
          <Button title="Confirm dialog" variant="secondary" onPress={() => setConfirm(true)} />
          <Sheet visible={sheet} onClose={() => setSheet(false)} title="Sheet">
            <Text>Sheet content</Text>
          </Sheet>
          <ConfirmDialog
            visible={confirm}
            title="Delete this?"
            message="This cannot be undone."
            destructive
            confirmLabel="Delete"
            onConfirm={() => setConfirm(false)}
            onCancel={() => setConfirm(false)}
          />
        </Section>
        <Section title="Data table (web) / list (native)">
          <DataTable
            accessibilityLabel="People"
            data={PEOPLE}
            getRowId={(p) => p.id}
            searchable
            selectable
            pageSize={2}
            columns={[
              { key: 'name', header: 'Name', accessor: (p) => p.name, sortable: true },
              { key: 'city', header: 'City', accessor: (p) => p.city, sortable: true },
            ]}
          />
        </Section>
        <Section title="Admin layout">
          <View style={{ height: 320, borderWidth: 1, borderColor: colors.border }}>
            <AdminLayout
              title="Admin"
              nav={[
                { key: 'home', label: 'Home' },
                { key: 'members', label: 'Members' },
              ]}
              activeKey={active}
              onNavigate={setActive}
            >
              <Text>{`Page: ${active}`}</Text>
            </AdminLayout>
          </View>
        </Section>
      </Screen>
    </View>
  );
}

export default function UiGalleryRoute() {
  const [scheme, setScheme] = useState<ColorScheme>('light');
  // Dev-only: production builds bounce to the home screen.
  if (!__DEV__) return <Redirect href="/home" />;
  return (
    <ThemeProvider scheme={scheme}>
      <View style={{ flex: 1 }}>
        <View style={{ padding: 8, flexDirection: 'row', gap: 8, backgroundColor: '#888' }}>
          <Button
            title={scheme === 'light' ? 'Switch to dark' : 'Switch to light'}
            variant="secondary"
            onPress={() => setScheme(scheme === 'light' ? 'dark' : 'light')}
          />
        </View>
        <Gallery scheme={scheme} />
      </View>
    </ThemeProvider>
  );
}
