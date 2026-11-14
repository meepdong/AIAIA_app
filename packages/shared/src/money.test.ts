import { formatINR } from './money';

describe('formatINR', () => {
  it('formats paise with Indian digit grouping', () => {
    expect(formatINR(0)).toBe('₹0.00');
    expect(formatINR(5)).toBe('₹0.05');
    expect(formatINR(99900)).toBe('₹999.00');
    expect(formatINR(123456789)).toBe('₹12,34,567.89');
    expect(formatINR(100000000)).toBe('₹10,00,000.00');
  });

  it('keeps the sign outside the symbol', () => {
    expect(formatINR(-150)).toBe('-₹1.50');
  });

  it('rejects fractional paise', () => {
    expect(() => formatINR(10.5)).toThrow(RangeError);
  });
});
