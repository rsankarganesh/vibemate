import {expect, it} from 'vitest';
import {maskPhone, normalizeMobile} from '../src/lib/phone';
it('normalizes Australian and Indian mobile numbers into international format', () => {
  expect(normalizeMobile('0412 345 678', 'AU')).toBe('+61412345678');
  expect(normalizeMobile('+91 98765 43210', 'AU')).toBe('+919876543210');
  expect(normalizeMobile('9876543210', 'IN')).toBe('+919876543210');
});
it.each(['123', 'abc', '+123456789012345678', '02 9374 4000', '0412345678 ext 2'])('rejects invalid or non-mobile number %s', value => {
  expect(() => normalizeMobile(value, 'AU')).toThrow();
});
it('masks phone numbers in the profile', () => expect(maskPhone('+61412345678')).toBe('+61 •••• 5678'));
