const KEY='vibemate-memberships'; export type StoredMembership={vibeId:string;memberId:string;memberToken:string;inviteToken?:string};
export function getMemberships():StoredMembership[]{try{return JSON.parse(localStorage.getItem(KEY)||'{"memberships":[]}').memberships||[]}catch{return []}}
export function saveMembership(m:StoredMembership){const memberships=getMemberships().filter(x=>x.vibeId!==m.vibeId);localStorage.setItem(KEY,JSON.stringify({version:1,memberships:[...memberships,m]}));}
export function strongToken(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}
