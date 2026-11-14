import {
  ADULT_AGE,
  AIAIA_MIN_AGE,
  TEEN_MIN_AGE,
  ageBand,
  ageOn,
  bandForDob,
  todayIst,
} from './age';

// A fixed "today" so every boundary is exact.
const TODAY = '2026-11-14';

describe('profile age boundaries', () => {
  it('thresholds are 14, 18 and 35', () => {
    expect([TEEN_MIN_AGE, ADULT_AGE, AIAIA_MIN_AGE]).toEqual([14, 18, 35]);
  });

  it('13 years 364 days is blocked', () => {
    expect(ageOn('2012-11-15', TODAY)).toBe(13);
    expect(bandForDob('2012-11-15', TODAY)).toBe('blocked');
  });

  it('14 years 0 days is a teen', () => {
    expect(ageOn('2012-11-14', TODAY)).toBe(14);
    expect(bandForDob('2012-11-14', TODAY)).toBe('teen');
  });

  it('17 years 364 days is still a teen, 18 years 0 days is an adult', () => {
    expect(bandForDob('2008-11-15', TODAY)).toBe('teen');
    expect(bandForDob('2008-11-14', TODAY)).toBe('adult');
  });

  it('34 years 364 days is an adult, 35 years 0 days joins the parent organisation', () => {
    expect(bandForDob('1991-11-15', TODAY)).toBe('adult');
    expect(bandForDob('1991-11-14', TODAY)).toBe('aiaia');
  });

  it('handles a 29 February birthday like the database (counts from 1 March)', () => {
    expect(ageOn('2008-02-29', '2026-02-28')).toBe(17);
    expect(ageOn('2008-02-29', '2026-03-01')).toBe(18);
  });

  it('ageBand maps whole years', () => {
    expect(ageBand(0)).toBe('blocked');
    expect(ageBand(13)).toBe('blocked');
    expect(ageBand(14)).toBe('teen');
    expect(ageBand(17)).toBe('teen');
    expect(ageBand(18)).toBe('adult');
    expect(ageBand(34)).toBe('adult');
    expect(ageBand(35)).toBe('aiaia');
  });

  it('gives no band for an unusable date', () => {
    expect(bandForDob('', TODAY)).toBeNull();
    expect(bandForDob('2030-01-01', TODAY)).toBeNull();
    expect(bandForDob('1800-01-01', TODAY)).toBeNull();
  });

  it('uses the date in Asia/Kolkata, not UTC', () => {
    expect(todayIst(new Date('2026-11-13T20:00:00Z'))).toBe('2026-11-14');
    expect(todayIst(new Date('2026-11-13T18:29:00Z'))).toBe('2026-11-13');
  });
});
