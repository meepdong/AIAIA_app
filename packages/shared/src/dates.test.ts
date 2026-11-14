import { ageOn, formatDate, formatDateTime, isMinor } from './dates';

describe('isMinor', () => {
  const today = new Date('2026-11-13T06:00:00Z');

  it('is true for someone under 18', () => {
    expect(isMinor('2010-01-01', today)).toBe(true);
    expect(isMinor('2008-11-14', today)).toBe(true); // turns 18 tomorrow
  });

  it('is false from the 18th birthday onwards', () => {
    expect(isMinor('2008-11-13', today)).toBe(false); // 18th birthday today
    expect(isMinor('2000-05-05', today)).toBe(false);
  });

  it('uses the Asia/Kolkata calendar day, not UTC', () => {
    // 2026-11-12 20:00 UTC is already 13 Nov 01:30 in Kolkata
    expect(isMinor('2008-11-13', new Date('2026-11-12T20:00:00Z'))).toBe(false);
    expect(isMinor('2008-11-13', new Date('2026-11-12T17:00:00Z'))).toBe(true);
  });

  it('rejects a malformed date of birth', () => {
    expect(() => isMinor('13/11/2008', today)).toThrow(RangeError);
  });
});

describe('ageOn', () => {
  it('counts whole years', () => {
    expect(ageOn('2000-11-13', new Date('2026-11-13T00:00:00Z'))).toBe(26);
    expect(ageOn('2000-11-14', new Date('2026-11-13T00:00:00Z'))).toBe(25);
  });
});

describe('Kolkata formatting', () => {
  it('formats dates and times in IST', () => {
    expect(formatDate('2026-11-12T20:00:00Z')).toBe('13 Nov 2026');
    expect(formatDateTime('2026-11-13T10:15:00Z')).toBe('13 Nov 2026, 3:45 pm');
    expect(formatDateTime('2026-11-12T18:30:00Z')).toBe('13 Nov 2026, 12:00 am');
  });
});
