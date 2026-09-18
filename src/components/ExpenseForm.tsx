import {useEffect, useMemo, useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {splitEqually} from '../lib/finance';
import {convertMinorUnits, currencyDecimals, formatCurrencyMinor, parseCurrencyAmount, supportedCurrencies} from '../lib/currency';
import {formatMoney, parseMoney} from '../lib/money';
import {getAudExchangeRate, type ExchangeRate} from '../services/exchange-rate';
import type {Expense, Member} from '../types';

const categories = ['Food & Drinks', 'Accommodation', 'Transport', 'Activities', 'Entertainment', 'Shopping', 'Tickets', 'Fuel', 'Groceries', 'Other'];

export function ExpenseForm({members, onSave, initial, multiCurrencyEnabled = false}: {members: Member[]; onSave: (expense: Expense) => void | Promise<void>; initial?: Expense; multiCurrencyEnabled?: boolean}) {
  const initialCurrency = initial?.originalCurrency ?? 'AUD';
  const [description, setDescription] = useState(initial?.description ?? '');
  const [currency, setCurrency] = useState(initialCurrency);
  const [amount, setAmount] = useState(initial?.originalAmountMinor !== undefined ? (initial.originalAmountMinor / 10 ** currencyDecimals(initialCurrency)).toFixed(currencyDecimals(initialCurrency)) : initial ? (initial.amountCents / 100).toFixed(2) : '');
  const [payer, setPayer] = useState(initial?.paidBy ?? members[0]?.id ?? '');
  const [category, setCategory] = useState(initial?.category ?? categories[0]);
  const [selected, setSelected] = useState(initial?.splitMemberIds ?? members.map(member => member.id));
  const [date, setDate] = useState(initial?.date ?? new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10));
  const [note, setNote] = useState(initial?.note ?? '');
  const [rate, setRate] = useState<ExchangeRate | null>(initial?.exchangeRate && initial.exchangeRateDate && initial.exchangeRateProvider ? {base: initialCurrency, quote: 'AUD', rate: initial.exchangeRate, date: initial.exchangeRateDate, provider: 'ECB via Frankfurter'} : null);
  const [rateBusy, setRateBusy] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {if (currency === 'AUD') setRate(null); else if (currency !== initialCurrency || date !== initial?.date) setRate(null);}, [currency, date, initialCurrency, initial?.date]);
  const originalMinor = useMemo(() => {try {return parseCurrencyAmount(amount, currency);} catch {return 0;}}, [amount, currency]);
  const convertedCents = currency === 'AUD' ? (() => {try {return parseMoney(amount);} catch {return 0;}})() : rate && originalMinor ? convertMinorUnits(originalMinor, currency, rate.rate) : 0;
  let shares: ReturnType<typeof splitEqually> = [];
  try {if (convertedCents) shares = splitEqually(convertedCents, selected);} catch { /* The preview appears when all inputs are valid. */ }
  const fetchRate = async () => {
    setError(''); setRateBusy(true);
    try {setRate(await getAudExchangeRate(currency, date));}
    catch (caught) {setError(caught instanceof Error ? caught.message : 'Couldn’t load an exchange rate.');}
    finally {setRateBusy(false);}
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return; setError('');
    try {
      if (description.trim().length < 2) throw new Error('Add a short description');
      if (!date) throw new Error('Choose an expense date');
      if (!members.some(member => member.id === payer)) throw new Error('Choose who paid');
      if (!selected.length) throw new Error('Choose at least one person');
      const parsedOriginal = parseCurrencyAmount(amount, currency);
      if (currency !== 'AUD' && !rate) throw new Error('Get the AUD reference rate before saving this expense.');
      const audCents = currency === 'AUD' ? parseMoney(amount) : convertMinorUnits(parsedOriginal, currency, rate!.rate);
      setBusy(true);
      await onSave({id: initial?.id ?? crypto.randomUUID(), description: description.trim(), amountCents: audCents, paidBy: payer, splitMemberIds: selected, category, date, note: note.trim() || undefined, createdBy: initial?.createdBy ?? 'alex', ...(currency === 'AUD' ? {} : {originalCurrency: currency, originalAmountMinor: parsedOriginal, exchangeRate: rate!.rate, exchangeRateDate: rate!.date, exchangeRateProvider: rate!.provider})});
    } catch (caught) {setError(caught instanceof Error ? caught.message : 'Check the form');}
    finally {setBusy(false);}
  };
  const currencySymbol = new Intl.NumberFormat('en-AU', {style: 'currency', currency, currencyDisplay: 'narrowSymbol'}).formatToParts(0).find(part => part.type === 'currency')?.value;
  return <form className="stack" onSubmit={submit}>
    <label>Description<input autoFocus required minLength={2} maxLength={120} value={description} onChange={event => setDescription(event.target.value)} placeholder="e.g. Beach dinner"/></label>
    {multiCurrencyEnabled && <label>Paid in<select value={currency} onChange={event => {setCurrency(event.target.value); setAmount('');}}>{supportedCurrencies.map(item => <option key={item}>{item}{item === 'AUD' ? ' — group currency' : ''}</option>)}</select></label>}
    <label>Amount ({currency})<div className="money-input"><span>{currencySymbol}</span><input aria-label={`Amount (${currency})`} required inputMode={currencyDecimals(currency) ? 'decimal' : 'numeric'} value={amount} onChange={event => setAmount(event.target.value)} placeholder={currencyDecimals(currency) ? '0.00' : '0'}/></div></label>
    {currency !== 'AUD' && <section className="fx-box"><div><strong>AUD reference rate</strong><p>{rate && originalMinor ? `${formatCurrencyMinor(originalMinor, currency)} = ${formatMoney(convertedCents)}` : 'Load the rate for this expense date.'}</p>{rate && <small>1 {currency} = {rate.rate.toFixed(6)} AUD · {rate.provider} · {rate.date}</small>}</div><button type="button" className="secondary small" disabled={rateBusy || !date || !originalMinor} onClick={() => void fetchRate()}><RefreshCw/>{rateBusy ? 'Loading…' : rate ? 'Refresh rate' : 'Get rate'}</button></section>}
    <div className="two-col"><label>Paid by<select value={payer} onChange={event => setPayer(event.target.value)}>{members.map(member => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label><label>Category<select value={category} onChange={event => setCategory(event.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}</select></label></div>
    <label>Date<input required type="date" value={date} onChange={event => setDate(event.target.value)}/></label>
    <label>Note (optional)<input value={note} onChange={event => setNote(event.target.value)} placeholder="Add a note"/></label>
    <fieldset><legend>Split between</legend><button type="button" className="text-btn" onClick={() => setSelected(selected.length === members.length ? [] : members.map(member => member.id))}>{selected.length === members.length ? 'Clear all' : 'Select everyone'}</button><div className="member-checks">{members.map(member => <label key={member.id}><input type="checkbox" checked={selected.includes(member.id)} onChange={() => setSelected(current => current.includes(member.id) ? current.filter(id => id !== member.id) : [...current, member.id])}/><span style={{background: member.color}}>{member.initials}</span>{member.name}</label>)}</div></fieldset>
    {shares.length > 0 && <section className="split-preview" aria-label="Split preview"><p><strong>Each person’s share in AUD</strong></p><ul>{shares.map(share => <li key={share.memberId}><span>{members.find(member => member.id === share.memberId)?.name}</span><strong>{formatMoney(share.shareCents)}</strong></li>)}</ul></section>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button disabled={busy || rateBusy} className="primary full">{busy ? 'Saving…' : initial ? 'Save changes' : 'Save expense'}</button>
  </form>;
}
