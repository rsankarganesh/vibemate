import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {PhoneOnboarding} from '../src/components/PhoneOnboarding';
import {sendPhoneCode, verifyPhoneCode} from '../src/services/phone-auth';
vi.mock('../src/services/phone-auth', () => ({sendPhoneCode: vi.fn(), verifyPhoneCode: vi.fn()}));
beforeEach(() => {localStorage.clear(); vi.resetAllMocks();});
afterEach(cleanup);
const fill = (number = '0412 345 678') => {fireEvent.change(screen.getByLabelText('Your name'), {target: {value: 'Sankar'}}); fireEvent.change(screen.getByLabelText('Mobile number'), {target: {value: number}});};
it('checks demo numbers without pretending to verify ownership or send SMS', async () => {
  const done = vi.fn(); render(<PhoneOnboarding demo onDone={done}/>); fill();
  fireEvent.click(screen.getByRole('button', {name: 'Continue in demo'}));
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(JSON.parse(localStorage.getItem('vibemates-demo-profile')!)).toEqual({name: 'Sankar', phone: '+61412345678', verified: false});
  expect(sendPhoneCode).not.toHaveBeenCalled();
});
it('blocks invalid numbers before requesting a code', async () => {
  render(<PhoneOnboarding onDone={() => {}}/>); fill('123');
  fireEvent.click(screen.getByRole('button', {name: 'Send verification code'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Check your mobile number');
  expect(sendPhoneCode).not.toHaveBeenCalled();
});
it('requires a successful code verification and offers recovery on wrong code', async () => {
  const done = vi.fn(); vi.mocked(sendPhoneCode).mockResolvedValue(); vi.mocked(verifyPhoneCode).mockRejectedValueOnce(new Error('That code is invalid or expired.')).mockResolvedValueOnce();
  render(<PhoneOnboarding onDone={done}/>); fill(); fireEvent.click(screen.getByRole('button', {name: 'Send verification code'}));
  const code = await screen.findByLabelText('Verification code');
  expect(sendPhoneCode).toHaveBeenCalledWith('+61412345678', 'Sankar');
  expect(screen.getByRole('button', {name: /Resend code in/})).toBeDisabled();
  fireEvent.change(code, {target: {value: '123456'}}); fireEvent.click(screen.getByRole('button', {name: 'Verify & continue'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('invalid or expired'); expect(done).not.toHaveBeenCalled();
  fireEvent.change(code, {target: {value: '654321'}}); fireEvent.click(screen.getByRole('button', {name: 'Verify & continue'}));
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
});
