import type { Client } from './index';
import { createApi } from './index';

describe('createApi', () => {
  it('builds one api object around the supplied client', () => {
    const client = {} as Client;
    const api = createApi(client);
    expect(api._client).toBe(client);
  });
});
