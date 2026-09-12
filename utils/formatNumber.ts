/** Missing field measurements are unknown, never fabricated zeroes. */
export function formatNumber(value: number | string | null | undefined, digits: number): string {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return 'N/A';
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : 'N/A';
}
