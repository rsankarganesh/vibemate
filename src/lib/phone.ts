import {parsePhoneNumberFromString, type CountryCode} from 'libphonenumber-js/max';
export function normalizeMobile(value: string, country: CountryCode = 'AU'): string {
  if (!/^[+\d\s().-]+$/.test(value.trim())) throw new Error('Enter a mobile number using digits and an optional country code.');
  const phone = parsePhoneNumberFromString(value.trim(), country);
  if (!phone?.isValid() || phone.ext) throw new Error('Check your mobile number and country code.');
  const type = phone.getType();
  if (type !== 'MOBILE' && type !== 'FIXED_LINE_OR_MOBILE') throw new Error('Use a mobile number that can receive SMS.');
  return phone.number;
}
export function maskPhone(phone: string): string {
  return phone.length > 6 ? `${phone.slice(0, 3)} •••• ${phone.slice(-4)}` : phone;
}
export type DemoProfile = {name: string; phone: string; verified: false};
export function getDemoProfile(): DemoProfile | null {
  try {const value = JSON.parse(localStorage.getItem('vibemates-demo-profile') || 'null'); return value && typeof value.name === 'string' && typeof value.phone === 'string' ? {...value, verified: false} : null;} catch {return null;}
}
