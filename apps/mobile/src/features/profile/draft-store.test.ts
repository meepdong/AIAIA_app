import { clearDraft, loadDraft, saveDraft } from './draft-store';
import { emptyDraft } from './form';

// A tiny in-memory stand-in for the one-row table.
const mockRows: { owner: string; body: string }[] = [];
const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  getFirstAsync: jest.fn(async () => mockRows[0] ?? null),
  runAsync: jest.fn(async (sql: string, ...args: string[]) => {
    mockRows.length = 0;
    if (sql.startsWith('INSERT')) mockRows.push({ owner: args[0] ?? '', body: args[1] ?? '' });
  }),
};
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn(async () => mockDb) }));

beforeEach(() => {
  mockRows.length = 0;
});

describe('profile draft store (expo-sqlite)', () => {
  it('saves and loads a draft for its owner', async () => {
    const draft = { ...emptyDraft(), fullName: 'Aarav Testwala', step: 1 };
    await saveDraft('user-1', draft);
    expect(await loadDraft('user-1')).toEqual(draft);
  });

  it("never hands one user's draft to another login", async () => {
    await saveDraft('user-1', { ...emptyDraft(), fullName: 'Aarav Testwala' });
    expect(await loadDraft('user-2')).toBeNull();
  });

  it('clears the draft', async () => {
    await saveDraft('user-1', emptyDraft());
    await clearDraft();
    expect(await loadDraft('user-1')).toBeNull();
  });

  it('never throws when the database fails', async () => {
    mockDb.getFirstAsync.mockRejectedValueOnce(new Error('disk full'));
    expect(await loadDraft('user-1')).toBeNull();
  });
});
