import { ImportPartialError, type Api } from '@aiaia/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiProvider } from '@/features/auth/useApi';
import { ImportScreen, friendlyImportError } from './ImportScreen';
import { ROSTER_COLUMNS } from './roster';

jest.mock('@/lib/supabase', () => ({ getSupabase: () => ({}) }));

const BRANCH_A = 'c0000000-0000-4000-8000-00000000000a';
const BRANCH_B = 'c0000000-0000-4000-8000-00000000000b';
const BRANCHES = [
  { id: BRANCH_A, code: 'AAA', name: 'Branch A' },
  { id: BRANCH_B, code: 'BBB', name: 'Branch B' },
];

const setPlatform = (os: string) => {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
};
afterEach(() => setPlatform('ios'));

const SHEET = [
  ROSTER_COLUMNS.join(','),
  'Aarav Demokar,+91 90000 00001,Branch A,2001-04-15,,,,,,',
  'Diya Dummyson,+91 90000 00002,Branch A,31/02/2012,,,,,,',
  'Ravi Fixture,9000000001,Branch A,,,,,,,',
  'Meera Mockford,+91 90000 00003,Branch B,,,,,,,',
].join('\n');

async function renderScreen(
  grants: { permission_key: string; branch_id: string | null }[],
  roster: Partial<Api['roster']> = {},
  text: string = SHEET,
) {
  const api = {
    admin: { getAccess: () => Promise.resolve({ permissions: grants, needsStepUp: false }) },
    roster: { importBranches: () => Promise.resolve(BRANCHES), ...roster },
  } as unknown as Api;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 360, height: 640 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <ApiProvider api={api}>
          <ImportScreen initialText={text} />
        </ApiProvider>
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

const IMPORT = [{ permission_key: 'roster.import', branch_id: null }];

describe('import screen', () => {
  it('shows nothing to someone without roster.import', async () => {
    setPlatform('web');
    const importBranches = jest.fn(() => Promise.resolve(BRANCHES));
    await renderScreen([{ permission_key: 'members.manage', branch_id: null }], { importBranches });
    expect(await screen.findByText('You do not have permission to import a roster.')).toBeTruthy();
    expect(importBranches).not.toHaveBeenCalled();
  });

  it('is web only: native gets an explanation and never loads branches', async () => {
    setPlatform('android');
    const importBranches = jest.fn(() => Promise.resolve(BRANCHES));
    await renderScreen(IMPORT, { importBranches });
    expect(await screen.findByText(/imported from the web console only/)).toBeTruthy();
    expect(importBranches).not.toHaveBeenCalled();
  });

  it('previews errors and duplicates, then sends only the valid rows', async () => {
    setPlatform('web');
    const importRoster = jest.fn(() => Promise.resolve({ inserted: 2, updated: 0, skipped: 0 }));
    await renderScreen(IMPORT, { importRoster });

    expect(await screen.findByText('4 rows')).toBeTruthy();
    expect(screen.getByText('2 ready')).toBeTruthy();
    expect(screen.getByText('1 with errors')).toBeTruthy();
    expect(screen.getByText('1 duplicates')).toBeTruthy();
    expect(screen.getByText(/Row 3 \(Diya Dummyson\)/)).toBeTruthy();
    expect(screen.getByText(/Row 4 \(Ravi Fixture\): Repeats row 2/)).toBeTruthy();

    await fireEvent.press(screen.getByText('Import 2 valid rows'));
    await waitFor(() => expect(importRoster).toHaveBeenCalledTimes(1));
    expect(importRoster).toHaveBeenCalledWith([
      {
        branch_id: BRANCH_A,
        full_name: 'Aarav Demokar',
        phone: '+919000000001',
        dob: '2001-04-15',
      },
      { branch_id: BRANCH_B, full_name: 'Meera Mockford', phone: '+919000000003', dob: null },
    ]);
    expect(await screen.findByText('Added: 2')).toBeTruthy();
    // The sheet is dropped once sent.
    expect(screen.queryByTestId('import-counts')).toBeNull();
  });

  it('will not import into a branch where the caller lacks roster.import', async () => {
    setPlatform('web');
    const importRoster = jest.fn(() => Promise.resolve({ inserted: 1, updated: 0, skipped: 0 }));
    await renderScreen([{ permission_key: 'roster.import', branch_id: BRANCH_A }], {
      importRoster,
    });
    expect(await screen.findByText('1 ready')).toBeTruthy();
    expect(
      screen.getByText(/Row 5 \(Meera Mockford\): You cannot import into this branch/),
    ).toBeTruthy();
    await fireEvent.press(screen.getByText('Import 1 valid row'));
    await waitFor(() => expect(importRoster).toHaveBeenCalledTimes(1));
    expect((importRoster.mock.calls[0] as unknown as [unknown[]])[0]).toHaveLength(1);
  });

  it('shows a friendly message when the import fails', async () => {
    setPlatform('web');
    const importRoster = jest.fn(() =>
      Promise.reject({ code: 'XX000', message: 'boom 9876543210' }),
    );
    await renderScreen(IMPORT, { importRoster });
    await fireEvent.press(await screen.findByText('Import 2 valid rows'));
    expect(await screen.findByText(/The import failed/)).toBeTruthy();
    expect(screen.queryByText(/9876543210/)).toBeNull();
  });

  it('after a partial failure says how many rows were saved and retries only the rest', async () => {
    setPlatform('web');
    const importRoster = jest
      .fn()
      .mockRejectedValueOnce(
        new ImportPartialError({ code: 'XX000' }, 1, 1, { inserted: 1, updated: 0, skipped: 0 }),
      )
      .mockResolvedValueOnce({ inserted: 1, updated: 0, skipped: 0 });
    await renderScreen(IMPORT, { importRoster });

    await fireEvent.press(await screen.findByText('Import 2 valid rows'));
    expect(await screen.findByText(/1 row was already saved; the rest were not/)).toBeTruthy();
    // The saved row is gone from the pending sheet.
    expect(await screen.findByText('1 ready')).toBeTruthy();

    await fireEvent.press(screen.getByText('Import 1 valid row'));
    await waitFor(() => expect(importRoster).toHaveBeenCalledTimes(2));
    expect(importRoster.mock.calls[1]).toEqual([
      [{ branch_id: BRANCH_B, full_name: 'Meera Mockford', phone: '+919000000003', dob: null }],
    ]);
    // The summary counts the saved batch and the retry together.
    expect(await screen.findByText('Added: 2')).toBeTruthy();
  });
});

describe('friendlyImportError', () => {
  it('names the permission problem and never echoes server text', () => {
    expect(friendlyImportError({ code: '42501', message: 'roster.import is required' })).toMatch(
      /permission/,
    );
    expect(friendlyImportError(new Error('row 3 has a phone +919876543210'))).not.toMatch(/9876/);
  });
});
