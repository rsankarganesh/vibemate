import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {demoVibes} from '../src/services/demo-service';
import LiveApp from '../src/LiveApp';
import {joinLiveVibe, loadLiveVibe, previewInvite, settleLive} from '../src/services/vibe-service';

vi.mock('../src/services/vibe-service', () => ({
  createLiveVibe: vi.fn(), deleteLiveExpense: vi.fn(), joinLiveVibe: vi.fn(), loadLiveVibe: vi.fn(), previewInvite: vi.fn(), saveLiveExpense: vi.fn(), settleLive: vi.fn(), updateLiveExpense: vi.fn(),
}));
const membership = {vibeId: 'drinks', memberId: 'test-member', memberToken: 'test-token'};
beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  vi.mocked(loadLiveVibe).mockResolvedValue(structuredClone(demoVibes[1]));
});
afterEach(cleanup);

it('shows a failed invite without an endless loading message', async () => {
  location.hash = '#/join/missing';
  vi.mocked(previewInvite).mockRejectedValue(new Error('offline'));
  render(<LiveApp/>);
  expect(await screen.findByRole('heading', {name: 'Invite unavailable'})).toBeInTheDocument();
  expect(screen.queryByText('Opening your invite…')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('ask the creator for a new link');
});

it('claims an existing member instead of creating a duplicate identity', async () => {
  location.hash = '#/join/test-invite';
  vi.mocked(previewInvite).mockResolvedValue({id: 'drinks', name: 'Friday Drinks', emoji: '🍻', location: 'South Bank', unclaimed_members: [{id: 'priya', name: 'Priya'}]});
  vi.mocked(joinLiveVibe).mockResolvedValue(membership);
  render(<LiveApp/>);
  fireEvent.click(await screen.findByRole('button', {name: 'PR Priya'}));
  await waitFor(() => expect(joinLiveVibe).toHaveBeenCalledWith('test-invite', 'Priya', 'priya'));
});

it('opens an existing membership without allowing another join', async () => {
  location.hash = '#/join/test-invite';
  localStorage.setItem('vibemate-memberships', JSON.stringify({memberships: [membership]}));
  vi.mocked(previewInvite).mockResolvedValue({id: 'drinks', name: 'Friday Drinks', emoji: '🍻', location: 'South Bank', unclaimed_members: []});
  render(<LiveApp/>);
  expect(await screen.findByRole('button', {name: 'You’re already a member · Open vibe'})).toBeInTheDocument();
  expect(screen.queryByRole('button', {name: 'Join the vibe'})).not.toBeInTheDocument();
});

it('keeps payment confirmation available when recording fails', async () => {
  location.hash = '#/vibe/drinks/settle';
  localStorage.setItem('vibemate-memberships', JSON.stringify({memberships: [membership]}));
  vi.mocked(settleLive).mockRejectedValue(new Error('Connection lost. Try again.'));
  render(<LiveApp/>);
  fireEvent.click((await screen.findAllByRole('button', {name: 'Record payment'}))[0]);
  fireEvent.click(screen.getByRole('button', {name: 'Confirm payment received'}));
  expect(await screen.findByRole('status')).toHaveTextContent('Connection lost. Try again.');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Confirm payment received'})).toBeEnabled();
});
