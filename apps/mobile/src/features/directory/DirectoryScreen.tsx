import type { DirectoryEntry } from '@aiaia/shared/src/schemas/content';
import { Header, QueryState, Screen, Select, TextField, type SelectOption } from '@aiaia/ui';
import { FlashList } from '@shopify/flash-list';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useBranches, useDebouncedValue, useDirectorySearch } from './hooks';
import { MemberCard } from './MemberCard';

const ALL_BRANCHES = 'all';

export function DirectoryScreen() {
  const [text, setText] = useState('');
  const [branch, setBranch] = useState(ALL_BRANCHES);
  const q = useDebouncedValue(text.trim());
  const branches = useBranches();
  const search = useDirectorySearch(q, branch === ALL_BRANCHES ? null : branch);

  const options = useMemo<SelectOption[]>(
    () => [
      { label: 'All branches', value: ALL_BRANCHES },
      ...(branches.data ?? []).map((b) => ({ label: b.name, value: b.id })),
    ],
    [branches.data],
  );
  const rows = useMemo<DirectoryEntry[]>(() => search.data?.pages.flat() ?? [], [search.data]);

  return (
    <Screen scroll={false} padded={false}>
      <Header title="Directory" />
      <View style={{ padding: 16, gap: 12 }}>
        <TextField
          label="Search members"
          placeholder="Name, city or occupation"
          value={text}
          onChangeText={setText}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        <Select label="Branch" options={options} value={branch} onChange={setBranch} />
      </View>
      <View style={{ flex: 1 }}>
        <QueryState
          query={{ ...search, data: search.data ? rows : undefined }}
          emptyTitle={q ? 'No members found' : 'No members to show yet'}
          emptyMessage={q ? 'Try a different name or branch.' : undefined}
        >
          {(data) => (
            <FlashList
              data={data}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                  <MemberCard entry={item} />
                </View>
              )}
              onEndReachedThreshold={0.5}
              onEndReached={() => {
                if (search.hasNextPage && !search.isFetchingNextPage) void search.fetchNextPage();
              }}
            />
          )}
        </QueryState>
      </View>
    </Screen>
  );
}
