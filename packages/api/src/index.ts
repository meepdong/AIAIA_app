import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@aiaia/shared';
import { createAuthApi } from './auth';

/**
 * Shared touch point. All server access goes through this package.
 * Each feature brief adds `packages/api/src/<feature>/` exporting a `create<Feature>Api(client)`
 * factory, then registers it below with one additive line, e.g.
 *   auth: createAuthApi(client),
 */
export type Client = SupabaseClient<Database>;

export function createApi(client: Client) {
  return {
    // feature registrations go here
    auth: createAuthApi(client),
    _client: client,
  };
}

export type Api = ReturnType<typeof createApi>;
