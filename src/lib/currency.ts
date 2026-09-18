export const supportedCurrencies = ['AUD', 'EUR', 'USD', 'GBP', 'INR', 'NZD', 'CAD', 'SGD', 'JPY', 'THB', 'IDR', 'AED', 'CHF', 'CNY', 'HKD', 'KRW'] as const;

const zeroDecimal = new Set(['JPY', 'KRW']);
export const currencyDecimals = (currency: string) => zeroDecimal.has(currency) ? 0 : 2;

export function parseCurrencyAmount(value: string, currency: string): number {
  const clean = value.trim();
  const decimals = currencyDecimals(currency);
  const pattern = decimals ? new RegExp(`^\\d+(\\.\\d{0,${decimals}})?$`) : /^\d+$/;
  if (!pattern.test(clean)) throw new Error(`Enter a valid ${currency} amount${decimals ? ` with up to ${decimals} decimal places` : ' using whole units'}`);
  const [whole, fraction = ''] = clean.split('.');
  const minor = Number(whole) * 10 ** decimals + Number(fraction.padEnd(decimals, '0'));
  if (!Number.isSafeInteger(minor) || minor <= 0) throw new Error('Amount must be greater than zero');
  return minor;
}

export function formatCurrencyMinor(minor: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', {style: 'currency', currency}).format(minor / 10 ** currencyDecimals(currency));
}

export function convertMinorUnits(originalMinor: number, sourceCurrency: string, rateToAud: number): number {
  if (!Number.isSafeInteger(originalMinor) || originalMinor <= 0 || !Number.isFinite(rateToAud) || rateToAud <= 0) throw new Error('Invalid currency conversion');
  const rateUnits = Math.round(rateToAud * 100_000_000);
  const numerator = BigInt(originalMinor) * BigInt(rateUnits) * 100n;
  const denominator = BigInt(10 ** currencyDecimals(sourceCurrency)) * 100_000_000n;
  const cents = (numerator + denominator / 2n) / denominator;
  const result = Number(cents);
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error('Converted amount is outside the supported range');
  return result;
}
