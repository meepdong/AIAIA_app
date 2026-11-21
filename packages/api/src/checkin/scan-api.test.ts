import { createCheckinApi, ScanError } from './index';

const EVENT = 'e0000000-0000-4000-8000-000000000001';
const row = {
  member_id: 'a0000000-0000-4000-8000-000000000011',
  full_name: 'Asha Fake',
  member_no: 'AIA-001',
  branch_name: 'Test Branch',
  age_group: '14-17',
  pass_version: 1,
  photo_path: null,
  guardian_names: [],
};

function apiWith(rpc: jest.Mock) {
  return createCheckinApi({ rpc } as never);
}

describe('checkin api: event pack and sync', () => {
  it('eventPack and syncCheckIns call the merged RPCs with the right arguments', async () => {
    const rpc = jest
      .fn()
      .mockResolvedValueOnce({ data: [row], error: null })
      .mockResolvedValueOnce({ data: { accepted: ['r1'], rejected: [] }, error: null });
    const api = apiWith(rpc);
    expect(await api.eventPack(EVENT)).toEqual([row]);
    const upload = {
      client_ref: 'r1',
      member_id: row.member_id,
      pass_version: 1,
      scanned_at: 'x',
      walk_in: false,
    };
    expect(await api.syncCheckIns(EVENT, [upload])).toEqual({ accepted: ['r1'], rejected: [] });
    expect(rpc).toHaveBeenNthCalledWith(1, 'event_pack', { event_id: EVENT });
    expect(rpc).toHaveBeenNthCalledWith(2, 'sync_check_ins', { event_id: EVENT, rows: [upload] });
  });

  it('maps failures: not allowed, closed, offline, and a malformed answer', async () => {
    const fail = (error: object) => apiWith(jest.fn().mockResolvedValue({ data: null, error }));
    await expect(fail({ code: '42501', message: 'no' }).eventPack(EVENT)).rejects.toMatchObject({
      code: 'not_allowed',
    });
    await expect(
      fail({ code: '22023', message: 'no' }).syncCheckIns(EVENT, []),
    ).rejects.toMatchObject({ code: 'closed' });
    await expect(
      fail({ code: '', message: 'TypeError: Failed to fetch' }).eventPack(EVENT),
    ).rejects.toMatchObject({ code: 'offline' });
    await expect(fail({ code: 'XX000', message: 'boom' }).eventPack(EVENT)).rejects.toBeInstanceOf(
      ScanError,
    );
    const odd = apiWith(jest.fn().mockResolvedValue({ data: { nope: 1 }, error: null }));
    await expect(odd.syncCheckIns(EVENT, [])).rejects.toMatchObject({ code: 'failed' });
  });

  it('canCheckIn is true only for an explicit yes', async () => {
    const asks = (data: unknown, error: unknown = null) =>
      apiWith(jest.fn().mockResolvedValue({ data, error })).canCheckIn(EVENT);
    expect(await asks(true)).toBe(true);
    expect(await asks(false)).toBe(false);
    expect(await asks(null, { message: 'x' })).toBe(false);
  });
});
