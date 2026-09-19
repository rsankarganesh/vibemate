-- Let admins pre-register a mate by mobile number. The verified phone account
-- claims the matching membership automatically without exposing the number.
begin;

alter table public.members add column invited_phone_hash text;
alter table public.members add column invited_phone_last4 text;
create unique index members_vibe_invited_phone_unique
  on public.members(vibe_id,invited_phone_hash) where invited_phone_hash is not null;

create function public.add_member_with_phone(p_vibe uuid,p_actor uuid,p_token text,p_name text,p_phone text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a members;m members;n integer;clean_phone text:=trim(p_phone);
begin
  a:=vm_authorize(p_vibe,p_actor,p_token,true);
  if trim(p_name)='' then raise exception 'name_required'; end if;
  if clean_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'invalid_phone'; end if;
  select count(*) into n from members where vibe_id=p_vibe;
  if n>=(select max_members from vibes where id=p_vibe) then raise exception 'vibe_full'; end if;
  insert into members(vibe_id,display_name,created_by_member_id,invited_phone_hash,invited_phone_last4)
    values(p_vibe,trim(p_name),p_actor,vm_hash(clean_phone),right(clean_phone,4)) returning * into m;
  insert into activity(vibe_id,actor_member_id,actor_name_snapshot,action_type,entity_type,entity_id,new_data)
    values(p_vibe,p_actor,a.display_name,'member_added','member',m.id,jsonb_build_object('name',m.display_name,'mobile_invite',true));
  return m.id;
end$$;
revoke all on function public.add_member_with_phone(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.add_member_with_phone(uuid,uuid,text,text,text) to authenticated;

create function public.claim_phone_memberships() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=vm_phone_user(); verified_phone text; claimed_count integer;
begin
  select phone into verified_phone from auth.users where id=u;
  with claimed as (
    update members m set user_id=u,claimed_at=coalesce(m.claimed_at,now())
    where m.user_id is null and m.invited_phone_hash=vm_hash(verified_phone)
      and not exists(select 1 from members owned where owned.vibe_id=m.vibe_id and owned.user_id=u)
    returning m.id
  ) select count(*) into claimed_count from claimed;
  return claimed_count;
end$$;
revoke all on function public.claim_phone_memberships() from public,anon;
grant execute on function public.claim_phone_memberships() to authenticated;

-- A named slot with a mobile number can only be claimed by that verified phone.
create or replace function public.claim_member(p_raw_token text,p_member uuid,p_new_token text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare m members;u uuid:=vm_phone_user();verified_phone text;
begin
  if length(p_new_token)<32 then raise exception 'weak_token';end if;
  select phone into verified_phone from auth.users where id=u;
  update members set claimed_at=now(),member_token_hash=vm_hash(p_new_token),user_id=u
    where id=p_member and claimed_at is null
      and (invited_phone_hash is null or invited_phone_hash=vm_hash(verified_phone))
      and vibe_id=(select vibe_id from invites where token_hash=vm_hash(p_raw_token) and revoked_at is null and (expires_at is null or expires_at>now()))
    returning * into m;
  if not found then raise exception 'claim_unavailable';end if;
  insert into activity(vibe_id,actor_member_id,actor_name_snapshot,action_type,entity_type,entity_id,new_data)
    values(m.vibe_id,m.id,m.display_name,'member_claimed','member',m.id,jsonb_build_object('name',m.display_name));
  return jsonb_build_object('vibe_id',m.vibe_id,'member_id',m.id);
end$$;
revoke all on function public.claim_member(text,uuid,text) from public,anon;
grant execute on function public.claim_member(text,uuid,text) to authenticated;

commit;
