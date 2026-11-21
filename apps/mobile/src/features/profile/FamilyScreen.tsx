import type { MyDependentRow } from '@aiaia/shared/src/schemas/membership';
import { Button, Card, DateField, Screen, Text, TextField } from '@aiaia/ui';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useApi } from '@/features/auth/useApi';
import { ADULT_AGE, ageOn, todayIst } from './age';
import { canOfferLogin, canSeeFamily, dependentAge, firstName, formatIstDateTime } from './family';

type Gate = 'loading' | 'allowed' | 'denied' | 'error';

const STATUS_TEXT: Record<string, string> = {
  pending: 'Waiting for branch approval',
  active: 'Active member',
  rejected: 'Not approved',
  suspended: 'Suspended',
  deleted: 'Removed',
};

/** My family: adult guardians add dependents, see their status and issue a family code. */
export function FamilyScreen() {
  const { profile } = useApi();
  const [gate, setGate] = useState<Gate>('loading');
  const [gateError, setGateError] = useState<string>();
  const [items, setItems] = useState<MyDependentRow[]>([]);
  const [listError, setListError] = useState<string>();
  const [codes, setCodes] = useState<Record<string, { code: string; expiresAt: string }>>({});
  const [codeError, setCodeError] = useState<Record<string, string>>({});
  const [busyCode, setBusyCode] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [relationship, setRelationship] = useState('');
  const [formErrors, setFormErrors] = useState<{ name?: string; dob?: string }>({});
  const [addError, setAddError] = useState<string>();
  const [busyAdd, setBusyAdd] = useState(false);

  const loadList = useCallback(async () => {
    const result = await profile.myDependents();
    if (result.ok) {
      setItems(result.items);
      setListError(undefined);
    } else {
      setListError(result.message);
    }
  }, [profile]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const mine = await profile.myProfile();
      if (!live) return;
      if (!mine.ok) {
        setGateError(mine.message);
        setGate('error');
        return;
      }
      if (!canSeeFamily(mine.profile)) {
        setGate('denied');
        return;
      }
      setGate('allowed');
      await loadList();
    })();
    return () => {
      live = false;
    };
  }, [profile, loadList]);

  const add = async () => {
    if (busyAdd) return;
    const errors: { name?: string; dob?: string } = {};
    if (!name.trim()) errors.name = 'Enter their name.';
    const age = dob ? ageOn(dob, todayIst()) : null;
    if (!dob || age === null || age < 0) errors.dob = 'Enter their date of birth.';
    else if (age >= ADULT_AGE) errors.dob = 'They must be under 18 to be added here.';
    setFormErrors(errors);
    if (errors.name || errors.dob) return;
    setBusyAdd(true);
    setAddError(undefined);
    const result = await profile.addDependent({
      full_name: name.trim(),
      dob,
      ...(relationship.trim() ? { relationship: relationship.trim() } : {}),
    });
    setBusyAdd(false);
    if (!result.ok) {
      setAddError(result.message);
      return;
    }
    setName('');
    setDob('');
    setRelationship('');
    setAdding(false);
    await loadList();
  };

  const makeCode = async (row: MyDependentRow) => {
    if (busyCode) return;
    setBusyCode(row.member_id);
    setCodeError((e) => ({ ...e, [row.member_id]: '' }));
    const result = await profile.createClaimCode(row.member_id);
    setBusyCode(undefined);
    if (!result.ok) {
      setCodeError((e) => ({ ...e, [row.member_id]: result.message }));
      return;
    }
    setCodes((c) => ({
      ...c,
      [row.member_id]: { code: result.code, expiresAt: result.expiresAt },
    }));
    await loadList();
  };

  return (
    <Screen>
      <View style={{ maxWidth: 520, width: '100%', alignSelf: 'center', gap: 16 }}>
        <Text variant="title" accessibilityRole="header">
          My family
        </Text>

        {gate === 'loading' ? <Text tone="textMuted">Loading…</Text> : null}
        {gate === 'error' ? (
          <Text tone="danger" accessibilityLiveRegion="polite">
            {gateError}
          </Text>
        ) : null}
        {gate === 'denied' ? (
          <Text accessibilityLiveRegion="polite">
            Not available. Family members can be added by active members aged 18 or over.
          </Text>
        ) : null}

        {gate === 'allowed' ? (
          <>
            {listError ? (
              <Text tone="danger" accessibilityLiveRegion="polite">
                {listError}
              </Text>
            ) : null}
            {items.length === 0 && !listError ? (
              <Text tone="textMuted">You have not added anyone yet.</Text>
            ) : null}
            {items.map((row) => {
              const age = dependentAge(row);
              const code = codes[row.member_id];
              const error = codeError[row.member_id];
              return (
                <Card key={row.member_id}>
                  <View style={{ gap: 8 }}>
                    <Text bold>{row.full_name}</Text>
                    <Text tone="textMuted">
                      {age !== null ? `Age ${age} · ` : ''}
                      {STATUS_TEXT[row.status] ?? row.status}
                      {row.has_login ? ' · Has their own login' : ''}
                    </Text>
                    {canOfferLogin(row) ? (
                      <Button
                        title={`Give ${firstName(row.full_name)} their own login`}
                        variant="secondary"
                        loading={busyCode === row.member_id}
                        onPress={() => void makeCode(row)}
                      />
                    ) : null}
                    {code ? (
                      <View style={{ gap: 4 }} accessibilityLiveRegion="polite">
                        <Text>Family code. Share it only with {firstName(row.full_name)}:</Text>
                        <Text variant="title" selectable>
                          {code.code}
                        </Text>
                        <Text tone="textMuted">
                          Valid until {formatIstDateTime(code.expiresAt)} IST. Making a new code
                          replaces this one.
                        </Text>
                      </View>
                    ) : row.claim_code_expires_at ? (
                      <Text tone="textMuted">
                        A code is waiting, valid until{' '}
                        {formatIstDateTime(row.claim_code_expires_at)} IST. Make a new one if it was
                        lost.
                      </Text>
                    ) : null}
                    {error ? (
                      <Text tone="danger" accessibilityLiveRegion="polite">
                        {error}
                      </Text>
                    ) : null}
                  </View>
                </Card>
              );
            })}

            {adding ? (
              <Card>
                <View style={{ gap: 12 }}>
                  <Text bold>Add a family member</Text>
                  <TextField
                    label="Full name"
                    value={name}
                    onChangeText={(v) => {
                      setName(v);
                      setFormErrors({});
                    }}
                    error={formErrors.name}
                  />
                  <DateField
                    label="Date of birth"
                    value={dob}
                    onChange={(v) => {
                      setDob(v);
                      setFormErrors({});
                    }}
                    error={formErrors.dob}
                  />
                  <TextField
                    label="Your relationship (optional)"
                    hint="For example: parent, guardian"
                    value={relationship}
                    onChangeText={setRelationship}
                  />
                  {addError ? (
                    <Text tone="danger" accessibilityLiveRegion="polite">
                      {addError}
                    </Text>
                  ) : null}
                  <Button title="Add" onPress={add} loading={busyAdd} fullWidth />
                  <Button
                    title="Cancel"
                    variant="ghost"
                    onPress={() => {
                      setAdding(false);
                      setAddError(undefined);
                      setFormErrors({});
                    }}
                  />
                </View>
              </Card>
            ) : (
              <Button title="Add a family member" onPress={() => setAdding(true)} fullWidth />
            )}
          </>
        ) : null}
      </View>
    </Screen>
  );
}
