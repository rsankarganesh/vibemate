-- Treat one verified mobile number as one person inside each vibe.
-- This also repairs the old edge case where a member joined manually after an
-- admin had already reserved a named place for the same mobile number.
begin;

-- Trusted security-definer functions may bind an explicit verified user. The
-- trigger still resolves the current phone identity for ordinary joins.
create or replace function public.vm_bind_phone_member() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then
    if new.claimed_at is not null and new.user_id is null then new.user_id:=vm_phone_user();end if;
  elsif old.claimed_at is null and new.claimed_at is not null and new.user_id is null then
    new.user_id:=vm_phone_user();
  end if;
  return new;
end$$;
revoke all on function public.vm_bind_phone_member() from public,anon,authenticated;

create or replace function public.vm_merge_phone_member(p_target uuid,p_duplicate uuid,p_user uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare target_member members;duplicate_member members;r record;ids uuid[];n integer;base bigint;remainder bigint;
begin
  select * into target_member from members where id=p_target for update;
  select * into duplicate_member from members where id=p_duplicate for update;
  if target_member.id is null or duplicate_member.id is null or target_member.vibe_id<>duplicate_member.vibe_id or duplicate_member.user_id<>p_user then
    raise exception 'invalid_phone_merge';
  end if;

  -- Collapse duplicate split participants and preserve every expense total.
  for r in
    select distinct e.id,e.amount_cents
    from expenses e join expense_splits s on s.expense_id=e.id
    where e.vibe_id=target_member.vibe_id and s.member_id=p_duplicate
  loop
    select array_agg(q.member_id order by q.member_id) into ids
    from (
      select distinct case when member_id=p_duplicate then p_target else member_id end as member_id
      from expense_splits where expense_id=r.id
    ) q;
    n:=array_length(ids,1);base:=r.amount_cents/n;remainder:=r.amount_cents%n;
    delete from expense_splits where expense_id=r.id;
    insert into expense_splits(expense_id,member_id,share_cents)
      select r.id,u.member_id,base+case when u.ordinality<=remainder then 1 else 0 end
      from unnest(ids) with ordinality u(member_id,ordinality);
  end loop;

  -- A payment between the two aliases becomes an internal self-payment.
  delete from settlements where vibe_id=target_member.vibe_id
    and ((from_member_id=p_target and to_member_id=p_duplicate)
      or (from_member_id=p_duplicate and to_member_id=p_target));
  update settlements set from_member_id=p_target where vibe_id=target_member.vibe_id and from_member_id=p_duplicate;
  update settlements set to_member_id=p_target where vibe_id=target_member.vibe_id and to_member_id=p_duplicate;
  update settlements set created_by_member_id=p_target where vibe_id=target_member.vibe_id and created_by_member_id=p_duplicate;
  update expenses set paid_by_member_id=p_target where vibe_id=target_member.vibe_id and paid_by_member_id=p_duplicate;
  update expenses set created_by_member_id=p_target where vibe_id=target_member.vibe_id and created_by_member_id=p_duplicate;
  update expenses set deleted_by_member_id=p_target where vibe_id=target_member.vibe_id and deleted_by_member_id=p_duplicate;
  update expense_versions set changed_by_member_id=p_target where vibe_id=target_member.vibe_id and changed_by_member_id=p_duplicate;
  update invites set created_by_member_id=p_target where vibe_id=target_member.vibe_id and created_by_member_id=p_duplicate;
  update members set created_by_member_id=p_target where vibe_id=target_member.vibe_id and created_by_member_id=p_duplicate;
  update activity set actor_member_id=p_target where vibe_id=target_member.vibe_id and actor_member_id=p_duplicate;
  update vibes set admin_member_id=p_target where id=target_member.vibe_id and admin_member_id=p_duplicate;

  -- Release the per-vibe identity before binding the reserved member row.
  update members set user_id=null,member_token_hash=null where id=p_duplicate;
  update members set user_id=p_user,claimed_at=coalesce(claimed_at,now()),
    member_token_hash=coalesce(member_token_hash,duplicate_member.member_token_hash)
    where id=p_target;
  delete from members where id=p_duplicate;
  insert into activity(vibe_id,actor_member_id,actor_name_snapshot,action_type,entity_type,entity_id,old_data,new_data)
    values(target_member.vibe_id,p_target,target_member.display_name,'phone_duplicates_merged','member',p_duplicate,
      jsonb_build_object('name',duplicate_member.display_name),jsonb_build_object('merged_into',target_member.display_name));
end$$;
revoke all on function public.vm_merge_phone_member(uuid,uuid,uuid) from public,anon,authenticated;

-- Repair duplicates that already exist before this migration is installed.
do $$declare pair record;
begin
  for pair in
    select reserved.id as target_id,owned.id as duplicate_id,u.id as user_id
    from auth.users u
    join members reserved on reserved.user_id is null and reserved.invited_phone_hash=vm_hash(u.phone)
    join members owned on owned.vibe_id=reserved.vibe_id and owned.user_id=u.id
    where u.phone is not null and u.phone_confirmed_at is not null
  loop
    perform vm_merge_phone_member(pair.target_id,pair.duplicate_id,pair.user_id);
  end loop;
end$$;

create or replace function public.claim_phone_memberships() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=vm_phone_user();verified_phone text;candidate record;owned members;claimed_count integer:=0;
begin
  select phone into verified_phone from auth.users where id=u;
  for candidate in
    select * from members m
    where m.user_id is null and m.invited_phone_hash=vm_hash(verified_phone)
    order by m.created_at
    for update
  loop
    select * into owned from members where vibe_id=candidate.vibe_id and user_id=u for update;
    if found then
      perform vm_merge_phone_member(candidate.id,owned.id,u);
    else
      update members set user_id=u,claimed_at=coalesce(claimed_at,now()) where id=candidate.id;
    end if;
    claimed_count:=claimed_count+1;
  end loop;
  return claimed_count;
end$$;
revoke all on function public.claim_phone_memberships() from public,anon;
grant execute on function public.claim_phone_memberships() to authenticated;

-- Opening an invite first claims any matching mobile reservation. If this
-- phone already belongs to the vibe, return that membership instead of
-- inserting another row.
create or replace function public.join_vibe(p_raw_token text,p_display_name text,p_member_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v vibes;m members;n integer;u uuid:=vm_phone_user();
begin
  if length(p_member_token)<32 then raise exception 'weak_token';end if;
  select v0.* into v from invites i join vibes v0 on v0.id=i.vibe_id
    where i.token_hash=vm_hash(p_raw_token) and i.revoked_at is null
      and (i.expires_at is null or i.expires_at>now()) and not v0.is_archived;
  if not found then raise exception 'invite_unavailable';end if;
  perform claim_phone_memberships();
  select * into m from members where vibe_id=v.id and user_id=u;
  if found then return jsonb_build_object('vibe_id',v.id,'member_id',m.id);end if;
  if trim(p_display_name)='' then raise exception 'name_required';end if;
  select count(*) into n from members where vibe_id=v.id;
  if n>=v.max_members then raise exception 'vibe_full';end if;
  insert into members(vibe_id,display_name,member_token_hash,claimed_at)
    values(v.id,trim(p_display_name),vm_hash(p_member_token),now()) returning * into m;
  insert into activity(vibe_id,actor_member_id,actor_name_snapshot,action_type,entity_type,entity_id,new_data)
    values(v.id,m.id,m.display_name,'member_joined','member',m.id,jsonb_build_object('name',m.display_name));
  return jsonb_build_object('vibe_id',v.id,'member_id',m.id);
end$$;
revoke all on function public.join_vibe(text,text,text) from public,anon;
grant execute on function public.join_vibe(text,text,text) to authenticated;

-- Named mobile reservations are private and are claimed by phone, not by
-- selecting someone else's name from an invite page.
create or replace function public.get_vibe_by_invite(p_raw_token text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
select jsonb_build_object(
  'id',v.id,'name',v.name,'emoji',v.emoji,'starts_at',v.starts_at,'location',v.location_label,'max_members',v.max_members,
  'unclaimed_members',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.display_name))
    from members m where m.vibe_id=v.id and m.claimed_at is null and m.invited_phone_hash is null),'[]'::jsonb)
)
from invites i join vibes v on v.id=i.vibe_id
where i.token_hash=vm_hash(p_raw_token) and i.revoked_at is null
  and (i.expires_at is null or i.expires_at>now()) and not v.is_archived
$$;
revoke all on function public.get_vibe_by_invite(text) from public,anon;
grant execute on function public.get_vibe_by_invite(text) to authenticated;

commit;
