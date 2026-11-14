import { Button, Select, Sheet, TextField, toast, type SelectOption } from '@aiaia/ui';
import { useState } from 'react';
import { View } from 'react-native';
import { reportMember } from './hooks';

/** The reasons P1-11's report form offers. `submit_report` takes the value as free text. */
export const REPORT_REASONS: readonly SelectOption[] = [
  { label: 'Harassment', value: 'harassment' },
  { label: 'Inappropriate', value: 'inappropriate' },
  { label: 'Spam', value: 'spam' },
  { label: 'Impersonation', value: 'impersonation' },
  { label: 'Safety concern involving a minor', value: 'safety_minor' },
  { label: 'Other', value: 'other' },
];

function isReportLimit(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'PT429';
}

/**
 * The Report action on a member card. P1-11 exports `<ReportButton targetType targetId>`; it is
 * not merged yet, so this is a small stand-in that files the same `submit_report` call. When
 * P1-11 lands, replace the body of this component with `<ReportButton targetType="member" ... />`.
 */
export function ReportMember({ memberId, name }: { memberId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason) return;
    setBusy(true);
    try {
      await reportMember(memberId, reason, details);
      toast.success('Thanks. The enforcement committee will review this.');
      setOpen(false);
      setReason(null);
      setDetails('');
    } catch (error) {
      // `submit_report` raises PT429 after 20 reports in 24 hours; retrying cannot succeed.
      toast.error(
        isReportLimit(error)
          ? "You have reached today's report limit. Try again tomorrow."
          : 'We could not send your report. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        title="Report"
        variant="ghost"
        accessibilityLabel={`Report ${name}`}
        onPress={() => setOpen(true)}
      />
      <Sheet visible={open} onClose={() => setOpen(false)} title={`Report ${name}`}>
        <View style={{ gap: 12 }}>
          <Select
            label="Reason"
            options={REPORT_REASONS}
            value={reason}
            onChange={setReason}
            placeholder="Choose a reason"
          />
          <TextField
            label="Details (optional)"
            value={details}
            onChangeText={setDetails}
            multiline
            maxLength={2000}
          />
          <Button title="Send report" onPress={submit} loading={busy} disabled={!reason || busy} />
        </View>
      </Sheet>
    </>
  );
}
