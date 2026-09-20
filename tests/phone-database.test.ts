// @vitest-environment node
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {readFile, readdir} from 'node:fs/promises';
import {afterAll, beforeAll, expect, it} from 'vitest';
const db = new PGlite({extensions: {pgcrypto}});
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const unverified = '33333333-3333-4333-8333-333333333333';
const secret = 'a'.repeat(64), invite = 'b'.repeat(64);
let legacy: {vibe_id: string; member_id: string};
const identity = async (id: string, role = 'authenticated') => {await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec(`set role ${role}`);};
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema extensions;
    create extension pgcrypto with schema extensions;
    create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;`);
  await db.query('insert into auth.users values ($1,$2,now()),($3,$4,now()),($5,$6,null)', [alice, '+61412345678', bob, '+61412345679', unverified, '+61412345670']);
  const paths = (await readdir('supabase/migrations')).filter(file => file.endsWith('.sql')).sort();
  for (const path of paths.filter(file => !/^0(08|09|10|11|12|13)_/.test(file))) await db.exec(await readFile(`supabase/migrations/${path}`, 'utf8'));
  const result = await db.query<{value: {vibe_id: string; member_id: string}}>("select create_vibe('Legacy trip','🌴','Trip',null,'Brisbane','AUD',10,'Alice',$1,$2) as value", [secret, invite]);
  legacy = result.rows[0].value;
  await db.exec(await readFile('supabase/migrations/008_phone_accounts.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/009_optional_multi_currency.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/010_phone_member_invites.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/011_update_member_mobile.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/012_delete_and_leave_vibe.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/013_phone_identity_deduplication.sql', 'utf8'));
}, 30000);
afterAll(async () => {await db.close();});
it('rejects anonymous RPC access after the phone migration', async () => {
  await identity('', 'anon');
  await expect(db.query('select get_vibe_snapshot($1,$2,$3)', [legacy.vibe_id, legacy.member_id, secret])).rejects.toThrow(/permission denied/);
  await expect(db.query('select join_vibe($1,$2,$3)', [invite, 'Stranger', 'c'.repeat(64)])).rejects.toThrow(/permission denied/);
});
it('rejects unverified phone identities', async () => {
  await identity(unverified);
  await expect(db.query('select list_phone_memberships()')).rejects.toThrow(/phone_verification_required/);
  await expect(db.query("select create_vibe('New trip','🌴','Trip',null,'Brisbane','AUD',10,'Unverified',$1,$2)", ['d'.repeat(64), 'e'.repeat(64)])).rejects.toThrow(/phone_verification_required/);
});
it('migrates legacy access only with the correct bearer token and recovers it without the token', async () => {
  await identity(alice);
  await expect(db.query('select link_phone_membership($1,$2)', [legacy.member_id, 'z'.repeat(64)])).rejects.toThrow(/not_authorized/);
  await db.query('select link_phone_membership($1,$2)', [legacy.member_id, secret]);
  const result = await db.query<{value: {member_id: string}[]}>('select list_phone_memberships() as value');
  expect(result.rows[0].value).toEqual([{vibe_id: legacy.vibe_id, member_id: legacy.member_id}]);
  const snapshot = await db.query<{value: {current_member_id: string}}>('select get_vibe_snapshot($1,$2,$3) as value', [legacy.vibe_id, legacy.member_id, '']);
  expect(snapshot.rows[0].value.current_member_id).toBe(legacy.member_id);
});
it('prevents a different verified user taking over or reading that membership', async () => {
  await identity(bob);
  await expect(db.query('select link_phone_membership($1,$2)', [legacy.member_id, secret])).rejects.toThrow(/not_authorized/);
  await expect(db.query('select get_vibe_snapshot($1,$2,$3)', [legacy.vibe_id, legacy.member_id, secret])).rejects.toThrow(/not_authorized/);
  const result = await db.query<{value: unknown[]}>('select list_phone_memberships() as value');
  expect(result.rows[0].value).toEqual([]);
});
it('attaches newly joined members to their phone account and reuses the same identity', async () => {
  await identity(bob);
  const result = await db.query<{value: {member_id: string}}>('select join_vibe($1,$2,$3) as value', [invite, 'Bob', 'f'.repeat(64)]);
  const memberships = await db.query<{value: {member_id: string}[]}>('select list_phone_memberships() as value');
  expect(memberships.rows[0].value[0].member_id).toBe(result.rows[0].value.member_id);
  const repeated = await db.query<{value: {member_id: string}}>('select join_vibe($1,$2,$3) as value', [invite, 'Bob again', 'g'.repeat(64)]);
  expect(repeated.rows[0].value.member_id).toBe(result.rows[0].value.member_id);
});
it('binds new creators and claimed manual members, and keeps other members out of admin actions', async () => {
  await identity(alice);
  const created = await db.query<{value: {vibe_id: string; member_id: string}}>("select create_vibe('Phone trip','🌴','Trip',null,'Brisbane','AUD',10,'Alice',$1,$2) as value", ['h'.repeat(64), 'i'.repeat(64)]);
  const group = created.rows[0].value;
  await db.query('select add_manual_member($1,$2,$3,$4)', [group.vibe_id, group.member_id, '', 'Bob']);
  const preview = await db.query<{value: {unclaimed_members: {id: string}[]}}>('select get_vibe_by_invite($1) as value', ['i'.repeat(64)]);
  const manual = preview.rows[0].value.unclaimed_members[0].id;
  await identity(bob);
  await db.query('select claim_member($1,$2,$3)', ['i'.repeat(64), manual, 'j'.repeat(64)]);
  await expect(db.query('select archive_vibe($1,$2,$3)', [group.vibe_id, manual, ''])).rejects.toThrow(/not_authorized/);
  const shares = [{member_id: group.member_id, share_cents: 1}, {member_id: manual, share_cents: 2}];
  await db.query("select save_expense_with_splits($1,$2,'','Tiny bill',3,$2,'Other','2026-09-17',null,$3::jsonb)", [group.vibe_id, manual, JSON.stringify(shares)]);
  const snapshot = await db.query<{value: {expenses: {splits: {member_id: string; share_cents: number}[]}[]}}>('select get_vibe_snapshot($1,$2,$3) as value', [group.vibe_id, manual, '']);
  expect(snapshot.rows[0].value.expenses[0].splits).toEqual(expect.arrayContaining(shares));
});
it('automatically claims an admin-added membership for the matching verified mobile', async () => {
  await identity(alice);
  const created = await db.query<{value: {vibe_id: string; member_id: string}}>("select create_vibe('Phone invites','🌴','Trip',null,'Brisbane','AUD',10,'Alice',$1,$2) as value", ['k'.repeat(64), 'l'.repeat(64)]);
  await db.query('select add_member_with_phone($1,$2,$3,$4,$5)', [created.rows[0].value.vibe_id, created.rows[0].value.member_id, '', 'Bob', '+61412345679']);
  await identity(bob);
  expect((await db.query<{value: number}>('select claim_phone_memberships() as value')).rows[0].value).toBe(1);
  const memberships = await db.query<{value: {vibe_id: string}[]}>('select list_phone_memberships() as value');
  expect(memberships.rows[0].value).toEqual(expect.arrayContaining([{vibe_id: created.rows[0].value.vibe_id, member_id: expect.any(String)}]));
});

it('merges a legacy duplicate into the admin-named member for the same phone', async () => {
  await identity(alice);
  const created = await db.query<{value: {vibe_id: string; member_id: string}}>("select create_vibe('Duplicate repair','🌴','Trip',null,'Brisbane','AUD',10,'Alice',$1,$2) as value", ['m'.repeat(64), 'n'.repeat(64)]);
  const vibe = created.rows[0].value;
  const reserved = await db.query<{value: string}>('select add_member_with_phone($1,$2,$3,$4,$5) as value', [vibe.vibe_id, vibe.member_id, '', 'Robert', '+61412345679']);
  await identity(bob);
  await db.exec('reset role');
  const duplicate = await db.query<{id: string}>("insert into members(vibe_id,display_name,user_id,claimed_at) values($1,'Bob',$2,now()) returning id", [vibe.vibe_id, bob]);
  await db.query("insert into expenses(vibe_id,description,amount_cents,paid_by_member_id,category,expense_date,created_by_member_id) values($1,'Lunch',101,$2,'Food','2026-09-20',$2)", [vibe.vibe_id, duplicate.rows[0].id]);
  const expense = await db.query<{id: string}>("select id from expenses where vibe_id=$1 and description='Lunch'", [vibe.vibe_id]);
  await db.query('insert into expense_splits(expense_id,member_id,share_cents) values($1,$2,51),($1,$3,50)', [expense.rows[0].id, duplicate.rows[0].id, reserved.rows[0].value]);
  await identity(bob);
  expect((await db.query<{value: number}>('select claim_phone_memberships() as value')).rows[0].value).toBe(1);
  await db.exec('reset role');
  const members = await db.query<{id: string;display_name: string;user_id: string}>('select id,display_name,user_id from members where vibe_id=$1 and user_id=$2', [vibe.vibe_id, bob]);
  expect(members.rows).toEqual([{id: reserved.rows[0].value, display_name: 'Robert', user_id: bob}]);
  const splits = await db.query<{member_id: string;share_cents: number}>('select member_id,share_cents from expense_splits where expense_id=$1', [expense.rows[0].id]);
  expect(splits.rows).toEqual([{member_id: reserved.rows[0].value, share_cents: 101}]);
});

it('keeps AUD as the ledger currency and validates stored foreign conversions', async () => {
  await identity(alice);
  await db.query('select set_vibe_currency_options($1,$2,$3,true)', [legacy.vibe_id, legacy.member_id, '']);
  const shares = [{member_id: legacy.member_id, share_cents: 1538}];
  await expect(db.query("select save_expense_with_fx($1,$2,'','Wrong rate',1537,$2,'Other','2026-09-17',null,$3::jsonb,'USD',1025,1.5,'2026-09-17','ECB via Frankfurter')", [legacy.vibe_id, legacy.member_id, JSON.stringify(shares)])).rejects.toThrow(/conversion_does_not_reconcile/);
  const saved = await db.query<{value: string}>("select save_expense_with_fx($1,$2,'','USD hotel',1538,$2,'Other','2026-09-17',null,$3::jsonb,'USD',1025,1.5,'2026-09-17','ECB via Frankfurter') as value", [legacy.vibe_id, legacy.member_id, JSON.stringify(shares)]);
  expect(saved.rows[0].value).toBeTruthy();
  const snapshot = await db.query<{value: {vibe: {multi_currency_enabled: boolean}; expenses: {description: string; amount_cents: number; original_currency?: string; original_amount_minor?: number; exchange_rate?: number}[]}}>('select get_vibe_snapshot($1,$2,$3) as value', [legacy.vibe_id, legacy.member_id, '']);
  expect(snapshot.rows[0].value.vibe.multi_currency_enabled).toBe(true);
  expect(snapshot.rows[0].value.expenses.find(item => item.description === 'USD hotel')).toMatchObject({amount_cents: 1538, original_currency: 'USD', original_amount_minor: 1025, exchange_rate: 1.5});
});
