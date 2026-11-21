import type { SettingRow } from '@aiaia/api';
import type { Json } from '@aiaia/shared';
import { Badge, Button, Card, QueryState, Text, TextField, toast } from '@aiaia/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Switch, View } from 'react-native';
import { useAdminApi } from '../AdminApiContext';
import { friendlyAdminError } from '../errors';
import { holdsAnywhere } from '../permissions';
import { useAdminGrants } from '../useAdminGrants';

const IST = 'Asia/Kolkata';

type Kind = 'boolean' | 'number' | 'string' | 'json';

function kindOf(value: Json): Kind {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'string';
  return 'json';
}

/** Why a row cannot be edited here, or null when it can. */
export function readOnlyReason(s: Pick<SettingRow, 'is_secret' | 'editable'>): string | null {
  if (s.is_secret) return 'Secret value. It is never shown or changed from this screen.';
  if (!s.editable) return "This setting can't be changed from the app.";
  return null;
}

export function displayValue(s: Pick<SettingRow, 'is_secret' | 'value'>): string {
  if (s.is_secret) return 'Hidden';
  if (typeof s.value === 'string') return s.value === '' ? '(empty)' : s.value;
  return JSON.stringify(s.value);
}

/** Turns the editor's text into the JSON value to send, or an error message. */
export function parseDraft(
  kind: Kind,
  draft: string,
): { ok: true; value: Json } | { ok: false; error: string } {
  if (kind === 'string') return { ok: true, value: draft };
  if (kind === 'number') {
    const t = draft.trim();
    const n = Number(t);
    if (t === '' || !Number.isFinite(n)) return { ok: false, error: 'Enter a number.' };
    return { ok: true, value: n };
  }
  try {
    return { ok: true, value: JSON.parse(draft) as Json };
  } catch {
    return { ok: false, error: 'That is not valid JSON.' };
  }
}

function SettingEditor({ setting, onDone }: { setting: SettingRow; onDone: () => void }) {
  const api = useAdminApi();
  const queryClient = useQueryClient();
  const kind = kindOf(setting.value);
  const [flag, setFlag] = useState(setting.value === true);
  const [draft, setDraft] = useState(
    kind === 'string'
      ? (setting.value as string)
      : kind === 'number'
        ? String(setting.value)
        : JSON.stringify(setting.value, null, 2),
  );
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (value: Json) => api.setSetting(setting.key, value),
    onSuccess: async () => {
      toast.success('Setting saved.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      onDone();
    },
    onError: (e) => setError(friendlyAdminError(e)),
  });

  const submit = () => {
    setError(null);
    if (kind === 'boolean') {
      save.mutate(flag);
      return;
    }
    const parsed = parseDraft(kind, draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    save.mutate(parsed.value);
  };

  return (
    <View style={{ gap: 8 }}>
      {kind === 'boolean' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Switch
            value={flag}
            onValueChange={setFlag}
            accessibilityLabel={`Value of ${setting.key}`}
          />
          <Text>{flag ? 'On' : 'Off'}</Text>
        </View>
      ) : (
        <TextField
          label="Value"
          value={draft}
          onChangeText={setDraft}
          multiline={kind === 'json'}
          keyboardType={kind === 'number' ? 'numeric' : 'default'}
          autoCapitalize="none"
          hint={kind === 'json' ? 'JSON. Keep the same shape as the current value.' : undefined}
          accessibilityLabel={`Value of ${setting.key}`}
        />
      )}
      {error ? (
        <Text tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          title="Save"
          accessibilityLabel={`Save ${setting.key}`}
          loading={save.isPending}
          onPress={submit}
        />
        <Button title="Cancel" variant="ghost" onPress={onDone} disabled={save.isPending} />
      </View>
    </View>
  );
}

function SettingItem({ setting }: { setting: SettingRow }) {
  const [editing, setEditing] = useState(false);
  const reason = readOnlyReason(setting);
  return (
    <Card>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text bold>{setting.key}</Text>
          {setting.is_public ? <Badge label="Public" /> : null}
          {setting.is_secret ? <Badge label="Secret" tone="warning" /> : null}
        </View>
        {setting.description ? (
          <Text tone="textMuted" variant="caption">
            {setting.description}
          </Text>
        ) : null}
        {editing ? (
          <SettingEditor setting={setting} onDone={() => setEditing(false)} />
        ) : (
          <Text testID={`setting-value-${setting.key}`}>{displayValue(setting)}</Text>
        )}
        {reason ? (
          <Text tone="textMuted" variant="caption">
            {reason}
          </Text>
        ) : !editing ? (
          <Button
            title="Edit"
            variant="secondary"
            accessibilityLabel={`Edit ${setting.key}`}
            onPress={() => setEditing(true)}
          />
        ) : null}
        <Text tone="textMuted" variant="caption">
          {`Updated ${new Date(setting.updated_at).toLocaleString('en-IN', {
            timeZone: IST,
            dateStyle: 'medium',
            timeStyle: 'short',
          })}`}
        </Text>
      </View>
    </Card>
  );
}

export function SettingsScreen() {
  const api = useAdminApi();
  const { grants, ready } = useAdminGrants();
  const allowed = holdsAnywhere(grants, 'system.config');
  const list = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.listSettings(),
    enabled: allowed,
  });

  if (!ready) return <Text tone="textMuted">Loading…</Text>;
  if (!allowed) {
    return (
      <View style={{ gap: 12 }}>
        <Text variant="heading">Settings</Text>
        <Text tone="textMuted">You do not have permission to change settings.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <Text variant="heading">Settings</Text>
      <QueryState
        query={list}
        isEmpty={(d) => d.length === 0}
        emptyTitle="No settings"
        emptyMessage="There are no settings to show."
      >
        {(rows) => (
          <View style={{ gap: 12 }}>
            {rows.map((s) => (
              <SettingItem key={s.key} setting={s} />
            ))}
          </View>
        )}
      </QueryState>
    </View>
  );
}
