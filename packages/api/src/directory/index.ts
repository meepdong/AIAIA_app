import type { DirectoryEntry, SearchDirectoryArgs } from '@aiaia/shared/src/schemas/content';
import type { Client } from '../index';

export type BranchOption = { id: string; name: string };

/** Reads `search_directory`, the branch list and files member reports. Masking happens in SQL. */
export function createDirectoryApi(client: Client) {
  return {
    /** One page (`page` starts at 1) of `search_directory`. Masked fields come back as null. */
    async search({ q, branch_id, page = 1 }: SearchDirectoryArgs): Promise<DirectoryEntry[]> {
      const term = q?.trim();
      const { data, error } = await client.rpc('search_directory', {
        ...(term ? { q: term } : {}),
        ...(branch_id ? { branch_id } : {}),
        page,
      });
      if (error) throw error;
      return data ?? [];
    },

    async branches(): Promise<BranchOption[]> {
      const { data, error } = await client.from('branches').select('id, name').order('name');
      if (error) throw error;
      return data ?? [];
    },

    /** Files a report about a member through `submit_report`. Returns the report id. */
    async reportMember(memberId: string, reason: string, details?: string): Promise<string> {
      const { data, error } = await client.rpc('submit_report', {
        target_type: 'member',
        target_id: memberId,
        reason,
        ...(details?.trim() ? { details: details.trim() } : {}),
      });
      if (error) throw error;
      return data;
    },
  };
}

export type DirectoryApi = ReturnType<typeof createDirectoryApi>;
