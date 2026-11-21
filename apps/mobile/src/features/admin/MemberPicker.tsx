import { Button, ListItem, Text, TextField } from '@aiaia/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { useAdminApi } from './AdminApiContext';

export type PickedMember = { id: string; name: string };

type Props = {
  label: string;
  selected: PickedMember | null;
  onSelect: (m: PickedMember | null) => void;
};

/** Search-and-pick a member by name or number. RLS decides which members the caller can find. */
export function MemberPicker({ label, selected, onSelect }: Props) {
  const api = useAdminApi();
  const [draft, setDraft] = useState('');
  const [term, setTerm] = useState('');
  const results = useQuery({
    queryKey: ['admin', 'member-picker', term],
    queryFn: () => api.listMembers({ search: term, pageSize: 6 }),
    enabled: term.length > 0 && !selected,
  });

  if (selected) {
    return (
      <View style={{ gap: 4 }}>
        <Text bold>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text>{selected.name}</Text>
          <Button
            title="Change"
            variant="ghost"
            onPress={() => {
              onSelect(null);
              setDraft('');
              setTerm('');
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <TextField
        label={label}
        placeholder="Search by name or member number"
        value={draft}
        onChangeText={setDraft}
        returnKeyType="search"
        onSubmitEditing={() => setTerm(draft.trim())}
        accessibilityLabel={`${label} search`}
      />
      <Button title="Find member" variant="secondary" onPress={() => setTerm(draft.trim())} />
      {results.data
        ? results.data.rows.map((m) => (
            <ListItem
              key={m.id}
              title={m.full_name}
              subtitle={[m.member_no, m.branches?.name].filter(Boolean).join(' · ')}
              onPress={() => onSelect({ id: m.id, name: m.full_name })}
              accessibilityLabel={`Pick ${m.full_name}`}
              divider
            />
          ))
        : null}
      {results.data && results.data.rows.length === 0 ? (
        <Text tone="textMuted">No members found.</Text>
      ) : null}
    </View>
  );
}
