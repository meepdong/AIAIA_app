import type { Client } from '../index';
import {
  IMPORT_BATCH_SIZE,
  ImportPartialError,
  createImportApi,
  type RosterRowInput,
} from './index';

const BRANCH = 'c0000000-0000-4000-8000-00000000000a';
const rowsOf = (n: number): RosterRowInput[] =>
  Array.from({ length: n }, (_, i) => ({ branch_id: BRANCH, full_name: `Fake Person ${i}` }));

function clientWith(results: ({ data?: unknown; error?: unknown } | 'throw')[]) {
  const sent: RosterRowInput[][] = [];
  let call = 0;
  const client = {
    rpc: (_name: string, args: { rows: RosterRowInput[] }) => {
      sent.push(args.rows);
      const r = results[call++];
      if (r === 'throw') return Promise.reject(new Error('network down'));
      return Promise.resolve({ data: r?.data ?? null, error: r?.error ?? null });
    },
  } as unknown as Client;
  return { client, sent };
}

const ok = (inserted: number) => ({ data: { inserted, updated: 0, skipped: 0 } });

describe('importRoster', () => {
  it('adds the batch counts up', async () => {
    const { client, sent } = clientWith([ok(1000), ok(5)]);
    const total = await createImportApi(client).importRoster(rowsOf(IMPORT_BATCH_SIZE + 5));
    expect(total).toEqual({ inserted: 1005, updated: 0, skipped: 0 });
    expect(sent.map((b) => b.length)).toEqual([IMPORT_BATCH_SIZE, 5]);
  });

  it('reports what was saved when a later batch fails', async () => {
    const { client } = clientWith([ok(1000), { error: { code: 'XX000' } }]);
    const err = await createImportApi(client)
      .importRoster(rowsOf(IMPORT_BATCH_SIZE + 5))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImportPartialError);
    const p = err as ImportPartialError;
    expect(p.savedBatches).toBe(1);
    expect(p.savedRows).toBe(IMPORT_BATCH_SIZE);
    expect(p.savedCounts).toEqual({ inserted: 1000, updated: 0, skipped: 0 });
  });

  it('reports it when the later batch throws instead of returning an error', async () => {
    const { client } = clientWith([ok(1000), 'throw']);
    const err = await createImportApi(client)
      .importRoster(rowsOf(IMPORT_BATCH_SIZE + 5))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImportPartialError);
  });

  it('rethrows the plain error when the first batch fails (nothing was saved)', async () => {
    const boom = { code: '42501' };
    const { client } = clientWith([{ error: boom }]);
    const err = await createImportApi(client)
      .importRoster(rowsOf(3))
      .catch((e: unknown) => e);
    expect(err).toBe(boom);
  });
});
