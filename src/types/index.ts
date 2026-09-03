export type Member={id:string;name:string;initials:string;color:string;isAdmin?:boolean;claimed?:boolean};
export type Expense={id:string;description:string;amountCents:number;paidBy:string;splitMemberIds:string[];category:string;date:string;note?:string;createdBy:string;deletedAt?:string};
export type Settlement={id:string;fromMemberId:string;toMemberId:string;amountCents:number;settledAt:string};
export type Activity={id:string;actor:string;action:string;detail:string;timestamp:string;icon:string};
export type Vibe={id:string;name:string;emoji:string;type:string;when:string;startsAt:string;location:string;description:string;currency:string;maxMembers:number;status:'active'|'settled'|'archived';members:Member[];expenses:Expense[];settlements:Settlement[];activity:Activity[]};
