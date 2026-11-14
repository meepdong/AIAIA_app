/**
 * Money is stored and passed around as integer paise. Only formatting touches rupees.
 * Indian digit grouping (12,34,567.89) is done by hand so output does not depend on the
 * device's Intl/ICU data.
 */
export function formatINR(paise: number): string {
  if (!Number.isSafeInteger(paise)) {
    throw new RangeError(`formatINR expects an integer number of paise, got ${paise}`);
  }
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, '0');

  const digits = String(rupees);
  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThree}` : lastThree;

  return `${negative ? '-' : ''}₹${grouped}.${fraction}`;
}
