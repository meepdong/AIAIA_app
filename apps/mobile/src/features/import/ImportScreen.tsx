import { ImportPartialError, type ImportSummary } from '@aiaia/api';
import { Badge, Button, Card, QueryState, Text } from '@aiaia/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createElement, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import { holds } from '@/features/admin/permissions';
import { useAdminGrants } from '@/features/admin/useAdminGrants';
import { deliverCsv } from '@/features/admin/members/deliverCsv';
import { useApi } from '@/features/auth/useApi';
import {
  MAX_FILE_BYTES,
  ROSTER_TEMPLATE_CSV,
  applyBranchPermission,
  buildErrorReportCsv,
  countRows,
  parseRosterCsv,
  toImportRows,
  type ParsedRoster,
  type PreviewRow,
} from './roster';

const SHOWN_PROBLEMS = 200;

/** Friendly text for an import failure. Never echoes server text. */
export function friendlyImportError(error: unknown, alreadySaved?: number): string {
  const saved = alreadySaved ?? (error instanceof ImportPartialError ? error.savedRows : 0);
  if (saved > 0) {
    return `${saved} ${saved === 1 ? 'row was' : 'rows were'} already saved; the rest were not. The rows left are still listed: check them, then try again.`;
  }
  const e = (error ?? {}) as { code?: string; message?: string };
  if (e.code === '42501' || (e.message ?? '').includes('roster.import')) {
    return 'You do not have permission to import into one of these branches.';
  }
  return 'The import failed. Rows in the batch that failed were not saved. Check the summary, then try again.';
}

function CsvFileInput({ onText }: { onText: (text: string, name: string) => void }) {
  // Web only: a plain file input. The file is read here and never uploaded.
  return createElement('input', {
    type: 'file',
    accept: '.csv,text/csv',
    'aria-label': 'Choose roster CSV',
    onChange: async (ev: { target: { files?: FileList | null; value: string } }) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      const text = file.size > MAX_FILE_BYTES ? '' : await file.text();
      // Clear the input so picking the same file again fires a change.
      ev.target.value = '';
      onText(text, file.name);
    },
  });
}

function Counts({ rows }: { rows: readonly PreviewRow[] }) {
  const c = countRows(rows);
  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }} testID="import-counts">
      <Badge label={`${c.total} rows`} />
      <Badge label={`${c.valid} ready`} tone="success" />
      <Badge label={`${c.errors} with errors`} tone={c.errors ? 'danger' : 'neutral'} />
      <Badge label={`${c.duplicates} duplicates`} tone={c.duplicates ? 'warning' : 'neutral'} />
    </View>
  );
}

export function ImportScreen({ initialText }: { initialText?: string }) {
  const api = useApi();
  const { grants, ready } = useAdminGrants();
  const allowed = grants.some((g) => g.permission_key === 'roster.import');
  const isWeb = Platform.OS === 'web';

  const branches = useQuery({
    queryKey: ['import', 'branches'],
    queryFn: () => api.roster.importBranches(),
    enabled: allowed && isWeb,
  });

  const [fileName, setFileName] = useState<string | null>(initialText ? 'roster.csv' : null);
  const [text, setText] = useState<string | null>(initialText ?? null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  // After a partly failed import: the sheet rows already saved, and what those batches added up to.
  const [savedLines, setSavedLines] = useState<ReadonlySet<number>>(new Set());
  const [savedCounts, setSavedCounts] = useState<ImportSummary | null>(null);
  const [savedRows, setSavedRows] = useState(0);

  const parsed: ParsedRoster | null = useMemo(() => {
    if (text === null || !branches.data) return null;
    if (text === '')
      return { fileErrors: ['That file is empty or too large (5 MB limit)'], rows: [] };
    const p = parseRosterCsv(text, branches.data);
    const rows = applyBranchPermission(p.rows, (b) => holds(grants, 'roster.import', b));
    // Rows that an earlier, partly failed attempt already saved are not sent again.
    return { ...p, rows: rows.filter((r) => !savedLines.has(r.line)) };
  }, [text, branches.data, grants, savedLines]);

  const run = useMutation({
    mutationFn: async () => {
      const pending = (parsed?.rows ?? []).filter((r) => r.status === 'valid' && r.row);
      try {
        const s = await api.roster.importRoster(toImportRows(pending));
        // Add what an earlier, partly failed attempt had already saved.
        return savedCounts
          ? {
              inserted: s.inserted + savedCounts.inserted,
              updated: s.updated + savedCounts.updated,
              skipped: s.skipped + savedCounts.skipped,
            }
          : s;
      } catch (e) {
        if (e instanceof ImportPartialError) {
          setSavedLines(
            (prev) => new Set([...prev, ...pending.slice(0, e.savedRows).map((r) => r.line)]),
          );
          setSavedRows((n) => n + e.savedRows);
          setSavedCounts((c) => ({
            inserted: (c?.inserted ?? 0) + e.savedCounts.inserted,
            updated: (c?.updated ?? 0) + e.savedCounts.updated,
            skipped: (c?.skipped ?? 0) + e.savedCounts.skipped,
          }));
        }
        throw e;
      }
    },
    onSuccess: (s) => {
      setSummary(s);
      setSavedLines(new Set());
      setSavedCounts(null);
      setSavedRows(0);
      // The sheet holds personal data: drop it as soon as it has been sent.
      setText(null);
    },
  });

  const download = async (name: string, csv: string) => {
    setDownloadError(null);
    try {
      await deliverCsv(name, csv);
    } catch {
      setDownloadError('The download is available on the web console only.');
    }
  };

  if (!ready) return <Text tone="textMuted">Loading…</Text>;
  if (!allowed) {
    return (
      <View style={{ gap: 12 }}>
        <Text variant="heading">Import roster</Text>
        <Text tone="textMuted">You do not have permission to import a roster.</Text>
      </View>
    );
  }
  if (!isWeb) {
    return (
      <View style={{ gap: 12 }}>
        <Text variant="heading">Import roster</Text>
        <Text tone="textMuted">
          Roster files hold contact details of members, so they are imported from the web console
          only. Open this page on a computer.
        </Text>
      </View>
    );
  }

  const rows = parsed?.rows ?? [];
  const counts = countRows(rows);
  const problems = rows.filter((r) => r.status !== 'valid');

  return (
    <View style={{ gap: 12 }}>
      <Text variant="heading">Import roster</Text>
      <Text tone="textMuted">
        Choose the filled-in template. The file is read in your browser and is not uploaded or
        stored; only the rows that pass the checks are sent to the roster.
      </Text>

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Button
          title="Download template"
          variant="secondary"
          onPress={() => download('aiaia-roster-template.csv', ROSTER_TEMPLATE_CSV)}
        />
      </View>
      {downloadError ? (
        <Text tone="danger" accessibilityRole="alert">
          {downloadError}
        </Text>
      ) : null}

      <QueryState query={branches} emptyTitle="No branches found">
        {() => (
          <View style={{ gap: 8 }}>
            <CsvFileInput
              onText={(t, name) => {
                setSummary(null);
                setSavedLines(new Set());
                setSavedCounts(null);
                setSavedRows(0);
                run.reset();
                setFileName(name);
                setText(t);
              }}
            />
            {fileName ? <Text tone="textMuted">{`File: ${fileName}`}</Text> : null}
          </View>
        )}
      </QueryState>

      {parsed?.fileErrors.map((m) => (
        <Text key={m} tone="danger" accessibilityRole="alert">
          {m}
        </Text>
      ))}

      {parsed && parsed.fileErrors.length === 0 ? (
        <View style={{ gap: 12 }}>
          <Counts rows={rows} />
          {problems.length > 0 ? (
            <Card>
              <View style={{ gap: 6 }} testID="import-problems">
                <Text bold>Rows that will be skipped</Text>
                {problems.slice(0, SHOWN_PROBLEMS).map((p) => (
                  <Text key={p.line} variant="caption">
                    {`Row ${p.line}${p.name ? ` (${p.name})` : ''}: ${p.errors.join('; ')}`}
                  </Text>
                ))}
                {problems.length > SHOWN_PROBLEMS ? (
                  <Text variant="caption" tone="textMuted">
                    {`${problems.length - SHOWN_PROBLEMS} more are in the error report.`}
                  </Text>
                ) : null}
                <Button
                  title="Download error report"
                  variant="secondary"
                  onPress={() => download('aiaia-roster-errors.csv', buildErrorReportCsv(rows))}
                />
              </View>
            </Card>
          ) : null}
          <Button
            title={`Import ${counts.valid} valid ${counts.valid === 1 ? 'row' : 'rows'}`}
            disabled={counts.valid === 0 || run.isPending}
            loading={run.isPending}
            onPress={() => run.mutate()}
          />
        </View>
      ) : null}

      {run.isError ? (
        <Text tone="danger" accessibilityRole="alert">
          {friendlyImportError(run.error, savedRows)}
        </Text>
      ) : null}

      {summary ? (
        <Card>
          <View style={{ gap: 6 }} testID="import-summary">
            <Text bold>Import finished</Text>
            <Text>{`Added: ${summary.inserted}`}</Text>
            <Text>{`Updated: ${summary.updated}`}</Text>
            <Text>{`Skipped: ${summary.skipped}`}</Text>
            <Text variant="caption" tone="textMuted">
              Skipped rows are numbers already claimed by a member, or in a branch you do not
              manage.
            </Text>
          </View>
        </Card>
      ) : null}
    </View>
  );
}
