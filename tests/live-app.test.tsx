import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {demoVibes} from '../src/services/demo-service';
import LiveApp from '../src/LiveApp';
import {LiveMembers} from '../src/LiveVibePages';
import {joinLiveVibe, loadLiveVibe, previewInvite, settleLive} from '../src/services/vibe-service';
import {syncCurrentPhoneMemberships} from '../src/services/phone-auth';

vi.mock('../src/services/vibe-service', () => ({
  addLiveAlbum: vi.fn(), addLiveMember: vi.fn(), archiveLiveVibe: vi.fn(), createLiveVibe: vi.fn(), deleteLiveExpense: vi.fn(), deleteLiveVibe: vi.fn(), joinLiveVibe: vi.fn(), leaveLiveVibe: vi.fn(), loadLiveVibe: vi.fn(), previewInvite: vi.fn(), recalculateLiveSplits: vi.fn(), removeLiveAlbum: vi.fn(), removeLiveMember: vi.fn(), saveLiveExpense: vi.fn(), setLiveMemberPhone: vi.fn(), setLiveRsvp: vi.fn(), settleLive: vi.fn(), updateLiveExpense: vi.fn(), updateLiveOverview: vi.fn(),
}));
vi.mock('../src/services/phone-auth', () => ({syncCurrentPhoneMemberships: vi.fn()}));
const membership = {vibeId: 'drinks', memberId: 'test-member', memberToken: 'test-token'};
beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  vi.mocked(syncCurrentPhoneMemberships).mockResolvedValue();
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

it('automatically opens an existing phone membership without allowing another join', async () => {
  location.hash = '#/join/test-invite';
  localStorage.setItem('vibemate-memberships', JSON.stringify({memberships: [membership]}));
  vi.mocked(previewInvite).mockResolvedValue({id: 'drinks', name: 'Friday Drinks', emoji: '🍻', location: 'South Bank', unclaimed_members: []});
  render(<LiveApp/>);
  await waitFor(() => expect(location.hash).toBe('#/vibe/drinks'));
  expect(syncCurrentPhoneMemberships).toHaveBeenCalledOnce();
  expect(joinLiveVibe).not.toHaveBeenCalled();
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

it('uses an in-app confirmation before permanently deleting a vibe', async () => {
  localStorage.setItem('vibemate-memberships', JSON.stringify({memberships: [membership]}));
  render(<LiveMembers vibe={structuredClone(demoVibes[1])} onRefresh={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button', {name: 'Delete vibe permanently'}));
  expect(screen.getByRole('dialog', {name: 'Delete this vibe permanently?'})).toBeInTheDocument();
  const confirmButton = screen.getAllByRole('button', {name: 'Delete vibe permanently'}).at(-1)!;
  expect(confirmButton).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Type .* to confirm/), {target: {value: demoVibes[1].name}});
  expect(confirmButton).toBeEnabled();
});
