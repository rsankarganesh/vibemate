import { useEffect, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Pencil, Plus, Share2, ShieldCheck, Trash2 } from 'lucide-react';
import { Logo } from './components/Logo';
import { VibeCard } from './components/VibeCard';
import { ExpenseForm } from './components/ExpenseForm';
import { Modal } from './components/Modal';
import { calculateBalances, suggestSettlements } from './lib/finance';
import { formatMoney } from './lib/money';
import { getMemberships, type StoredMembership } from './lib/storage';
import { go, parseHash } from './lib/router';
import { createLiveVibe, deleteLiveExpense, joinLiveVibe, loadLiveVibe, previewInvite, saveLiveExpense, settleLive, updateLiveExpense } from './services/vibe-service';
import type { Expense, Vibe } from './types';

const Header = ({ back = false }: { back?: boolean }) => { const name = localStorage.getItem('vibemate-display-name') || ''; const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'VM'; return <header className="topbar">{back ? <button className="icon-btn" onClick={() => history.back()} aria-label="Go back"><ArrowLeft /></button> : <Logo />}<span className="demo-badge live-badge">Live</span><button className="avatar" aria-label="Your profile">{initials}</button></header>; };
const Loading = () => <main className="page"><div className="empty"><h2>Loading your vibes…</h2></div></main>;

export default function LiveApp() {
  const [route, setRoute] = useState(parseHash());
  const [vibes, setVibes] = useState<Vibe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [toast, setToast] = useState('');
  const refresh = async () => { setLoading(true); try { setVibes(await Promise.all(getMemberships().map(loadLiveVibe))); setError(''); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Couldn’t load your vibes'); } finally { setLoading(false); } };
  useEffect(() => { void refresh(); const changed = () => setRoute(parseHash()); addEventListener('hashchange', changed); addEventListener('focus', refresh); return () => { removeEventListener('hashchange', changed); removeEventListener('focus', refresh); }; }, []);
  const notify = (message: string) => { setToast(message); setTimeout(() => setToast(''), 2200); };
  if (route.page === 'create') return <CreateLive onDone={async (membership) => { await refresh(); go(`/vibe/${membership.vibeId}`); }} />;
  if (route.page === 'join') return <JoinLive token={route.token || ''} onDone={async (membership) => { await refresh(); go(`/vibe/${membership.vibeId}`); }} />;
  if (loading) return <><Header /><Loading /></>;
  if (error) return <><Header /><main className="page"><div className="empty"><h2>Couldn’t load VibeMate</h2><p>{error}</p><button className="primary" onClick={refresh}>Try again</button></div></main></>;
  const vibe = vibes.find((item) => item.id === route.id);
  if (vibe) {
    const balances = calculateBalances(vibe.members.map((member) => member.id), vibe.expenses, vibe.settlements);
    const me = balances.find((balance) => balance.memberId === 'alex')!;
    const transfers = suggestSettlements(balances);
    const membership = getMemberships().find((item) => item.vibeId === vibe.id)!;
    const admin = vibe.members.find((member) => member.id === 'alex')?.isAdmin;
    const closeExpense = () => { setModal(false); setEditing(null); };
    return <><Header back /><main className="page vibe-page">
      <section className="vibe-hero"><div className="vibe-title"><span>{vibe.emoji}</span><div><p className="eyebrow">{vibe.type}</p><h1>{vibe.name}</h1></div></div><p>{vibe.when} · {vibe.location}</p><button className="share" onClick={() => { navigator.clipboard.writeText(`${location.origin}${location.pathname}#/join/${vibe.inviteToken}`); notify('Invite link copied ✓'); }}><Share2 /> Copy invite</button></section>
      <section className="balance-feature"><p>Your balance</p><h2>{me.balanceCents >= 0 ? 'You’re owed' : 'You owe'} {formatMoney(Math.abs(me.balanceCents))}</h2><div><span><small>You paid</small><strong>{formatMoney(me.paidCents)}</strong></span><span><small>Fair share</small><strong>{formatMoney(me.shareCents)}</strong></span></div></section>
      <button className="primary full add-expense" onClick={() => setModal(true)}><Plus /> Add expense</button>
      <section><div className="section-heading"><h2>Expenses</h2></div><div className="expense-list">{vibe.expenses.filter((expense) => !expense.deletedAt).reverse().map((expense) => <article className="expense-row" key={expense.id}>
        <span className="expense-icon">🧾</span><div><strong>{expense.description}</strong><p>Paid by {vibe.members.find((member) => member.id === expense.paidBy)?.name}</p></div>
        <span><strong>{formatMoney(expense.amountCents)}</strong><small>{expense.date}</small>{admin && <><button className="text-btn" aria-label={`Edit ${expense.description}`} onClick={() => setEditing(expense)}><Pencil />Edit</button><button className="text-btn danger" aria-label={`Delete ${expense.description}`} onClick={async () => { if (!confirm(`Delete “${expense.description}”? This will remain in the activity log.`)) return; try { await deleteLiveExpense(membership, expense.id); await refresh(); notify('Expense deleted ✓'); } catch (caught) { notify(caught instanceof Error ? caught.message : 'Couldn’t delete expense'); } }}><Trash2 />Delete</button></>}</span>
      </article>)}{!vibe.expenses.some((expense) => !expense.deletedAt) && <div className="empty"><p>No expenses yet. Someone has to buy the first round!</p></div>}</div></section>
      <section><div className="section-heading"><h2>Settle up</h2></div>{transfers.map((transfer, index) => <article className="settlement" key={index}><div><strong>{vibe.members.find((member) => member.id === transfer.fromMemberId)?.name} pays {vibe.members.find((member) => member.id === transfer.toMemberId)?.name}</strong><h2>{formatMoney(transfer.amountCents)}</h2></div><button className="secondary" onClick={async () => { await settleLive(membership, transfer.fromMemberId, transfer.toMemberId, transfer.amountCents); await refresh(); notify('Payment marked as settled ✓'); }}>Mark as paid</button></article>)}</section>
    </main>
    {modal && <Modal title="Add an expense" onClose={closeExpense}><ExpenseForm members={vibe.members} onSave={async (expense) => { await saveLiveExpense(membership, expense); closeExpense(); await refresh(); notify('Expense added ✓'); }} /></Modal>}
    {editing && <Modal title="Edit expense" onClose={closeExpense}><ExpenseForm members={vibe.members} initial={editing} onSave={async (expense) => { await updateLiveExpense(membership, expense); closeExpense(); await refresh(); notify('Expense updated and logged ✓'); }} /></Modal>}
    {toast && <div className="toast"><Check />{toast}</div>}</>;
  }
  return <><Header /><main className="page"><section className="welcome"><div><p className="eyebrow">PRIVATE FRIENDS PILOT</p><h1>Hey, Alex 👋</h1><p>Plan good times and split the tab fairly.</p></div><button className="primary" onClick={() => go('/create')}><Plus /> Create a Vibe</button></section>{vibes.length ? <section className="vibe-grid">{vibes.map((item) => <VibeCard key={item.id} vibe={item} />)}</section> : <div className="empty"><span>👀</span><h2>No vibes yet</h2><p>Create one and bring the crew together.</p><button className="primary" onClick={() => go('/create')}>Create a Vibe</button></div>}</main></>;
}

function CreateLive({ onDone }: { onDone: (membership: StoredMembership) => void }) {
  const [name, setName] = useState(''), [location, setLocation] = useState(''), [date, setDate] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <><Header back /><main className="page form-page"><p className="eyebrow">NEW PLAN</p><h1>Create a Vibe</h1><form className="stack" onSubmit={async (event) => { event.preventDefault(); setBusy(true); try { onDone(await createLiveVibe({ id: '', name, emoji: '🍻', type: 'Drinks', when: date, startsAt: date, location, description: '', currency: 'AUD', maxMembers: 10, status: 'active', members: [], expenses: [], settlements: [], activity: [] })); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Couldn’t create vibe'); } finally { setBusy(false); } }}><label>Vibe name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Friday Drinks" /></label><label>When<input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>General location<input required value={location} onChange={(event) => setLocation(event.target.value)} placeholder="South Bank" /></label>{error && <p className="form-error">{error}</p>}<button disabled={busy} className="primary full">{busy ? 'Creating…' : 'Create my Vibe'} <ChevronRight /></button></form></main></>;
}

function JoinLive({ token, onDone }: { token: string; onDone: (membership: StoredMembership) => void }) {
  const [preview, setPreview] = useState<{ name: string; emoji: string; location: string } | null>(null), [name, setName] = useState(''), [error, setError] = useState('');
  useEffect(() => { previewInvite(token).then(setPreview).catch((caught) => setError(caught.message)); }, [token]);
  return <><Header back /><main className="page join-page">{preview ? <><div className="join-icon">{preview.emoji}</div><p className="eyebrow">YOU’VE BEEN INVITED</p><h1>Join {preview.name}</h1><p className="lede">{preview.location}</p><label>Your name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter your name" /></label><button className="primary full" onClick={async () => { try { onDone(await joinLiveVibe(token, name)); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Couldn’t join'); } }}>Join the Vibe</button></> : <Loading />}{error && <p className="form-error">{error}</p>}<p className="private-note"><ShieldCheck />Private invite · No Google login required</p></main></>;
}
