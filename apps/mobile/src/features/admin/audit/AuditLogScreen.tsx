import { isIsoDate, type AuditRow } from '@aiaia/api';
import { Button, Card, ListItem, QueryState, Text, TextField } from '@aiaia/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { useAdminApi } from '../AdminApiContext';
import { MemberPicker, type PickedMember } from '../MemberPicker';
import { holdsAnywhere } from '../permissions';
import { useAdminGrants } from '../useAdminGrants';

const IST = 'Asia/Kolkata';
const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    timeZone: IST,
    dateStyle: 'medium',
    timeStyle: 'medium',
  });

type Applied = { actorId: string | null; action: string; from: string; to: string };
const NONE: Applied = { actorId: null, action: '', from: '', to: '' };

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text tone="textMuted">{label}</Text>
      <Text>{value}</Text>
    </View>
  );
}

function AuditDetail({ row, actor }: { row: AuditRow; actor: string }) {
  return (
    <Card>
      <View style={{ gap: 8 }} testID="audit-detail">
        <Text bold>{row.action}</Text>
        <Row label="When" value={fmt(row.created_at)} />
        <Row label="Actor" value={actor} />
        <Row label="Target" value={`${row.entity}${row.entity_id ? ` ${row.entity_id}` : ''}`} />
        <Text tone="textMuted">Details</Text>
        <Text variant="caption" selectable>
          {JSON.stringify(row.details ?? {}, null, 2)}
        </Text>
      </View>
    </Card>
  );
}

export function AuditLogScreen({ pageSize }: { pageSize?: number }) {
  const api = useAdminApi();
  const { grants, ready } = useAdminGrants();
  const allowed = holdsAnywhere(grants, 'audit.view');

  const [actor, setActor] = useState<PickedMember | null>(null);
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [dateError, setDateError] = useState<string | null>(null);
  const [applied, setApplied] = useState<Applied>(NONE);
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);

  const filters = {
    actorId: applied.actorId,
    action: applied.action,
    from: applied.from || null,
    to: applied.to || null,
    page,
    pageSize,
  };
  const list = useQuery({
    queryKey: ['admin', 'audit', filters],
    queryFn: () => api.listAuditLog(filters),
    placeholderData: keepPreviousData,
    enabled: allowed,
  });
  const ids = (list.data?.rows ?? [])
    .map((r) => r.actor_member_id)
    .filter((x): x is string => x !== null);
  const names = useQuery({
    queryKey: ['admin', 'audit', 'names', [...new Set(ids)].sort()],
    queryFn: () => api.getMemberNames(ids),
    enabled: allowed && ids.length > 0,
  });
  const actorLabel = (id: string | null) =>
    id === null ? 'System' : (names.data?.[id] ?? 'Unknown member');

  if (!ready) return <Text tone="textMuted">Loading…</Text>;
  if (!allowed) {
    return (
      <View style={{ gap: 12 }}>
        <Text variant="heading">Audit log</Text>
        <Text tone="textMuted">You do not have permission to view the audit log.</Text>
      </View>
    );
  }

  const apply = () => {
    if ((from && !isIsoDate(from)) || (to && !isIsoDate(to))) {
      setDateError('Use dates like 2026-11-30.');
      return;
    }
    if (from && to && from > to) {
      setDateError('The start date must not be after the end date.');
      return;
    }
    setDateError(null);
    setApplied({ actorId: actor?.id ?? null, action: action.trim(), from, to });
    setPage(0);
    setOpenId(null);
  };
  const clear = () => {
    setActor(null);
    setAction('');
    setFrom('');
    setTo('');
    setDateError(null);
    setApplied(NONE);
    setPage(0);
    setOpenId(null);
  };
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  return (
    <View style={{ gap: 12 }}>
      <Text variant="heading">Audit log</Text>

      <MemberPicker label="Actor" selected={actor} onSelect={setActor} />
      <TextField
        label="Action"
        placeholder="For example role or settings"
        value={action}
        onChangeText={setAction}
        autoCapitalize="none"
        accessibilityLabel="Action filter"
      />
      <TextField
        label="From date"
        placeholder="YYYY-MM-DD"
        value={from}
        onChangeText={setFrom}
        autoCapitalize="none"
        accessibilityLabel="From date"
      />
      <TextField
        label="To date"
        placeholder="YYYY-MM-DD"
        value={to}
        onChangeText={setTo}
        autoCapitalize="none"
        error={dateError ?? undefined}
        accessibilityLabel="To date"
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="Apply filters" onPress={apply} />
        <Button title="Clear filters" variant="ghost" onPress={clear} />
      </View>

      <QueryState
        query={list}
        isEmpty={(d) => d.rows.length === 0}
        emptyTitle="No audit entries"
        emptyMessage="Nothing matches these filters."
      >
        {(d) => (
          <View>
            {d.rows.map((r) => (
              <View key={r.id}>
                <ListItem
                  title={r.action}
                  subtitle={`${fmt(r.created_at)} · ${actorLabel(r.actor_member_id)}`}
                  onPress={() => setOpenId((cur) => (cur === r.id ? null : r.id))}
                  accessibilityLabel={`Open audit entry ${r.action}`}
                  divider
                />
                {openId === r.id ? (
                  <AuditDetail row={r} actor={actorLabel(r.actor_member_id)} />
                ) : null}
              </View>
            ))}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: 12,
              }}
            >
              <Button
                title="Previous"
                variant="ghost"
                disabled={page === 0}
                onPress={() => setPage((p) => Math.max(0, p - 1))}
              />
              <Text tone="textMuted">{`Page ${page + 1} of ${totalPages}`}</Text>
              <Button
                title="Next"
                variant="ghost"
                disabled={page + 1 >= totalPages}
                onPress={() => setPage((p) => p + 1)}
              />
            </View>
          </View>
        )}
      </QueryState>
    </View>
  );
}
