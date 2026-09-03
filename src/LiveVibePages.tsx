import { Archive, Crown, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { BottomNav } from './components/Nav';
import { Logo } from './components/Logo';
import { calculateBalances } from './lib/finance';
import { formatMoney } from './lib/money';
import { go } from './lib/router';
import { getMemberships } from './lib/storage';
import { addLiveMember, archiveLiveVibe, recalculateLiveSplits, removeLiveMember } from './services/vibe-service';
import type { Vibe } from './types';

const Head = () => <header className="topbar"><button className="icon-btn" onClick={() => history.back()}>←</button><Logo /><span className="demo-badge live-badge">Live</span></header>;

export function LiveMembers({ vibe, onRefresh }: { vibe: Vibe; onRefresh: () => Promise<void> }) {
  const [open, setOpen] = useState(false), [name, setName] = useState(''), [error, setError] = useState('');
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
    <p className="eyebrow">{vibe.emoji} {vibe.name}</p>
    <div className="title-action"><h1>{vibe.members.length} mates</h1>{admin && <button className="primary small" onClick={() => setOpen(!open)}><UserPlus />Add mate</button>}</div>
    {error && <p className="form-error">{error}</p>}
    {open && <form className="panel stack" onSubmit={async (event) => { event.preventDefault(); try { await addLiveMember(membership, name); setName(''); setOpen(false); await onRefresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Couldn’t add member'); } }}>
      <label>Mate’s name<input required minLength={2} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Priya" /></label><button className="primary">Add member</button>
    </form>}
    <div className="member-list">{vibe.members.map((member) => { const balance = balances.find((item) => item.memberId === member.id)!; return <article className="member-row" key={member.id}>
      <span className="member-avatar" style={{ background: member.color }}>{member.initials}</span>
      <div><strong>{member.name} {member.isAdmin && <small className="admin"><Crown />Admin</small>}</strong><p>{member.claimed ? 'Joined VibeMate' : 'Added by Admin'}</p></div>
      <span><small>Paid {formatMoney(balance.paidCents)}</small><strong className={balance.balanceCents >= 0 ? 'positive' : 'negative'}>{balance.balanceCents >= 0 ? 'Gets back' : 'Owes'} {formatMoney(Math.abs(balance.balanceCents))}</strong>{admin && !member.isAdmin && <button className="text-btn danger" onClick={() => remove(member.id, member.name)}><Trash2 />Remove</button>}</span>
    </article>; })}</div>
    {admin && <section className="danger-zone"><h2>Admin controls</h2><p>If every expense includes everyone, repair all fair shares after changing the member list.</p><button className="secondary full" onClick={recalculate}><RefreshCw />Recalculate all expenses equally</button><p>Archive a duplicate or finished vibe without erasing its history.</p><button className="secondary full danger" onClick={archive}><Archive />Archive this vibe</button></section>}
  </main><BottomNav inside onAdd={() => go(`/vibe/${vibe.id}`)} /></>;
}

export function LiveActivity({ vibe }: { vibe: Vibe }) {
  return <><Head /><main className="page subpage"><p className="eyebrow">{vibe.emoji} {vibe.name}</p><h1>Activity</h1>{vibe.activity.length ? <div className="timeline">{vibe.activity.map((activity) => <article key={activity.id}><span><RefreshCw /></span><div><p><strong>{activity.actor}</strong> {activity.action}</p><small>{activity.detail}</small><time>{activity.timestamp}</time></div></article>)}</div> : <div className="empty"><h2>No activity yet</h2></div>}</main><BottomNav inside onAdd={() => go(`/vibe/${vibe.id}`)} /></>;
}
