import { Archive, Crown, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { BottomNav, VibeTabs } from './components/Nav';
import { Logo } from './components/Logo';
import { calculateBalances } from './lib/finance';
import { formatMoney } from './lib/money';
import { go } from './lib/router';
import { getMemberships } from './lib/storage';
import { normalizeMobile } from './lib/phone';
import { addLiveMember, archiveLiveVibe, recalculateLiveSplits, removeLiveMember, setLiveMemberPhone } from './services/vibe-service';
import type { Vibe } from './types';

const Head = () => <header className="topbar"><button className="icon-btn" aria-label="Back to vibes" onClick={() => go('/vibes')}>←</button><Logo /><span className="demo-badge live-badge">Live</span></header>;

export function LiveMembers({ vibe, onRefresh }: { vibe: Vibe; onRefresh: () => Promise<void> }) {
  const [open, setOpen] = useState(false), [name, setName] = useState(''), [phone, setPhone] = useState(''), [editingPhone, setEditingPhone] = useState(''), [memberPhone, setMemberPhone] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const membership = getMemberships().find((item) => item.vibeId === vibe.id)!;
  const admin = vibe.members.find((member) => member.id === 'alex')?.isAdmin;
  const balances = calculateBalances(vibe.members.map((member) => member.id), vibe.expenses, vibe.settlements);
  const remove = async (id: string, memberName: string) => {
    if (!confirm(`Remove ${memberName}? This is only allowed when they have no financial history.`)) return;
    try { await removeLiveMember(membership, id); await onRefresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Couldn’t remove member'); }
  };
  const recalculate = async () => {
    if (!confirm(`Recalculate every active expense equally across all ${vibe.members.length} current members? Use this only if every expense should include everyone.`)) return;
    try { setError(''); await recalculateLiveSplits(membership); await onRefresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Couldn’t recalculate expenses'); }
  };
  const archive = async () => {
    if (!confirm(`Archive “${vibe.name}”? Its financial history will be preserved.`)) return;
    try { await archiveLiveVibe(membership); await onRefresh(); go('/vibes'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Couldn’t archive vibe'); }
  };
  return <><Head /><main className="page subpage">
    <p className="eyebrow">{vibe.emoji} {vibe.name}</p><VibeTabs id={vibe.id}/>
    <div className="title-action"><h1>{vibe.members.length} mates</h1>{admin && <button className="primary small" onClick={() => setOpen(!open)}><UserPlus />Add mate</button>}</div>
    {error && <p className="form-error">{error}</p>}
    {open && <form className="panel stack" onSubmit={async (event) => { event.preventDefault(); if (busy) return; if (name.trim().length < 2) return setError('Enter at least two characters.'); setBusy(true); setError(''); try { const mobile=normalizeMobile(phone,'AU'); await addLiveMember(membership, name.trim(), mobile); setName(''); setPhone(''); setOpen(false); await onRefresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Couldn’t add member'); } finally {setBusy(false);} }}>
      <p className="helper">They’ll automatically see this vibe after verifying this mobile number.</p><label>Mate’s name<input required minLength={2} maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Priya" /></label><label>Mobile number<input required inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="e.g. 0412 345 678" /></label><button className="primary" disabled={busy}>{busy ? 'Adding…' : 'Add member'}</button>
    </form>}
    <div className="member-list">{vibe.members.map((member) => { const balance = balances.find((item) => item.memberId === member.id)!; return <article className="member-row" key={member.id}>
      <span className="member-avatar" style={{ background: member.color }}>{member.initials}</span>
      <div><strong>{member.name} {member.isAdmin && <small className="admin"><Crown />Admin</small>}</strong><p>{member.claimed ? 'Joined Vibemates' : 'Waiting for mobile verification'}</p>{admin && !member.claimed && (editingPhone===member.id ? <form className="inline-phone" onSubmit={async event=>{event.preventDefault();if(busy)return;setBusy(true);setError('');try{await setLiveMemberPhone(membership,member.id,normalizeMobile(memberPhone,'AU'));setEditingPhone('');setMemberPhone('');await onRefresh();}catch(caught){setError(caught instanceof Error?caught.message:'Couldn’t save mobile number');}finally{setBusy(false);}}}><input autoFocus required inputMode="tel" placeholder="0412 345 678" value={memberPhone} onChange={event=>setMemberPhone(event.target.value)}/><button className="secondary small" disabled={busy}>Save mobile</button></form> : <button className="text-btn" onClick={()=>{setEditingPhone(member.id);setMemberPhone('');}}>Add or change mobile</button>)}</div>
      <span><small>Paid {formatMoney(vibe.expenses.filter(expense => !expense.deletedAt && expense.paidBy === member.id).reduce((sum, expense) => sum + expense.amountCents, 0))}</small><strong className={balance.balanceCents >= 0 ? 'positive' : 'negative'}>{balance.balanceCents >= 0 ? 'Gets back' : 'Owes'} {formatMoney(Math.abs(balance.balanceCents))}</strong>{admin && !member.isAdmin && <button className="text-btn danger" onClick={() => remove(member.id, member.name)}><Trash2 />Remove</button>}</span>
    </article>; })}</div>
    {admin && <section className="danger-zone"><h2>Admin controls</h2><p>If every expense includes everyone, repair all fair shares after changing the member list.</p><button className="secondary full" onClick={recalculate}><RefreshCw />Recalculate all expenses equally</button><p>Archive a duplicate or finished vibe without erasing its history.</p><button className="secondary full danger" onClick={archive}><Archive />Archive this vibe</button></section>}
  </main><BottomNav inside onAdd={() => go(`/vibe/${vibe.id}/add`)} /></>;
}

export function LiveActivity({ vibe }: { vibe: Vibe }) {
  return <><Head /><main className="page subpage"><p className="eyebrow">{vibe.emoji} {vibe.name}</p><VibeTabs id={vibe.id}/><h1>Activity</h1>{vibe.activity.length ? <div className="timeline">{vibe.activity.map((activity) => <article key={activity.id}><span><RefreshCw /></span><div><p><strong>{activity.actor}</strong> {activity.action}</p><small>{activity.detail}</small><time>{activity.timestamp}</time></div></article>)}</div> : <div className="empty"><h2>No activity yet</h2></div>}</main><BottomNav inside onAdd={() => go(`/vibe/${vibe.id}/add`)} /></>;
}
