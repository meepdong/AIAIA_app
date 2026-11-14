import { View } from 'react-native';
import { useTheme } from '../theme';
import type { DataTableProps } from './DataTable.types';
import { EmptyState } from './EmptyState';
import { ListItem } from './ListItem';

export type { DataTableColumn, DataTableProps } from './DataTable.types';

/** Native fallback: first column is the title, the rest become a subtitle. Web has the real table. */
export function DataTable<T>({
  data,
  columns,
  getRowId,
  accessibilityLabel,
  onRowPress,
  emptyMessage = 'No rows',
}: DataTableProps<T>) {
  const { colors } = useTheme();
  if (data.length === 0) return <EmptyState title={emptyMessage} />;
  const [first, ...rest] = columns;
  return (
    <View accessibilityLabel={accessibilityLabel} style={{ backgroundColor: colors.surface }}>
      {data.map((row) => (
        <ListItem
          key={getRowId(row)}
          title={String(first?.accessor(row) ?? '')}
          subtitle={rest.map((c) => `${c.header}: ${c.accessor(row) ?? ''}`).join(' | ')}
          onPress={onRowPress ? () => onRowPress(row) : undefined}
          divider
        />
      ))}
    </View>
  );
}
