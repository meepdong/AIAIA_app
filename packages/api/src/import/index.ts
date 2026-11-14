import type { Client } from '../index';

/** A branch the importer can resolve the sheet's `branch` column against. */
export interface ImportBranch {
  id: string;
  code: string;
  name: string;
}

/** One row as `import_roster` takes it. Only these keys are read by the RPC. */
export type RosterRowInput = {
  branch_id: string;
  full_name: string;
  phone?: string | null;
  dob?: string | null;
  member_no?: string | null;
  notes?: string | null;
};

export interface ImportSummary {
  inserted: number;
  updated: number;
  skipped: number;
}

/** The RPC refuses more than this many rows in one call. */
export const IMPORT_BATCH_SIZE = 1000;

export function createImportApi(client: Client) {
  return {
    async importBranches(): Promise<ImportBranch[]> {
      const res = await client.from('branches').select('id, code, name').order('name');
      if (res.error) throw res.error;
      return res.data ?? [];
    },

    /**
     * Sends the rows through `import_roster`, at most 1000 per call, and adds the counts up.
     * The RPC checks roster.import for every row's branch before it writes anything, so a
     * refusal in a batch leaves that batch untouched. Earlier batches stay imported.
     */
    async importRoster(rows: readonly RosterRowInput[]): Promise<ImportSummary> {
      const total: ImportSummary = { inserted: 0, updated: 0, skipped: 0 };
      for (let i = 0; i < rows.length; i += IMPORT_BATCH_SIZE) {
        const batch = rows.slice(i, i + IMPORT_BATCH_SIZE);
        const res = await client.rpc('import_roster', { rows: batch });
        if (res.error) throw res.error;
        const d = (res.data ?? {}) as Partial<ImportSummary>;
        total.inserted += d.inserted ?? 0;
        total.updated += d.updated ?? 0;
        total.skipped += d.skipped ?? 0;
      }
      return total;
    },
  };
}

export type ImportApi = ReturnType<typeof createImportApi>;
