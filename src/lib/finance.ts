import type {Expense,Settlement} from '../types';
export type Balance={memberId:string;paidCents:number;shareCents:number;balanceCents:number}; export type Transfer={fromMemberId:string;toMemberId:string;amountCents:number};
export function splitEqually(amountCents:number,memberIds:string[]){if(!Number.isSafeInteger(amountCents)||amountCents<=0)throw new Error('Amount must be a positive integer');if(!memberIds.length)throw new Error('Choose at least one member');const stable=[...memberIds].sort();const base=Math.floor(amountCents/stable.length),remainder=amountCents%stable.length;return stable.map((memberId,index)=>({memberId,shareCents:base+(index<remainder?1:0)}));}
export function calculateBalances(memberIds:string[],expenses:Expense[],settlements:Settlement[]=[]):Balance[]{const map=new Map(memberIds.map(id=>[id,{memberId:id,paidCents:0,shareCents:0,balanceCents:0}]));for(const expense of expenses.filter(e=>!e.deletedAt)){const payer=map.get(expense.paidBy);if(!payer)throw new Error('Unknown payer');payer.paidCents+=expense.amountCents;for(const split of expenseShares(expense)){const member=map.get(split.memberId);if(!member)throw new Error('Unknown split member');member.shareCents+=split.shareCents;}}for(const settlement of settlements){const from=map.get(settlement.fromMemberId),to=map.get(settlement.toMemberId);if(!from||!to)throw new Error('Unknown settlement member');from.paidCents+=settlement.amountCents;to.paidCents-=settlement.amountCents;}for(const value of map.values())value.balanceCents=value.paidCents-value.shareCents;const result=[...map.values()];if(result.reduce((sum,b)=>sum+b.balanceCents,0)!==0)throw new Error('Balances do not reconcile');return result;}
export function suggestSettlements(balances:Balance[]):Transfer[]{const debtors=balances.filter(b=>b.balanceCents<0).map(b=>({...b,remaining:-b.balanceCents})).sort((a,b)=>b.remaining-a.remaining||a.memberId.localeCompare(b.memberId));const creditors=balances.filter(b=>b.balanceCents>0).map(b=>({...b,remaining:b.balanceCents})).sort((a,b)=>b.remaining-a.remaining||a.memberId.localeCompare(b.memberId));const transfers:Transfer[]=[];let d=0,c=0;while(d<debtors.length&&c<creditors.length){const amount=Math.min(debtors[d].remaining,creditors[c].remaining);if(amount>0)transfers.push({fromMemberId:debtors[d].memberId,toMemberId:creditors[c].memberId,amountCents:amount});debtors[d].remaining-=amount;creditors[c].remaining-=amount;if(!debtors[d].remaining)d++;if(!creditors[c].remaining)c++;}return transfers;}

/** Keep reimbursements between the original people, cancelling mutual debts and cycles. */
export function directSettlements(memberIds: string[], expenses: Expense[], settlements: Settlement[] = []): Transfer[] {
  const index = new Map(memberIds.map((id, position) => [id, position]));
  const debts = memberIds.map(() => memberIds.map(() => 0));
  const add = (from: string, to: string, amount: number) => {
    const i = index.get(from), j = index.get(to);
    if (i === undefined || j === undefined) throw new Error('Unknown settlement member');
    if (i !== j) debts[i][j] += amount;
  };
  for (const expense of expenses.filter(item => !item.deletedAt)) {
    for (const share of expenseShares(expense)) add(share.memberId, expense.paidBy, share.shareCents);
  }
  for (const payment of settlements) add(payment.fromMemberId, payment.toMemberId, -payment.amountCents);
  for (let i = 0; i < memberIds.length; i++) for (let j = i + 1; j < memberIds.length; j++) {
    const net = debts[i][j] - debts[j][i];
    debts[i][j] = Math.max(0, net); debts[j][i] = Math.max(0, -net);
  }
  // Remove circular reimbursements, including cycles caused by switching settlement modes.
  const findCycle = (): number[] | undefined => {
    const visited = new Set<number>(), path: number[] = [], active = new Set<number>();
    const visit = (node: number): number[] | undefined => {
      if (active.has(node)) return [...path.slice(path.indexOf(node)), node];
      if (visited.has(node)) return;
      visited.add(node); active.add(node); path.push(node);
      for (let next = 0; next < memberIds.length; next++) if (debts[node][next] > 0) {
        const cycle = visit(next); if (cycle) return cycle;
      }
      path.pop(); active.delete(node);
    };
    for (let node = 0; node < memberIds.length; node++) {const cycle = visit(node); if (cycle) return cycle;}
  };
  let cycle = findCycle();
  while (cycle) {
    const amount = Math.min(...cycle.slice(0, -1).map((node, i) => debts[node][cycle![i + 1]]));
    cycle.slice(0, -1).forEach((node, i) => {debts[node][cycle![i + 1]] -= amount;});
    cycle = findCycle();
  }
  return debts.flatMap((row, from) => row.flatMap((amountCents, to) => amountCents > 0 ? [{fromMemberId: memberIds[from], toMemberId: memberIds[to], amountCents}] : []));
}

export function coordinatorSettlements(balances: Balance[], coordinatorId: string): Transfer[] {
  if (!balances.some(item => item.memberId === coordinatorId)) throw new Error('Choose a group member as coordinator');
  const others = balances.filter(item => item.memberId !== coordinatorId);
  return [
    ...others.filter(item => item.balanceCents < 0).map(item => ({fromMemberId: item.memberId, toMemberId: coordinatorId, amountCents: -item.balanceCents})),
    ...others.filter(item => item.balanceCents > 0).map(item => ({fromMemberId: coordinatorId, toMemberId: item.memberId, amountCents: item.balanceCents})),
  ];
}

/** Use the server’s recorded cents so different viewers assign remainders identically. */
export function expenseShares(expense: Expense): {memberId: string; shareCents: number}[] {
  if (!expense.splits) return splitEqually(expense.amountCents, expense.splitMemberIds);
  const shares = expense.splits;
  if (shares.length !== expense.splitMemberIds.length || new Set(shares.map(item => item.memberId)).size !== shares.length || shares.some(item => !expense.splitMemberIds.includes(item.memberId) || !Number.isSafeInteger(item.shareCents) || item.shareCents < 0) || shares.reduce((sum, item) => sum + item.shareCents, 0) !== expense.amountCents) throw new Error('Expense shares do not reconcile');
  return shares;
}
