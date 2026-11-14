import type { ReactNode } from 'react';

export type DataTableColumn<T> = {
  key: string;
  header: string;
  /** Plain value used for sorting and filtering. */
  accessor: (row: T) => string | number | null | undefined;
  /** Optional custom cell. Defaults to the accessor value. */
  render?: (row: T) => ReactNode;
  sortable?: boolean;
};

export type DataTableProps<T> = {
  data: readonly T[];
  columns: readonly DataTableColumn<T>[];
  getRowId: (row: T) => string;
  accessibilityLabel: string;
  /** Web: search box across all columns. */
  searchable?: boolean;
  /** Web: rows per page. Default 10. */
  pageSize?: number;
  /** Web: row checkboxes. */
  selectable?: boolean;
  onSelectionChange?: (ids: string[]) => void;
  onRowPress?: (row: T) => void;
  emptyMessage?: string;
};
