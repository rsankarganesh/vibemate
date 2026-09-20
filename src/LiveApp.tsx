import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import {SettlementPlanner} from './components/SettlementPlanner';
import { Logo } from './components/Logo';
import { VibeCard } from './components/VibeCard';
import { ExpenseForm } from './components/ExpenseForm';
import {VibeTabs} from './components/Nav';
import { Modal } from './components/Modal';
import {VibeOverview} from './components/VibeOverview';
import { calculateBalances, suggestSettlements } from './lib/finance';
import { formatMoney } from './lib/money';
import { getMemberships, type StoredMembership } from './lib/storage';
import { go, parseHash } from './lib/router';
import {syncCurrentPhoneMemberships} from './services/phone-auth';
import { createLiveVibe, deleteLiveExpense, joinLiveVibe, loadLiveVibe, previewInvite, saveLiveExpense, settleLive, updateLiveExpense } from './services/vibe-service';
import type { Expense, Vibe } from './types';

const Header = ({ back = false }: { back?: boolean }) => { const name = localStorage.getItem('vibemate-display-name') || ''; const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'VM'; return <header className="topbar">{back ? <button className="icon-btn" onClick={() => go('/vibes')} aria-label="Go back"><ArrowLeft /></button> : <Logo />}<span className="demo-badge live-badge">Live</span><button className="avatar" aria-label="Your profile" onClick={() => go('/profile')}>{initials}</button></header>; };
const Loading = () => <main className="page"><div className="empty"><h2>Loading your vibes…</h2></div></main>;

export default function LiveApp() {
  const [route, setRoute] = useState(parseHash());
  const [vibes, setVibes] = useState<Vibe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [paying, setPaying] = useState(false);
  const [payment, setPayment] = useState<ReturnType<typeof suggestSettlements>[number] | null>(null);
  useEffect(() => { setQuery(''); setEditing(null); setPayment(null); setModal(route.page === 'add'); }, [route.page, route.id]);
  const refresh = async () => { setLoading(true); try { setVibes(await Promise.all(getMemberships().map(loadLiveVibe))); setError(''); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Couldn’t load your vibes'); } finally { setLoading(false); } };
  useEffect(() => { void refresh(); const changed = () => setRoute(parseHash()); addEventListener('hashchange', changed); addEventListener('focus', refresh); return () => { removeEventListener('hashchange', changed); removeEventListener('focus', refresh); }; }, []);
  const notify = (message: string) => { setToast(message); setTimeout(() => setToast(''), 2200); };
  if (route.page === 'create') return <CreateLive onDone={async (membership) => { await refresh(); go(`/vibe/${membership.vibeId}`); }} />;
  if (route.page === 'join') return <JoinLive token={route.token || ''} onDone={async (membership) => { await refresh(); go(`/vibe/${membership.vibeId}`); }} />;
  if (loading) return <><Header /><Loading /></>;
  if (error) return <><Header /><main className="page"><div className="empty"><h2>Couldn’t load Vibemates</h2><p>{error}</p><button className="primary" onClick={refresh}>Try again</button></div></main></>;
  const vibe = vibes.find((item) => item.id === route.id);
  if (route.id && !vibe) return <><Header back/><main className="page"><div className="empty"><h1>Vibe not found</h1><p>This browser doesn’t have access to this vibe. Ask the creator for an invite.</p><button className="primary" onClick={() => go('/vibes')}>Back to vibes</button></div></main></>;
  if (vibe) {
    const balances = calculateBalances(vibe.members.map((member) => member.id), vibe.expenses, vibe.settlements);
    const me = balances.find((balance) => balance.memberId === 'alex')!;
    const membership = getMemberships().find((item) => item.vibeId === vibe.id)!;
    const admin = vibe.members.find((member) => member.id === 'alex')?.isAdmin;
    const closeExpense = () => { setModal(false); setEditing(null); if (route.page === 'add') go(`/vibe/${vibe.id}/expenses`); };
    return <><Header back /><main className="page vibe-page">
      {route.page === 'vibe' ? <VibeOverview vibe={vibe} membership={membership} admin={admin} navigation={<VibeTabs id={vibe.id}/>} onRefresh={refresh} notify={notify}/> : <><section className="vibe-hero compact-hero"><div className="vibe-title"><span>{vibe.emoji}</span><div><p className="eyebrow">{vibe.type}</p><h1>{vibe.name}</h1></div></div><p>{vibe.when} · {vibe.location}</p></section><VibeTabs id={vibe.id}/>
      {route.page === 'expenses' && <><section className="balance-feature"><p>Your balance</p><h2>{me.balanceCents === 0 ? 'You’re all square' : `${me.balanceCents > 0 ? 'You’re owed' : 'You owe'} ${formatMoney(Math.abs(me.balanceCents))}`}</h2><div><span><small>You paid</small><strong>{formatMoney(vibe.expenses.filter(expense => !expense.deletedAt && expense.paidBy === 'alex').reduce((sum, expense) => sum + expense.amountCents, 0))}</strong></span><span><small>Fair share</small><strong>{formatMoney(me.shareCents)}</strong></span></div></section><button className="primary full add-expense" onClick={() => setModal(true)}><Plus /> Add expense</button><section><div className="section-heading"><h2>Expenses</h2></div><input aria-label="Search expenses" placeholder="Search expenses or categories" value={query} onChange={event => setQuery(event.target.value)}/><div className="expense-list">{vibe.expenses.filter((expense) => !expense.deletedAt && `${expense.description} ${expense.category}`.toLowerCase().includes(query.toLowerCase())).reverse().map((expense) => <article className="expense-row" key={expense.id}>
        <span className="expense-icon">🧾</span><div><strong>{expense.description}</strong><p>Paid by {vibe.members.find((member) => member.id === expense.paidBy)?.name}</p></div>
        <span><strong>{formatMoney(expense.amountCents)}</strong><small>{expense.date}</small>{admin && <><button className="text-btn" aria-label={`Edit ${expense.description}`} onClick={() => setEditing(expense)}><Pencil />Edit</button><button className="text-btn danger" aria-label={`Delete ${expense.description}`} onClick={async () => { if (!confirm(`Delete “${expense.description}”? This will remain in the activity log.`)) return; try { await deleteLiveExpense(membership, expense.id); await refresh(); notify('Expense deleted ✓'); } catch (caught) { notify(caught instanceof Error ? caught.message : 'Couldn’t delete expense'); } }}><Trash2 />Delete</button></>}</span>
      </article>)}{!vibe.expenses.some((expense) => !expense.deletedAt && `${expense.description} ${expense.category}`.toLowerCase().includes(query.toLowerCase())) && <div className="empty"><p>{query ? 'No matching expenses. Try another search.' : 'No expenses yet. Add your first shared cost.'}</p></div>}</div></section></>}
      {route.page === 'settle' && <SettlementPlanner key={vibe.id} vibe={vibe} onRecord={setPayment}/>}</>}
    </main>
    {payment && <Modal title="Record this payment?" onClose={() => { if (!paying) setPayment(null); }}><div className="stack"><p>{vibe.members.find(member => member.id === payment.fromMemberId)?.name} paid {vibe.members.find(member => member.id === payment.toMemberId)?.name} <strong>{formatMoney(payment.amountCents)}</strong>.</p><p className="helper">Confirm only after the money has been paid.</p><button className="primary" disabled={paying} onClick={async () => {if (paying) return; setPaying(true); try {await settleLive(membership, payment.fromMemberId, payment.toMemberId, payment.amountCents); setPayment(null); await refresh(); notify('Payment recorded');} catch (caught) {notify(caught instanceof Error ? caught.message : 'Couldn’t record payment');} finally {setPaying(false);}}}>{paying ? 'Recording…' : 'Confirm payment received'}</button><button className="secondary" disabled={paying} onClick={() => setPayment(null)}>Not yet</button></div></Modal>}
    {modal && <Modal title="Add an expense" onClose={closeExpense}><ExpenseForm members={vibe.members} multiCurrencyEnabled={vibe.multiCurrencyEnabled} onSave={async (expense) => { await saveLiveExpense(membership, expense); closeExpense(); await refresh(); notify('Expense added ✓'); }} /></Modal>}
    {editing && <Modal title="Edit expense" onClose={closeExpense}><ExpenseForm members={vibe.members} multiCurrencyEnabled={vibe.multiCurrencyEnabled} initial={editing} onSave={async (expense) => { await updateLiveExpense(membership, expense); closeExpense(); await refresh(); notify('Expense updated and logged ✓'); }} /></Modal>}
    {toast && <div className="toast" role="status"><Check />{toast}</div>}</>;
  }
  return <><Header /><main className="page"><section className="welcome"><div><p className="eyebrow">PRIVATE FRIENDS PILOT</p><h1>Hey, {localStorage.getItem('vibemate-display-name') || 'mate'} 👋</h1><p>Plan good times and split the tab fairly.</p></div><button className="primary" onClick={() => go('/create')}><Plus /> Create a Vibe</button></section>{vibes.length ? <section className="vibe-grid">{vibes.map((item) => <VibeCard key={item.id} vibe={item} />)}</section> : <div className="empty"><span>👀</span><h2>No vibes yet</h2><p>Create one and bring the crew together.</p><button className="primary" onClick={() => go('/create')}>Create a Vibe</button></div>}</main></>;
}

function CreateLive({ onDone }: { onDone: (membership: StoredMembership) => void | Promise<void> }) {
  const [name, setName] = useState(''), [location, setLocation] = useState(''), [date, setDate] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [type, setType] = useState('Drinks'), [emoji, setEmoji] = useState('🍻'), [maxMembers, setMaxMembers] = useState(10), [international, setInternational] = useState(false);
  return <><Header back /><main className="page form-page"><p className="eyebrow">NEW PLAN</p><h1>Create a Vibe</h1><form className="stack" onSubmit={async (event) => { event.preventDefault(); if (!name.trim() || !location.trim()) {setError('Enter a vibe name and location.'); return;} setBusy(true); setError(''); try { await onDone(await createLiveVibe({ id: '', name: name.trim(), emoji, type, when: date, startsAt: date, location: location.trim(), description: '', currency: 'AUD', multiCurrencyEnabled: international, maxMembers, status: 'active', members: [], expenses: [], settlements: [], activity: [] })); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Couldn’t create vibe'); } finally { setBusy(false); } }}><label>Vibe name<input required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Friday Drinks" /></label><div className="emoji-picker" role="group" aria-label="Choose an emoji">{['🍻', '🍽️', '🎉', '🌴', '🎬', '🏕️'].map(item => <button type="button" key={item} aria-pressed={emoji === item} className={emoji === item ? 'selected' : ''} onClick={() => setEmoji(item)}>{item}</button>)}</div><div className="two-col"><label>Type<select value={type} onChange={event => setType(event.target.value)}>{['Drinks', 'Dinner', 'Party', 'Trip', 'Activity', 'Other'].map(item => <option key={item}>{item}</option>)}</select></label><label>Maximum mates<input type="number" required min={2} max={100} value={maxMembers} onChange={event => setMaxMembers(Number(event.target.value))}/></label></div><label>Date and time<input required type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>General location<input required value={location} onChange={(event) => setLocation(event.target.value)} placeholder="South Bank" /></label><details className="optional-settings"><summary>International trip options</summary><label className="switch-row"><input type="checkbox" checked={international} onChange={event => setInternational(event.target.checked)}/><span><strong>Allow expenses in foreign currencies</strong><small>All balances and settlement remain in AUD.</small></span></label></details>{error && <p className="form-error">{error}</p>}<button disabled={busy} className="primary full">{busy ? 'Creating…' : 'Create my Vibe'} <ChevronRight /></button></form></main></>;
}

function JoinLive({token, onDone}: {token: string; onDone: (membership: StoredMembership) => void | Promise<void>}) {
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewInvite>> | null>(null);
  const [name, setName] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const onDoneRef = useRef(onDone);
  useEffect(() => {onDoneRef.current=onDone;}, [onDone]);
  useEffect(() => {let active = true; setLoading(true); setError(''); setPreview(null); const open = async () => {try {await syncCurrentPhoneMemberships(); const value=await previewInvite(token); if(!active)return; const membership=getMemberships().find(item=>item.vibeId===value.id); if(membership){await onDoneRef.current(membership);return;} setPreview(value);}catch{if(active)setError('This invite could not be opened. Check your connection or ask the creator for a new link.');}finally{if(active)setLoading(false);}}; void open(); return () => {active = false;};}, [token]);
  const join = async (displayName: string, claimId?: string) => {
    if (busy) return;
    if (displayName.trim().length < 2) return setError('Enter at least two characters for your name.');
    setBusy(true); setError('');
    try {await onDone(await joinLiveVibe(token, displayName.trim(), claimId));}
    catch (caught) {setError(caught instanceof Error ? caught.message : 'Couldn’t join. Try again.');}
    finally {setBusy(false);}
  };
  const existing = preview && getMemberships().find(item => item.vibeId === preview.id);
  return <><Header back/><main className="page join-page">{loading ? <p role="status">Opening your invite…</p> : preview ? <><div className="join-icon">{preview.emoji}</div><p className="eyebrow">YOU’VE BEEN INVITED</p><h1>Join {preview.name}</h1><p className="lede">{preview.location}</p>{existing ? <button className="primary" onClick={() => go(`/vibe/${existing.vibeId}`)}>You’re already a member · Open vibe</button> : <>{!!preview.unclaimed_members?.length && <><h3>Already on the list?</h3><p className="helper">Choose your name to keep your existing expenses and balance.</p><div className="claim-list">{preview.unclaimed_members.map(member => <button disabled={busy} key={member.id} onClick={() => join(member.name, member.id)}><span>{member.name.slice(0, 2).toUpperCase()}</span>{member.name}<ChevronRight/></button>)}</div><div className="or"><span/>or join as someone new<span/></div></>}<form className="stack" onSubmit={event => {event.preventDefault(); void join(name);}}><label>Your name<input required minLength={2} maxLength={60} value={name} onChange={event => setName(event.target.value)} placeholder="Enter your name"/></label><button disabled={busy} className="primary full">{busy ? 'Joining…' : 'Join the vibe'}</button></form></>}</> : <h1>Invite unavailable</h1>}{error && <p className="form-error" role="alert">{error}</p>}<p className="private-note"><ShieldCheck/>Private invite · Mobile account verified</p></main></>;
}
