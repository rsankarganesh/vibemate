import {useEffect, useState} from 'react';
import {ArrowLeft, Check, ChevronRight, Link2, Moon, Pencil, Plus, Receipt, RefreshCw, Share2, ShieldCheck, Sun, Trash2, UserPlus} from 'lucide-react';
import {SettlementPlanner} from './components/SettlementPlanner';
import {PhoneProfile} from './components/PhoneProfile';
import {getDemoProfile} from './lib/phone';
import {Logo} from './components/Logo';
import {BottomNav, VibeTabs} from './components/Nav';
import {VibeCard} from './components/VibeCard';
import {Modal} from './components/Modal';
import {ExpenseForm} from './components/ExpenseForm';
import {calculateBalances, suggestSettlements} from './lib/finance';
import {formatMoney} from './lib/money';
import {go, parseHash} from './lib/router';
import {loadDemoVibes, saveDemoVibes, personalizeDemo} from './lib/demo-storage';
import type {Expense, Vibe} from './types';

function Header({back = false}: {back?: boolean}) {
  return <header className="topbar">{back ? <button className="icon-btn" onClick={() => go('/vibes')} aria-label="Back to vibes"><ArrowLeft/></button> : <Logo/>}<span className="demo-badge">Demo · saved on this device</span><button className="avatar" onClick={() => go('/profile')} aria-label="Your profile">{(getDemoProfile()?.name || 'Alex').slice(0,2).toUpperCase()}</button></header>;
}
function Empty({title, detail, action}: {title: string; detail: string; action?: React.ReactNode}) {
  return <div className="empty"><span>✨</span><h2>{title}</h2><p className="lede">{detail}</p>{action}</div>;
}
function Create({onCreate}: {onCreate: (vibe: Vibe) => void}) {
  const [name, setName] = useState(''), [emoji, setEmoji] = useState('🍻'), [type, setType] = useState('Drinks');
  const [place, setPlace] = useState(''), [date, setDate] = useState(''), [note, setNote] = useState(''), [max, setMax] = useState(10), [international, setInternational] = useState(false);
  return <><Header back/><main className="page form-page"><p className="eyebrow">STEP 1 · MAKE A PLAN</p><h1>Create a vibe</h1><p className="lede">Give it a name. You can add your mates and start splitting expenses next.</p>
    <form className="stack" onSubmit={event => {
      event.preventDefault();
      if (!name.trim()) return;
      onCreate({id: crypto.randomUUID(), name: name.trim(), emoji, type, when: date ? new Date(`${date}T12:00:00`).toLocaleDateString('en-AU', {day: 'numeric', month: 'short', year: 'numeric'}) : 'Date to be decided', startsAt: date, location: place.trim() || 'Location to be decided', description: note.trim(), currency: 'AUD', multiCurrencyEnabled: international, maxMembers: max, status: 'active', members: [{id: 'alex', name: getDemoProfile()?.name || 'Alex', initials: (getDemoProfile()?.name || 'Alex').slice(0,2).toUpperCase(), color: '#5B2EFF', isAdmin: true, claimed: true}], expenses: [], settlements: [], activity: []});
    }}>
      <label>Vibe name<input autoFocus required minLength={2} maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Weekend away"/></label>
      <div className="emoji-picker" role="group" aria-label="Choose an emoji">{['🍻', '🍽️', '🎉', '🌴', '🎬', '🏕️', '🎂'].map(item => <button type="button" aria-pressed={item === emoji} className={item === emoji ? 'selected' : ''} onClick={() => setEmoji(item)} key={item}>{item}</button>)}</div>
      <div className="two-col"><label>Type<select value={type} onChange={event => setType(event.target.value)}>{['Drinks', 'Dinner', 'Party', 'Trip', 'Activity', 'Celebration', 'Other'].map(item => <option key={item}>{item}</option>)}</select></label><label>Maximum mates<input type="number" required value={max} min={2} max={100} onChange={event => setMax(Number(event.target.value))}/></label></div>
      <label>When <small>Optional</small><input type="date" value={date} onChange={event => setDate(event.target.value)}/></label>
      <label>Location <small>Optional</small><input maxLength={120} value={place} onChange={event => setPlace(event.target.value)} placeholder="e.g. South Bank"/></label>
      <label>The plan <small>Optional</small><textarea maxLength={1000} value={note} onChange={event => setNote(event.target.value)} placeholder="Anything your mates should know?"/></label>
      <details className="optional-settings"><summary>International trip options</summary><label className="switch-row"><input type="checkbox" checked={international} onChange={event => setInternational(event.target.checked)}/><span><strong>Allow expenses in foreign currencies</strong><small>Balances and settlement stay in AUD. Each foreign expense saves its reference rate.</small></span></label></details>
      <p className="helper">The group currency is always Australian dollars (AUD).</p><button className="primary full">Create vibe <ChevronRight/></button>
    </form></main></>;
}
function Profile({count}: {count: number}) {
  const [theme, setTheme] = useState(localStorage.getItem('vibemate-theme') || 'system');
  return <><Header/><main className="page subpage"><p className="eyebrow">YOUR SPACE</p><h1>Your profile</h1><section className="profile-card"><span className="big-avatar">{(getDemoProfile()?.name || 'Alex').slice(0,2).toUpperCase()}</span><div><h2>{getDemoProfile()?.name || 'Alex'}</h2><p>Demo profile · {count} vibes</p></div></section>
    <section className="notice"><ShieldCheck/><div><strong>This is your local demo</strong><p>Your changes are saved in this browser. Try planning, splitting expenses, and recording payments. Invites across devices need a live connection.</p></div></section>
    <PhoneProfile/><section className="panel"><h2>Appearance</h2><div className="theme-switch">{[{id: 'light', icon: Sun}, {id: 'dark', icon: Moon}, {id: 'system', icon: RefreshCw}].map(({id, icon: Icon}) => <button key={id} aria-pressed={theme === id} className={theme === id ? 'active' : ''} onClick={() => {setTheme(id); localStorage.setItem('vibemate-theme', id); document.documentElement.dataset.theme = id;}}><Icon/>{id[0].toUpperCase() + id.slice(1)}</button>)}</div></section></main></>;
}
export default function App() {
  const [route, setRoute] = useState(parseHash), [vibes, setVibes] = useState(loadDemoVibes);
  const [modal, setModal] = useState<'expense' | 'member' | 'share' | 'settle' | 'delete' | null>(null);
  const [editing, setEditing] = useState<Expense | undefined>(), [memberName, setMemberName] = useState('');
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all'), [toast, setToast] = useState(''), [error, setError] = useState('');
  const [transfer, setTransfer] = useState<ReturnType<typeof suggestSettlements>[number] | null>(null);
  useEffect(() => {
    const profileChanged = () => {setRoute({...parseHash()}); setVibes(current => personalizeDemo(current));};
    addEventListener('vibemates-profile', profileChanged);
    return () => removeEventListener('vibemates-profile', profileChanged);
  }, []);
  useEffect(() => {
    const changed = () => {setRoute(parseHash()); setModal(null); setEditing(undefined); setQuery(''); setError(''); window.scrollTo(0, 0);};
    addEventListener('hashchange', changed); return () => removeEventListener('hashchange', changed);
  }, []);
  useEffect(() => {try {saveDemoVibes(vibes);} catch {setError('Your browser could not save these changes. Keep this tab open to avoid losing them.');}}, [vibes]);
  useEffect(() => {if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer);}, [toast]);
  const vibe = vibes.find(item => item.id === route.id);
  const close = () => {setModal(null); setEditing(undefined); setError('');};
  const add = () => {setEditing(undefined); setModal('expense');};
  const update = (change: (current: Vibe) => Vibe, action: string, detail: string) => {
    if (!vibe) return;
    setVibes(current => current.map(item => item.id === vibe.id ? {...change(item), activity: [...item.activity, {id: crypto.randomUUID(), actor: getDemoProfile()?.name || 'Alex', action, detail, timestamp: new Date().toLocaleString('en-AU'), icon: 'receipt'}]} : item));
  };
  const balances = vibe ? calculateBalances(vibe.members.map(member => member.id), vibe.expenses, vibe.settlements) : [];
  const transfers = suggestSettlements(balances);
  const me = balances.find(item => item.memberId === 'alex');
  const expenses = vibe?.expenses.filter(item => !item.deletedAt) ?? [];
  const total = expenses.reduce((sum, item) => sum + item.amountCents, 0);
  const memberLabel = (id: string) => vibe?.members.find(member => member.id === id)?.name || 'Mate';
  const expenseList = (items: Expense[], editable = false) => <div className="expense-list">{items.map(expense => <article className="expense-row" key={expense.id}><span className="expense-icon"><Receipt/></span><div><strong>{expense.description}</strong><p>{memberLabel(expense.paidBy)} paid · {expense.splitMemberIds.length} {expense.splitMemberIds.length === 1 ? 'person' : 'people'}</p><small>{expense.category}{expense.originalCurrency ? ` · converted from ${expense.originalCurrency}` : ''}{expense.note ? ` · ${expense.note}` : ''}</small>{editable && <div className="row-actions"><button className="text-btn" onClick={() => {setEditing(expense); setModal('expense');}} aria-label={`Edit ${expense.description}`}><Pencil/>Edit</button><button className="text-btn danger" onClick={() => {setEditing(expense); setModal('delete');}} aria-label={`Delete ${expense.description}`}><Trash2/>Delete</button></div>}</div><span><strong>{formatMoney(expense.amountCents)}</strong>{expense.originalCurrency && expense.originalAmountMinor !== undefined && <small>{new Intl.NumberFormat('en-AU', {style: 'currency', currency: expense.originalCurrency}).format(expense.originalAmountMinor / (expense.originalCurrency === 'JPY' || expense.originalCurrency === 'KRW' ? 1 : 100))}</small>}<small>{new Date(`${expense.date}T12:00:00`).toLocaleDateString('en-AU', {day: 'numeric', month: 'short'})}</small></span></article>)}</div>;
  let content;
  if (route.page === 'create') content = <Create onCreate={created => {setVibes(current => [created, ...current]); go(`/vibe/${created.id}/members`); setToast('Vibe created. Add your mates next.');}}/>;
  else if (route.page === 'profile') content = <Profile count={vibes.length}/>;
  else if (route.page === 'join') content = <><Header back/><main className="page subpage"><Empty title="Invites need a live connection" detail="This demo saves data only in your browser. You can add mates manually to try splitting expenses." action={<button className="primary" onClick={() => go('/vibes')}>Explore your vibes</button>}/></main></>;
  else if (vibe) content = <><Header back/><main className="page vibe-page"><section className="vibe-hero"><div className="vibe-title"><span>{vibe.emoji}</span><div><p className="eyebrow">{vibe.type} · {vibe.status}</p><h1>{vibe.name}</h1></div></div><p>{vibe.when} · {vibe.location}</p>{vibe.description && <p>{vibe.description}</p>}<div className="hero-actions"><button className="secondary small" onClick={() => setModal('member')}><UserPlus/>Add mate</button><button className="secondary small" onClick={() => setModal('share')}><Share2/>Invite</button></div></section><VibeTabs id={vibe.id}/>
    {route.page === 'vibe' && <>
      <section className="balance-feature"><p>Your balance</p><h2>{!me?.balanceCents ? 'You’re all square' : `${me.balanceCents > 0 ? 'You’re owed' : 'You owe'} ${formatMoney(Math.abs(me.balanceCents))}`}</h2><div><span><small>You paid in expenses</small><strong>{formatMoney(expenses.filter(item => item.paidBy === 'alex').reduce((sum, item) => sum + item.amountCents, 0))}</strong></span><span><small>Your fair share</small><strong>{formatMoney(me?.shareCents ?? 0)}</strong></span></div></section>
      <div className="overview-stats"><span><strong>{formatMoney(total)}</strong>Total spent</span><span><strong>{vibe.members.length}</strong>Mates</span><span><strong>{expenses.length}</strong>Expenses</span></div>
      <button className="primary full add-expense" onClick={add}><Plus/>Add expense</button>
      {vibe.members.length === 1 && <section className="notice"><UserPlus/><div><strong>Bring your mates into the plan</strong><p>Add the people sharing costs before recording your first expense.</p><button className="text-btn" onClick={() => setModal('member')}>Add your first mate</button></div></section>}
      <div className="section-heading"><h2>Recent expenses</h2><button onClick={() => go(`/vibe/${vibe.id}/expenses`)}>View all <ChevronRight/></button></div>
      {expenses.length ? expenseList([...expenses].reverse().slice(0, 4)) : <Empty title="No expenses yet" detail="Add a bill, choose who paid, and we’ll work out each person’s share."/>}
      <button className="settle-nudge" onClick={() => go(`/vibe/${vibe.id}/settle`)}><span>↗</span><div><strong>{transfers.length ? 'See who pays whom' : 'Everyone is settled'}</strong><p>{transfers.length ? `${transfers.length} suggested payments to settle the group.` : 'You’re ready for the next good time.'}</p></div><ChevronRight/></button>
    </>}
    {route.page === 'expenses' && <><div className="section-heading"><h2>Expenses</h2><button onClick={add}><Plus/>Add expense</button></div><div className="search"><Receipt/><input aria-label="Search expenses" placeholder="Search description, mate or category" value={query} onChange={event => setQuery(event.target.value)}/></div>{(() => {const found = [...expenses].reverse().filter(item => `${item.description} ${memberLabel(item.paidBy)} ${item.category}`.toLowerCase().includes(query.toLowerCase())); return found.length ? expenseList(found, true) : <Empty title={query ? 'No matching expenses' : 'No expenses yet'} detail={query ? 'Try another name or clear your search.' : 'Record your first shared cost to get started.'} action={<button className="secondary" onClick={() => query ? setQuery('') : add()}>{query ? 'Clear search' : 'Add expense'}</button>}/>;})()}</>}
    {route.page === 'members' && <><div className="section-heading"><h2>Your mates ({vibe.members.length}/{vibe.maxMembers})</h2></div><p className="lede">Add everyone sharing costs. New mates can be included in future expenses; existing splits stay as recorded.</p><div className="member-list">{vibe.members.map(member => {const balance = balances.find(item => item.memberId === member.id)!; return <article className="member-row" key={member.id}><span className="member-avatar" style={{background: member.color}}>{member.initials}</span><div><strong>{member.name}{member.id === 'alex' ? ' (you)' : ''}</strong><p>{member.isAdmin ? 'Admin' : 'Added to this vibe'}</p></div><span className={balance.balanceCents < 0 ? 'negative' : 'positive'}>{balance.balanceCents === 0 ? 'All square' : `${balance.balanceCents > 0 ? 'Gets back' : 'Owes'} ${formatMoney(Math.abs(balance.balanceCents))}`}</span></article>;})}</div></>}
    {route.page === 'settle' && <SettlementPlanner key={vibe.id} vibe={vibe} onRecord={item => {setTransfer(item); setModal('settle');}}/>}
    {route.page === 'activity' && <Activity items={[...vibe.activity].reverse()}/>}
  </main></>;
  else if (route.id) content = <><Header back/><main className="page"><Empty title="Vibe not found" detail="This vibe isn’t saved in this browser." action={<button className="primary" onClick={() => go('/vibes')}>Back to vibes</button>}/></main></>;
  else if (route.page === 'global-activity') content = <><Header/><main className="page subpage"><h1>Activity</h1><Activity items={vibes.flatMap(item => [...item.activity].reverse().map(activity => ({...activity, detail: `${item.name} · ${activity.detail}`})))}/></main></>;
  else {
    const own = vibes.flatMap(item => calculateBalances(item.members.map(member => member.id), item.expenses, item.settlements).filter(balance => balance.memberId === 'alex'));
    const owe = own.reduce((sum, item) => sum + Math.max(0, -item.balanceCents), 0), owed = own.reduce((sum, item) => sum + Math.max(0, item.balanceCents), 0);
    const shown = vibes.filter(item => (filter === 'all' || item.status === filter) && `${item.name} ${item.location}`.toLowerCase().includes(query.toLowerCase()));
    content = <><Header/><main className="page"><section className="welcome"><div><p className="eyebrow">GOOD TIMES, SIMPLE SPLITS</p><h1>{route.page === 'vibes' ? 'Your vibes' : `Hey, ${getDemoProfile()?.name || 'Alex'} 👋`}</h1><p>Make a plan. Add your mates. Share the costs.</p></div><button className="primary" onClick={() => go('/create')}><Plus/>Create a vibe</button></section>
      {route.page === 'home' && <section className="money-overview"><div><p>You owe your mates</p><h2>{formatMoney(owe)}</h2><span>{owe ? 'Open a vibe to see who to pay.' : 'No payments waiting on you.'}</span></div><div className="owed"><p>Mates owe you</p><strong>{formatMoney(owed)}</strong><span>Across your saved vibes</span></div></section>}
      <div className="section-heading"><h2>Your plans</h2><span className="helper">{vibes.length} vibes</span></div><div className="list-tools"><input aria-label="Search vibes" placeholder="Find a vibe or location" value={query} onChange={event => setQuery(event.target.value)}/><select aria-label="Filter vibes" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All vibes</option><option value="active">Active</option><option value="settled">Settled</option><option value="archived">Archived</option></select></div>
      {shown.length ? <section className="vibe-grid">{shown.map(item => <VibeCard key={item.id} vibe={item}/>)}</section> : <Empty title="No vibes found" detail="Try a different search or create a new plan." action={<button className="secondary" onClick={() => {setQuery(''); setFilter('all');}}>Clear filters</button>}/>}<p className="demo-explanation"><ShieldCheck/>Demo data is saved on this device. Shared invites need a live connection.</p></main></>;
  }
  return <>{content}{route.page !== 'create' && <BottomNav inside={!!vibe} onAdd={() => vibe ? add() : go('/create')}/>}
    {error && !modal && <div className="save-warning" role="alert">{error}</div>}
    {modal === 'expense' && vibe && <Modal title={editing ? 'Edit expense' : 'Add an expense'} onClose={close}><ExpenseForm members={vibe.members} initial={editing} multiCurrencyEnabled={vibe.multiCurrencyEnabled} onSave={expense => {update(current => ({...current, status: 'active', expenses: editing ? current.expenses.map(item => item.id === expense.id ? expense : item) : [...current.expenses, expense]}), editing ? 'updated an expense' : 'added an expense', `${expense.description} — ${formatMoney(expense.amountCents)}`); close(); setToast(editing ? 'Expense updated' : 'Expense added and split');}}/></Modal>}
    {modal === 'member' && vibe && <Modal title="Add a mate" onClose={close}><form className="stack" onSubmit={event => {event.preventDefault(); const name = memberName.trim(); if (name.length < 2) return setError('Enter at least two characters.'); if (vibe.members.length >= vibe.maxMembers) return setError(`This vibe is full (${vibe.maxMembers} mates).`); if (vibe.members.some(member => member.name.toLowerCase() === name.toLowerCase())) return setError('This mate is already listed.'); update(current => ({...current, members: [...current.members, {id: crypto.randomUUID(), name, initials: name.slice(0, 2).toUpperCase(), color: '#2878d0', claimed: false}]}), 'added a mate', name); setMemberName(''); close(); setToast(`${name} added`);}}><p className="lede">Add a name to include this person in shared expenses.</p><label>Mate’s name<input autoFocus required minLength={2} maxLength={60} value={memberName} onChange={event => {setMemberName(event.target.value); setError('');}} placeholder="e.g. Priya"/></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary full">Add mate</button></form></Modal>}
    {modal === 'share' && <Modal title="Invite your mates" onClose={close}><div className="stack"><Link2/><p className="lede">You’re using the local demo. Sharing an invite across devices needs a live Supabase connection. For now, add your mates by name to split costs on this device.</p><button className="primary" onClick={() => setModal('member')}><UserPlus/>Add a mate manually</button></div></Modal>}
    {modal === 'delete' && editing && <Modal title="Delete this expense?" onClose={close}><div className="stack"><p>Remove <strong>{editing.description} ({formatMoney(editing.amountCents)})</strong> from the group’s balances? Its activity history will be kept.</p><button className="primary" onClick={() => {update(current => ({...current, expenses: current.expenses.map(item => item.id === editing.id ? {...item, deletedAt: new Date().toISOString()} : item)}), 'deleted an expense', editing.description); close(); setToast('Expense deleted. Balances updated.');}}>Delete expense</button><button className="secondary" onClick={close}>Keep expense</button></div></Modal>}
    {modal === 'settle' && transfer && <Modal title="Record this payment?" onClose={close}><div className="stack"><p><strong>{memberLabel(transfer.fromMemberId)}</strong> paid <strong>{memberLabel(transfer.toMemberId)} {formatMoney(transfer.amountCents)}</strong>.</p><p className="helper">Only confirm once the money has been paid. This updates the balances without moving money.</p><button className="primary" onClick={() => {update(current => ({...current, settlements: [...current.settlements, {...transfer, id: crypto.randomUUID(), settledAt: new Date().toISOString()}]}), 'recorded a payment', `${memberLabel(transfer.fromMemberId)} → ${memberLabel(transfer.toMemberId)} · ${formatMoney(transfer.amountCents)}`); close(); setToast('Payment recorded. Balances updated.');}}>Confirm payment received</button><button className="secondary" onClick={close}>Not yet</button></div></Modal>}
    {toast && <div className="toast" role="status"><Check/>{toast}</div>}
  </>;
}
function Activity({items}: {items: Vibe['activity']}) {
  return items.length ? <div className="timeline">{items.map(item => <article key={item.id}><span><RefreshCw/></span><div><p><strong>{item.actor}</strong> {item.action}</p><small>{item.detail}</small><time>{item.timestamp}</time></div></article>)}</div> : <Empty title="No activity yet" detail="New mates, expenses, and payments will appear here."/>;
}
