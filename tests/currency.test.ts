import {describe, expect, it} from 'vitest';
import {convertMinorUnits, parseCurrencyAmount} from '../src/lib/currency';

describe('currency conversion', () => {
  it('converts two-decimal currencies to exact AUD cents', () => {
    expect(parseCurrencyAmount('10.25', 'USD')).toBe(1025);
    expect(convertMinorUnits(1025, 'USD', 1.5)).toBe(1538);
  });
  it('handles zero-decimal currencies', () => {
    expect(parseCurrencyAmount('1000', 'JPY')).toBe(1000);
    expect(convertMinorUnits(1000, 'JPY', 0.01)).toBe(1000);
    expect(() => parseCurrencyAmount('1000.50', 'JPY')).toThrow();
  });
  it('rejects invalid and unsafe values', () => {
    expect(() => parseCurrencyAmount('1.234', 'EUR')).toThrow();
    expect(() => convertMinorUnits(100, 'USD', 0)).toThrow();
  });
});
