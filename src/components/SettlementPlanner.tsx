import {useState} from 'react';
import {ArrowRight, Check, Users} from 'lucide-react';
import {calculateBalances, coordinatorSettlements, directSettlements, suggestSettlements, type Transfer} from '../lib/finance';
import {formatMoney} from '../lib/money';
import type {Vibe} from '../types';

type Mode = 'smart' | 'direct' | 'coordinator';
export function SettlementPlanner({vibe, onRecord}: {vibe: Vibe; onRecord: (transfer: Transfer) => void}) {
  const [mode, setMode] = useState<Mode>('smart');
  const balances = calculateBalances(vibe.members.map(member => member.id), vibe.expenses, vibe.settlements);
  const [chosenCoordinator, setCoordinator] = useState(() => [...balances].sort((a, b) => b.balanceCents - a.balanceCents)[0]?.memberId ?? '');
  const coordinator = vibe.members.some(member => member.id === chosenCoordinator) ? chosenCoordinator : vibe.members[0]?.id ?? '';
  const name = (id: string) => vibe.members.find(member => member.id === id)?.name ?? 'Mate';
  const expenses = vibe.expenses.filter(expense => !expense.deletedAt);
  const total = expenses.reduce((sum, expense) => sum + expense.amountCents, 0);
  const smart = suggestSettlements(balances);
  const direct = directSettlements(vibe.members.map(member => member.id), vibe.expenses, vibe.settlements);
  const plan = mode === 'smart' ? smart : mode === 'direct' ? direct : coordinatorSettlements(balances, coordinator);
  const settled = balances.every(balance => balance.balanceCents === 0);
  const steps = mode === 'coordinator' ? [
    {title: `1. Pay ${name(coordinator)}`, items: plan.filter(item => item.toMemberId === coordinator)},
    {title: `2. ${name(coordinator)} pays mates back`, items: plan.filter(item => item.fromMemberId === coordinator)},
  ] : [{title: mode === 'smart' ? 'Your consolidated plan' : 'Direct reimbursements', items: plan}];
  return <section className="settlement-planner">
    <div className="section-heading"><div><p className="eyebrow">SIMPLE & FAIR</p><h2>Settle up</h2></div><span className="pill">Exact cents</span></div>
    <p className="lede">Choose how your group settles. Everyone’s fair share stays the same.</p>
    <div className="settlement-summary"><div><small>Total expense</small><strong>{formatMoney(total)}</strong><span>for {vibe.members.length} mates</span></div><div><small>Average share</small><strong>{formatMoney(Math.round(total / Math.max(1, vibe.members.length)))}</strong><span>Actual shares depend on each expense’s split</span></div><div><small>Still to settle</small><strong>{formatMoney(balances.reduce((sum, item) => sum + Math.max(0, item.balanceCents), 0))}</strong><span>{settled ? 'Everyone is all square' : 'After recorded payments'}</span></div></div>
    <div className="balance-table-wrap"><table className="balance-table"><caption>Everyone’s share and remaining balance</caption><thead><tr><th scope="col">Person</th><th scope="col">Paid for expenses</th><th scope="col">Fair share</th><th scope="col">Balance</th></tr></thead><tbody>{balances.map(balance => <tr key={balance.memberId}><th scope="row">{name(balance.memberId)}</th><td>{formatMoney(expenses.filter(expense => expense.paidBy === balance.memberId).reduce((sum, expense) => sum + expense.amountCents, 0))}</td><td>{formatMoney(balance.shareCents)}</td><td className={balance.balanceCents < 0 ? 'negative' : 'positive'}>{balance.balanceCents === 0 ? 'Settled' : `${balance.balanceCents > 0 ? '+' : '−'} ${formatMoney(Math.abs(balance.balanceCents))}`}</td></tr>)}</tbody></table></div>
    <p className="helper balance-key">+ gets back · − pays. Balances include recorded payments. No shares are rounded away.</p>
    <div className="settlement-modes" role="group" aria-label="Settlement method">{([
      ['smart', 'Smart consolidate', 'Combine balances into a simple payment plan.'],
      ['direct', 'Direct split', 'Repay original payers; cancel mutual and circular debts.'],
      ['coordinator', 'One coordinator', 'Collect and redistribute through one mate.'],
    ] as const).map(([id, title, detail]) => <button key={id} aria-pressed={mode === id} className={mode === id ? 'selected' : ''} onClick={() => setMode(id)}><strong>{title}</strong><span>{detail}</span></button>)}</div>
    {mode === 'coordinator' && <div className="coordinator-picker"><label><Users/> Choose your coordinator<select value={coordinator} onChange={event => setCoordinator(event.target.value)}>{vibe.members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><p className="helper">Agree with your coordinator first. Collect payments before redistributing them.</p></div>}
    {settled ? <div className="empty"><Check/><h2>Everyone is settled!</h2><p>Nobody owes anyone anything.</p></div> : <>
      <p className="plan-count"><strong>{plan.length} {plan.length === 1 ? 'transfer' : 'transfers'}</strong>{mode === 'smart' && direct.length > smart.length ? ` · ${direct.length - smart.length} fewer than direct split` : ''}</p>
      <div className={mode === 'coordinator' ? 'coordinator-steps' : ''}>{steps.map(step => <section className="settlement-step" key={step.title}><h3>{step.title}</h3>{step.items.length ? <><div className="settlement-list">{step.items.map(item => <article className="settlement" key={`${item.fromMemberId}-${item.toMemberId}`}><div><strong>{name(item.fromMemberId)} <ArrowRight aria-label="pays"/> {name(item.toMemberId)}</strong><h2>{formatMoney(item.amountCents)}</h2></div><button className="secondary" onClick={() => onRecord(item)}>Record payment</button></article>)}</div><p className="step-total">Total <strong>{formatMoney(step.items.reduce((sum, item) => sum + item.amountCents, 0))}</strong></p></> : <p className="helper">No payments needed in this step.</p>}</section>)}</div>
    </>}
    <p className="helper">Pay outside Vibemates, then record it here. Vibemates doesn’t transfer money. Switching methods never changes what you owe.</p>
    {vibe.settlements.length > 0 && <section className="panel payment-history"><h2>Recorded payments</h2>{[...vibe.settlements].reverse().map(item => <p key={item.id}>{name(item.fromMemberId)} → {name(item.toMemberId)} <strong>{formatMoney(item.amountCents)}</strong><small> · {new Date(item.settledAt).toLocaleDateString('en-AU')}</small></p>)}</section>}
  </section>;
}
