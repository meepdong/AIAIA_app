import {
  columnFilteringFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { focusRing, minHit, stateOverlay, type PressState } from '../internal/interactive';
import { useTheme } from '../theme';
import { Button } from './Button';
import type { DataTableColumn, DataTableProps } from './DataTable.types';
import { EmptyState } from './EmptyState';
import { Text } from './Text';

export type { DataTableColumn, DataTableProps } from './DataTable.types';

// Stable, module-level: TanStack Table v9 recomputes row models if these change identity.
const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
  filterFns: { includesString: filterFn_includesString },
});

export function DataTable<T extends object>({
  data,
  columns,
  getRowId,
  accessibilityLabel,
  searchable,
  pageSize = 10,
  selectable,
  onSelectionChange,
  onRowPress,
  emptyMessage = 'No rows',
}: DataTableProps<T>) {
  const { colors, overlays, tokens } = useTheme();

  const defs = useMemo(
    () =>
      columns.map((c: DataTableColumn<T>) => ({
        id: c.key,
        accessorFn: (row: T) => c.accessor(row) ?? '',
        header: c.header,
        enableSorting: Boolean(c.sortable),
        sortFn: 'alphanumeric' as const,
      })),
    [columns],
  );
  const rows = useMemo(() => [...data], [data]);

  const table = useTable({
    features,
    columns: defs,
    data: rows,
    getRowId,
    globalFilterFn: 'includesString',
    initialState: { pagination: { pageIndex: 0, pageSize } },
  });

  const selection = table.state.rowSelection;
  const selectedIds = useMemo(
    () => Object.keys(selection ?? {}).filter((id) => selection?.[id]),
    [selection],
  );
  // Latest callback in a ref so an inline handler does not re-fire the effect on every render.
  const onSelectionChangeRef = useRef(onSelectionChange);
  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  });
  // Fire only when the selection actually changes, never for the initial empty selection.
  const lastSelectionKey = useRef(JSON.stringify(selectedIds));
  useEffect(() => {
    const key = JSON.stringify(selectedIds);
    if (key === lastSelectionKey.current) return;
    lastSelectionKey.current = key;
    onSelectionChangeRef.current?.(selectedIds);
  }, [selectedIds]);
  const [searchFocused, setSearchFocused] = useState(false);

  const pageRows = table.getRowModel().rows;
  const columnByKey = new Map(columns.map((c) => [c.key, c]));
  const pageCount = table.getPageCount();
  const pageIndex = table.state.pagination.pageIndex;
  const cellStyle = { flex: 1, padding: tokens.spacing[2], justifyContent: 'center' } as const;

  const checkbox = (checked: boolean, label: string, onToggle: () => void) => (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={onToggle}
      style={(s: PressState) => [
        minHit,
        { alignItems: 'center', justifyContent: 'center', borderRadius: tokens.radius.md },
        s.focused && focusRing(colors.focus, true),
      ]}
    >
      {(s: PressState) => (
        <>
          {stateOverlay(s, overlays, tokens.radius.md)}
          <Text>{checked ? '☑' : '☐'}</Text>
        </>
      )}
    </Pressable>
  );

  return (
    <View accessibilityLabel={accessibilityLabel} role="table" style={{ gap: tokens.spacing[2] }}>
      {searchable ? (
        <TextInput
          accessibilityLabel="Search table"
          placeholder="Search"
          placeholderTextColor={colors.textMuted}
          value={String(table.state.globalFilter ?? '')}
          onChangeText={(t) => table.setGlobalFilter(t)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          style={[
            {
              minHeight: tokens.minHitArea,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: tokens.radius.md,
              paddingHorizontal: tokens.spacing[3],
              color: colors.text,
              fontFamily: tokens.fontFamily['400'],
            },
            searchFocused && focusRing(colors.focus),
          ]}
        />
      ) : null}
      <View
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.divider,
          borderRadius: tokens.radius.lg,
          overflow: 'hidden',
        }}
      >
        <View
          role="row"
          style={{
            flexDirection: 'row',
            backgroundColor: colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: colors.divider,
          }}
        >
          {selectable
            ? checkbox(table.getIsAllPageRowsSelected(), 'Select all rows on this page', () =>
                table.toggleAllPageRowsSelected(),
              )
            : null}
          {table.getHeaderGroups()[0]?.headers.map((h) => {
            const sorted = h.column.getIsSorted();
            const canSort = h.column.getCanSort();
            const title = String(h.column.columnDef.header ?? '');
            return (
              <Pressable
                key={h.id}
                role="columnheader"
                accessibilityRole={canSort ? 'button' : undefined}
                accessibilityLabel={
                  canSort
                    ? `${title}, sort ${sorted === 'asc' ? 'descending' : 'ascending'}`
                    : title
                }
                disabled={!canSort}
                onPress={() => h.column.toggleSorting(sorted === 'asc')}
                style={(s: PressState) => [cellStyle, s.focused && focusRing(colors.focus, true)]}
              >
                <Text
                  variant="caption"
                  tone="textMuted"
                  style={{ fontFamily: tokens.fontFamily['500'], fontWeight: '500' }}
                >
                  {title}
                  {sorted === 'asc' ? ' ↑' : sorted === 'desc' ? ' ↓' : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {pageRows.length === 0 ? <EmptyState title={emptyMessage} /> : null}
        {pageRows.map((row, index) => (
          <Pressable
            key={row.id}
            role="row"
            disabled={!onRowPress}
            onPress={() => onRowPress?.(row.original)}
            style={(s: PressState) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                borderBottomWidth: index === pageRows.length - 1 ? 0 : 1,
                borderBottomColor: colors.divider,
                backgroundColor: colors.surface,
              },
              s.focused && focusRing(colors.focus, true),
            ]}
          >
            {(s: PressState) => (
              <>
                {onRowPress ? stateOverlay(s, overlays, 0) : null}
                {selectable
                  ? checkbox(row.getIsSelected(), 'Select row', () => row.toggleSelected())
                  : null}
                {defs.map((d) => {
                  const col = columnByKey.get(d.id);
                  return (
                    <View key={d.id} role="cell" style={cellStyle}>
                      {col?.render ? (
                        col.render(row.original)
                      ) : (
                        <Text>{String(col?.accessor(row.original) ?? '')}</Text>
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2] }}>
        <Button
          title="Previous"
          variant="secondary"
          disabled={!table.getCanPreviousPage()}
          onPress={() => table.previousPage()}
        />
        <Text variant="label" tone="textMuted">
          {`Page ${pageIndex + 1} of ${Math.max(pageCount, 1)}`}
        </Text>
        <Button
          title="Next"
          variant="secondary"
          disabled={!table.getCanNextPage()}
          onPress={() => table.nextPage()}
        />
      </View>
    </View>
  );
}
