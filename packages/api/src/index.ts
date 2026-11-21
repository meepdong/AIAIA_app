import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@aiaia/shared';
import { createAdminApi } from './admin';
import { createAuthApi } from './auth';
import { createDirectoryApi } from './directory';
import { createEventsApi } from './events';
import { createImportApi } from './import';
import { createSettingsApi } from './settings';

/**
 * Shared touch point. All server access goes through this package.
 * Each feature brief adds `packages/api/src/<feature>/` exporting a `create<Feature>Api(client)`
 * factory, then registers it below with one additive line, e.g.
 *   auth: createAuthApi(client),
 */
export type { Membership, MemberStatus } from './auth';
export type Client = SupabaseClient<Database>;

export function createApi(client: Client) {
  return {
    // feature registrations go here
    admin: createAdminApi(client),
    auth: createAuthApi(client),
    directory: createDirectoryApi(client),
    events: createEventsApi(client),
    roster: createImportApi(client),
    settings: createSettingsApi(client),
    _client: client,
  };
}

export type Api = ReturnType<typeof createApi>;
export * from './events';
export * from './admin';
export * from './import';
