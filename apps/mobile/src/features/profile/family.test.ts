import { canOfferLogin, canSeeFamily, firstName, formatIstDateTime } from './family';

const TODAY = '2026-11-14';
const profile = (status: string, dob: string | null) =>
  ({ member: { status }, private: dob === null ? null : { dob } }) as never;

describe('canSeeFamily', () => {
  it('is true only for an active member aged 18 or over', () => {
    expect(canSeeFamily(profile('active', '2000-01-15'), TODAY)).toBe(true);
    expect(canSeeFamily(profile('active', '2008-11-14'), TODAY)).toBe(true); // 18y0d
  });

  it('is false for a minor, even one day short of 18', () => {
    expect(canSeeFamily(profile('active', '2008-11-15'), TODAY)).toBe(false); // 17y364d
    expect(canSeeFamily(profile('active', '2012-06-01'), TODAY)).toBe(false);
  });

  it('is false for any status other than active', () => {
    for (const status of ['pending', 'rejected', 'suspended', 'deleted']) {
      expect(canSeeFamily(profile(status, '1990-01-01'), TODAY)).toBe(false);
    }
  });

  it('is false with no profile, no private row or no DOB', () => {
    expect(canSeeFamily(null, TODAY)).toBe(false);
    expect(canSeeFamily(profile('active', null), TODAY)).toBe(false);
    expect(canSeeFamily(profile('active', 'not-a-date'), TODAY)).toBe(false);
  });
});

describe('canOfferLogin', () => {
  const row = (over: Record<string, unknown>) =>
    ({ dob: '2012-11-14', has_login: false, status: 'active', ...over }) as never;
  it('needs age 14, no login and an open membership', () => {
    expect(canOfferLogin(row({}), TODAY)).toBe(true);
    expect(canOfferLogin(row({ dob: '2012-11-15' }), TODAY)).toBe(false);
    expect(canOfferLogin(row({ has_login: true }), TODAY)).toBe(false);
    expect(canOfferLogin(row({ status: 'suspended' }), TODAY)).toBe(false);
    expect(canOfferLogin(row({ dob: null }), TODAY)).toBe(false);
  });
});

describe('helpers', () => {
  it('takes the first name and formats IST', () => {
    expect(firstName('  Kabir Testwala ')).toBe('Kabir');
    expect(formatIstDateTime('2026-11-22T00:00:00Z')).toBe('2026-11-22 05:30');
    expect(formatIstDateTime(null)).toBe('');
    expect(formatIstDateTime('junk')).toBe('');
  });
});
