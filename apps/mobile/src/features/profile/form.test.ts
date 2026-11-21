import {
  emptyDraft,
  firstInvalidStep,
  parseDraft,
  toPayload,
  validateStep,
  type ProfileDraft,
} from './form';

const TODAY = '2026-11-14';
const BRANCH = '00000000-0000-4000-8000-000000000001';

function draft(patch: Partial<ProfileDraft> = {}): ProfileDraft {
  return {
    ...emptyDraft(),
    fullName: 'Aarav Testwala',
    branchId: BRANCH,
    dob: '2000-01-15',
    ...patch,
  };
}

describe('profile form: step 1 (age rules)', () => {
  it('blocks self-signup at 13 years 364 days, with "ask a parent or guardian to add you"', () => {
    const errors = validateStep(0, draft({ dob: '2012-11-15' }), TODAY);
    expect(errors.dob).toBe('Ask a parent or guardian to add you.');
  });

  it('lets 14 years 0 days continue', () => {
    expect(validateStep(0, draft({ dob: '2012-11-14' }), TODAY)).toEqual({});
  });

  it('requires name, branch and date of birth', () => {
    const errors = validateStep(0, emptyDraft(), TODAY);
    expect(Object.keys(errors).sort()).toEqual(['branchId', 'dob', 'fullName']);
  });
});

describe('profile form: step 2', () => {
  it('treats email and the emergency contact as optional', () => {
    expect(validateStep(1, draft(), TODAY)).toEqual({});
  });

  it('rejects a malformed email, and a name without a number or the reverse', () => {
    expect(validateStep(1, draft({ email: 'nope' }), TODAY).email).toBeDefined();
    const nameOnly = draft({ emergencyName: 'Nina Sampleton' });
    expect(validateStep(1, nameOnly, TODAY).emergencyPhone).toBeDefined();
    const phoneOnly = draft({ emergencyPhone: '9000000012' });
    expect(validateStep(1, phoneOnly, TODAY).emergencyName).toBeDefined();
    const short = draft({ emergencyName: 'Nina', emergencyPhone: '90000' });
    expect(validateStep(1, short, TODAY).emergencyPhone).toBeDefined();
  });
});

describe('profile form: submit', () => {
  it('jumps back to the first step that has an error', () => {
    expect(firstInvalidStep(draft(), TODAY)).toBeNull();
    expect(firstInvalidStep(draft({ email: 'nope' }), TODAY)).toBe(1);
    expect(firstInvalidStep(draft({ dob: '2012-11-15', email: 'nope' }), TODAY)).toBe(0);
  });

  it('builds the payload: trimmed, blanks as null, +91 added, consents default off', () => {
    const payload = toPayload(
      draft({
        fullName: '  Aarav Testwala ',
        emergencyName: 'Nina Sampleton',
        emergencyPhone: '9000000012',
        city: ' ',
      }),
    );
    expect(payload).toMatchObject({
      full_name: 'Aarav Testwala',
      dob: '2000-01-15',
      branch_id: BRANCH,
      city: null,
      email: null,
      emergency_contact_name: 'Nina Sampleton',
      emergency_contact_phone: '+919000000012',
      whatsapp_opt_in: false,
      email_updates_opt_in: false,
      privacy: { show_phone: false, show_email: false },
    });
  });
});

describe('profile draft parsing', () => {
  it('round-trips a saved draft', () => {
    const saved = draft({ step: 2, city: 'Pune', whatsappOptIn: true });
    expect(parseDraft(JSON.stringify(saved))).toEqual(saved);
  });

  it('survives garbage, wrong types and a missing field', () => {
    expect(parseDraft('not json')).toBeNull();
    expect(parseDraft('"text"')).toBeNull();
    const parsed = parseDraft(
      JSON.stringify({
        step: 99,
        fullName: 5,
        whatsappOptIn: 'yes',
        privacy: { show_phone: true, x: 1 },
      }),
    );
    expect(parsed).toMatchObject({ step: 3, fullName: '', whatsappOptIn: false });
    expect(parsed?.privacy.show_phone).toBe(true);
    expect(parsed?.privacy.show_city).toBe(true);
  });
});
