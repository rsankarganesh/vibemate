import {describe, expect, it} from 'vitest';
import {calculateBalances, coordinatorSettlements, directSettlements, suggestSettlements, type Transfer} from '../src/lib/finance';
import type {Expense, Settlement} from '../src/types';
const ids = ['a', 'b', 'c', 'd'];
const expense = (paidBy: string, amountCents: number, splitMemberIds = ids): Expense => ({id: crypto.randomUUID(), description: 'Dinner', paidBy, amountCents, splitMemberIds, category: 'Other', date: '2026-09-17', createdBy: 'a'});
const payments = (plan: Transfer[]): Settlement[] => plan.map((item, index) => ({...item, id: String(index), settledAt: '2026-09-17'}));
const expenses = [expense('a', 12003), expense('b', 4600, ['b', 'c']), expense('d', 3759)];
describe('settlement choices', () => {
  it('preserves exact balances with all three methods, including a debtor coordinator', () => {
    const balances = calculateBalances(ids, expenses);
    for (const plan of [suggestSettlements(balances), directSettlements(ids, expenses), ...ids.map(id => coordinatorSettlements(balances, id))]) {
      expect(plan.every(item => Number.isSafeInteger(item.amountCents) && item.amountCents > 0 && item.fromMemberId !== item.toMemberId)).toBe(true);
      expect(calculateBalances(ids, expenses, payments(plan)).every(item => item.balanceCents === 0)).toBe(true);
    }
  });
  it('recalculates correctly after partial payments and switching methods', () => {
    const first = payments(suggestSettlements(calculateBalances(ids, expenses)).slice(0, 1));
    for (const plan of [directSettlements(ids, expenses, first), coordinatorSettlements(calculateBalances(ids, expenses, first), 'c')]) {
      expect(calculateBalances(ids, expenses, [...first, ...payments(plan)]).every(item => item.balanceCents === 0)).toBe(true);
    }
  });
  it('does not ask for circular payments when the group is already settled', () => {
    const cycle = [expense('a', 100, ['b']), expense('b', 100, ['c']), expense('c', 100, ['a'])];
    expect(directSettlements(ids, cycle)).toEqual([]);
    const settled = payments(suggestSettlements(calculateBalances(ids, expenses)));
    expect(directSettlements(ids, expenses, settled)).toEqual([]);
  });
  it('ignores deleted expenses and rejects an invalid coordinator', () => {
    expect(directSettlements(ids, [{...expenses[0], deletedAt: 'now'}])).toEqual([]);
    expect(() => coordinatorSettlements(calculateBalances(ids, expenses), 'missing')).toThrow();
  });
  it('reconciles a range of group sizes, remainders, and selected splits', () => {
    for (let size = 2; size <= 10; size++) {
      const members = Array.from({length: size}, (_, i) => String(i));
      const bills = Array.from({length: 14}, (_, i) => expense(members[i % size], 101 + i * 137, members.filter((_, n) => (n + i) % 3 !== 0)));
      const balances = calculateBalances(members, bills);
      const recorded = payments(suggestSettlements(balances).slice(0, 2));
      const plan = directSettlements(members, bills, recorded);
      expect(calculateBalances(members, bills, [...recorded, ...payments(plan)]).every(item => item.balanceCents === 0)).toBe(true);
    }
  });
});
it('uses recorded shares rather than reassigning cents when a viewer has an alias', () => {
  const bill = {...expense('b', 101, ['alex', 'b']), splits: [{memberId: 'alex', shareCents: 50}, {memberId: 'b', shareCents: 51}]};
  expect(calculateBalances(['alex', 'b'], [bill]).find(item => item.memberId === 'alex')?.shareCents).toBe(50);
  expect(directSettlements(['alex', 'b'], [bill])).toEqual([{fromMemberId: 'alex', toMemberId: 'b', amountCents: 50}]);
});
