import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import App from '../src/App';

beforeEach(() => {localStorage.clear(); location.hash = '#/'; vi.spyOn(window, 'scrollTo').mockImplementation(() => {});});
afterEach(() => {cleanup(); vi.restoreAllMocks();});
async function route(path: string) {await act(async () => {location.hash = `#${path}`; window.dispatchEvent(new HashChangeEvent('hashchange'));});}

it('creates a vibe, adds a mate, saves an expense, survives reload, edits and settles', async () => {
  const view = render(<App/>);
  await route('/create');
  fireEvent.change(screen.getByLabelText('Vibe name'), {target: {value: 'Weekend test'}});
  fireEvent.change(screen.getByLabelText('Maximum mates'), {target: {value: '3'}});
  fireEvent.click(screen.getByRole('button', {name: 'Create vibe'}));
  await screen.findByRole('heading', {name: 'Your mates (1/3)'});
  const id = location.hash.split('/')[2];
  fireEvent.click(screen.getByRole('button', {name: 'Add mate'}));
  fireEvent.change(screen.getByLabelText('Mate’s name'), {target: {value: 'Priya'}});
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', {name: 'Add mate'}));
  expect(screen.getByRole('heading', {name: 'Your mates (2/3)'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'Add expense'}));
  fireEvent.change(screen.getByLabelText('Description'), {target: {value: 'Dinner'}});
  fireEvent.change(screen.getByLabelText(/Amount/), {target: {value: '30.00'}});
  expect(screen.getAllByText('$15.00')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', {name: 'Save expense'}));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  view.unmount();
  render(<App/>);
  await route(`/vibe/${id}/expenses`);
  expect(screen.getByText('Dinner')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'Edit Dinner'}));
  fireEvent.change(screen.getByLabelText(/Amount/), {target: {value: '40.00'}});
  fireEvent.click(screen.getByRole('button', {name: 'Save changes'}));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByText('$40.00')).toBeInTheDocument();
  await route(`/vibe/${id}/settle`);
  expect(screen.getByRole('heading', {name: '$20.00'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'Record payment'}));
  fireEvent.click(screen.getByRole('button', {name: 'Not yet'}));
  expect(screen.getByRole('button', {name: 'Record payment'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'Record payment'}));
  fireEvent.click(screen.getByRole('button', {name: 'Confirm payment received'}));
  expect(screen.getByRole('heading', {name: 'Everyone is settled!'})).toBeInTheDocument();
  expect(screen.getByRole('heading', {name: 'Recorded payments'})).toBeInTheDocument();
  await route(`/vibe/${id}/activity`);
  expect(screen.getByText(/recorded a payment/)).toBeInTheDocument();
});

it('searches expenses and excludes a deleted expense from totals', async () => {
  render(<App/>);
  await route('/vibe/drinks/expenses');
  fireEvent.change(screen.getByLabelText('Search expenses'), {target: {value: 'Pizza'}});
  expect(screen.queryByText('First round')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'Delete Pizza'}));
  fireEvent.click(screen.getByRole('button', {name: 'Delete expense'}));
  expect(screen.getByRole('heading', {name: 'No matching expenses'})).toBeInTheDocument();
  await route('/vibes');
  expect(screen.getByRole('button', {name: /Friday Drinks/})).toHaveTextContent('$125.40 spent');
});

it('makes demo invite limitations clear instead of pretending to join', async () => {
  render(<App/>);
  await route('/join/DEMO');
  expect(screen.getByRole('heading', {name: 'Invites need a live connection'})).toBeInTheDocument();
  expect(screen.queryByText('You’re in!')).not.toBeInTheDocument();
});
