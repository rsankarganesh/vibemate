import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {ExpenseForm} from '../src/components/ExpenseForm';
import {getAudExchangeRate} from '../src/services/exchange-rate';

vi.mock('../src/services/exchange-rate', () => ({getAudExchangeRate: vi.fn()}));
afterEach(() => {cleanup(); vi.resetAllMocks();});
const members = [{id: 'a', name: 'Alex', initials: 'AL', color: '#000'}, {id: 'b', name: 'Bea', initials: 'BE', color: '#111'}];

it('keeps AUD simple when international expenses are disabled', () => {
  render(<ExpenseForm members={members} onSave={() => {}}/>);
  expect(screen.queryByLabelText('Paid in')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Amount (AUD)')).toBeInTheDocument();
});

it('loads, displays and saves a dated reference rate when enabled', async () => {
  const save = vi.fn();
  vi.mocked(getAudExchangeRate).mockResolvedValue({base: 'USD', quote: 'AUD', rate: 1.5, date: '2026-09-17', provider: 'ECB via Frankfurter'});
  render(<ExpenseForm members={members} multiCurrencyEnabled onSave={save}/>);
  fireEvent.change(screen.getByLabelText('Description'), {target: {value: 'Hotel'}});
  fireEvent.change(screen.getByLabelText('Paid in'), {target: {value: 'USD'}});
  fireEvent.change(screen.getByLabelText('Amount (USD)'), {target: {value: '10.25'}});
  fireEvent.change(screen.getByLabelText('Date'), {target: {value: '2026-09-17'}});
  fireEvent.click(screen.getByRole('button', {name: 'Get rate'}));
  expect(await screen.findByText(/USD.*10\.25 = \$15\.38/)).toBeInTheDocument();
  expect(screen.getByText(/ECB via Frankfurter/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'Save expense'}));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0][0]).toMatchObject({amountCents: 1538, originalCurrency: 'USD', originalAmountMinor: 1025, exchangeRate: 1.5, exchangeRateDate: '2026-09-17'});
});

it('does not save a foreign expense before the reference rate is loaded', async () => {
  const save = vi.fn();
  render(<ExpenseForm members={members} multiCurrencyEnabled onSave={save}/>);
  fireEvent.change(screen.getByLabelText('Description'), {target: {value: 'Taxi'}});
  fireEvent.change(screen.getByLabelText('Paid in'), {target: {value: 'INR'}});
  fireEvent.change(screen.getByLabelText('Amount (INR)'), {target: {value: '100'}});
  fireEvent.click(screen.getByRole('button', {name: 'Save expense'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Get the AUD reference rate');
  expect(save).not.toHaveBeenCalled();
});
