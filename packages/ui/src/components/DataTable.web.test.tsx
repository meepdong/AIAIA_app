import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { DataTable, type DataTableColumn } from './DataTable.web';
import { tokens } from '../tokens';

type Row = { id: string; name: string; age: number };

const rows: Row[] = [
  { id: 'a', name: 'Charlie Test', age: 30 },
  { id: 'b', name: 'Alice Test', age: 20 },
  { id: 'c', name: 'Bob Test', age: 25 },
];

const columns: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Name', accessor: (r) => r.name, sortable: true },
  { key: 'age', header: 'Age', accessor: (r) => r.age },
];

describe('DataTable.web', () => {
  it('sorts by a sortable column and toggles direction', async () => {
    await render(
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        accessibilityLabel="People"
      />,
    );
    await fireEvent.press(screen.getByLabelText('Name, sort ascending'));
    const asc = screen.getAllByText(/ Test$/).map((n) => n.props.children);
    expect(asc).toEqual(['Alice Test', 'Bob Test', 'Charlie Test']);
    await fireEvent.press(screen.getByLabelText('Name, sort descending'));
    const desc = screen.getAllByText(/ Test$/).map((n) => n.props.children);
    expect(desc).toEqual(['Charlie Test', 'Bob Test', 'Alice Test']);
  });

  it('paginates', async () => {
    await render(
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        accessibilityLabel="People"
        pageSize={2}
      />,
    );
    expect(screen.getByText('Page 1 of 2')).toBeTruthy();
    expect(screen.getAllByText(/ Test$/)).toHaveLength(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Page 2 of 2')).toBeTruthy();
    expect(screen.getAllByText(/ Test$/)).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByText('Page 1 of 2')).toBeTruthy();
  });

  it('reports row selection', async () => {
    const onSelectionChange = jest.fn();
    await render(
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        accessibilityLabel="People"
        selectable
        onSelectionChange={onSelectionChange}
      />,
    );
    await fireEvent.press(screen.getAllByLabelText('Select row')[1]!);
    expect(onSelectionChange).toHaveBeenLastCalledWith(['b']);
    await fireEvent.press(screen.getByLabelText('Select all rows on this page'));
    expect(onSelectionChange).toHaveBeenLastCalledWith(expect.arrayContaining(['a', 'b', 'c']));
  });

  it('does not report a selection on mount, only when it changes', async () => {
    const onSelectionChange = jest.fn();
    await render(
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        accessibilityLabel="People"
        selectable
        onSelectionChange={onSelectionChange}
      />,
    );
    expect(onSelectionChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getAllByLabelText('Select row')[0]!);
    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onSelectionChange).toHaveBeenCalledWith(['a']);
  });

  it('gives the search box a focus ring while focused', async () => {
    await render(
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        accessibilityLabel="People"
        searchable
      />,
    );
    const search = screen.getByLabelText('Search table');
    expect(StyleSheet.flatten(search.props.style).outlineWidth).toBeUndefined();
    await fireEvent(search, 'focus');
    expect(StyleSheet.flatten(screen.getByLabelText('Search table').props.style).outlineWidth).toBe(
      2,
    );
    await fireEvent(screen.getByLabelText('Search table'), 'blur');
    expect(
      StyleSheet.flatten(screen.getByLabelText('Search table').props.style).outlineWidth,
    ).toBeUndefined();
  });

  it('draws the header on the surface with a divider underneath and muted medium text', async () => {
    await render(
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        accessibilityLabel="People"
      />,
    );
    const light = tokens.colors.light;
    const text = StyleSheet.flatten(screen.getByText('Age').props.style);
    expect(text.color).toBe(light.textMuted);
    expect(text.fontFamily).toBe('Figtree_500Medium');
    const header = screen.getByRole('columnheader', { name: 'Age' }).parent as unknown as {
      props: { style: Parameters<typeof StyleSheet.flatten>[0] };
    };
    const style = StyleSheet.flatten(header.props.style) ?? {};
    expect(style.backgroundColor).toBe(light.surface);
    expect(style.borderBottomColor).toBe(light.divider);
    expect(style.borderBottomWidth).toBe(1);
  });
});
