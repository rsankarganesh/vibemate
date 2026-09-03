import { useState } from 'react';
import { parseMoney } from '../lib/money';
import type { Expense, Member } from '../types';

const categories = ['Food & Drinks', 'Accommodation', 'Transport', 'Activities', 'Entertainment', 'Shopping', 'Tickets', 'Fuel', 'Groceries', 'Other'];

export function ExpenseForm({ members, onSave, initial }: { members: Member[]; onSave: (expense: Expense) => void | Promise<void>; initial?: Expense }) {
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amount, setAmount] = useState(initial ? (initial.amountCents / 100).toFixed(2) : '');
  const [payer, setPayer] = useState(initial?.paidBy ?? members[0]?.id ?? '');
  const [category, setCategory] = useState(initial?.category ?? categories[0]);
  const [selected, setSelected] = useState(initial?.splitMemberIds ?? members.map((member) => member.id));
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (description.trim().length < 2) throw new Error('Add a short description');
      if (!selected.length) throw new Error('Choose at least one person');
      setBusy(true);
      await onSave({ id: initial?.id ?? crypto.randomUUID(), description: description.trim(), amountCents: parseMoney(amount), paidBy: payer, splitMemberIds: selected, category, date, note: note.trim() || undefined, createdBy: initial?.createdBy ?? 'alex' });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Check the form');
      setBusy(false);
    }
  };
  return <form className="stack" onSubmit={submit}>
    <label>Description<input autoFocus value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. Beach dinner" /></label>
    <label>Amount (AUD)<div className="money-input"><span>$</span><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></div></label>
    <div className="two-col"><label>Paid by<select value={payer} onChange={(event) => setPayer(event.target.value)}>{members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label></div>
    <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
    <label>Note (optional)<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note" /></label>
    <fieldset><legend>Split between</legend><button type="button" className="text-btn" onClick={() => setSelected(selected.length === members.length ? [] : members.map((member) => member.id))}>{selected.length === members.length ? 'Clear all' : 'Select everyone'}</button><div className="member-checks">{members.map((member) => <label key={member.id}><input type="checkbox" checked={selected.includes(member.id)} onChange={() => setSelected((current) => current.includes(member.id) ? current.filter((id) => id !== member.id) : [...current, member.id])} /><span style={{ background: member.color }}>{member.initials}</span>{member.name}</label>)}</div></fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button disabled={busy} className="primary full">{busy ? 'Saving…' : initial ? 'Save changes' : 'Save Expense'}</button>
  </form>;
}
