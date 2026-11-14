// Entry point. verify_jwt stays on (no [functions.member-pass] entry needed in config.toml).
// Function secret (never in the repo): PASS_SIGNING_PRIVATE_KEY, the base64url Ed25519 seed that
// scripts/gen-pass-keys.mjs prints once. SUPABASE_URL and SUPABASE_ANON_KEY come from the platform.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { createHandler, type BulkRow, type PassRow } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

Deno.serve(
  createHandler({
    signingSeed: Deno.env.get('PASS_SIGNING_PRIVATE_KEY'),
    listPasses: async (authorization) => {
      // The caller's own JWT, so my_passes() runs as them: no service role here.
      const client = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: authorization } },
      });
      const { data, error } = await client.rpc('my_passes');
      if (error) throw new Error(error.code ?? 'rpc_error');
      return (data ?? []) as PassRow[];
    },
    listBulkPasses: async (authorization, scope) => {
      // As the caller too: bulk_passes() decides who may print and whose passes are on the sheet.
      const client = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: authorization } },
      });
      const { data, error } = await client.rpc('bulk_passes', scope);
      if (error) throw new Error(error.code ?? 'rpc_error');
      return (data ?? []) as BulkRow[];
    },
  }),
);
