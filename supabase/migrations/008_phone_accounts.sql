-- Vibemates: bind membership to Supabase Auth's verified phone identity.
-- Apply after 001–007, and enable Supabase Phone Auth with a configured SMS provider.
-- Keep old bearer hashes only to migrate existing access; they no longer authorize live RPCs.
begin;
alter table public.members add column user_id uuid references auth.users(id) on delete restrict;
create unique index members_user_vibe_unique on public.members(vibe_id,user_id) where user_id is not null;

create function public.vm_phone_user() returns uuid
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare u uuid := auth.uid();
begin
  if u is null or not exists(select 1 from auth.users where id=u and phone is not null and phone_confirmed_at is not null) then
    raise exception 'phone_verification_required';
  end if;
  return u;
end$$;
revoke all on function public.vm_phone_user() from public,anon,authenticated;

-- Existing create/join/claim RPCs attach the verified identity atomically.
create function public.vm_bind_phone_member() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then
    if new.claimed_at is not null then new.user_id := vm_phone_user(); end if;
  elsif old.claimed_at is null and new.claimed_at is not null then
    new.user_id := vm_phone_user();
  end if;
  return new;
end$$;
revoke all on function public.vm_bind_phone_member() from public,anon,authenticated;
create trigger bind_phone_member before insert or update of claimed_at on public.members
for each row execute function public.vm_bind_phone_member();

create or replace function public.vm_authorize(p_vibe uuid,p_member uuid,p_token text,p_admin boolean default false)
returns public.members language plpgsql stable security definer set search_path=public,pg_temp as $$
declare m public.members; u uuid := vm_phone_user();
begin
  select * into m from members where id=p_member and vibe_id=p_vibe and user_id=u;
  if not found or (p_admin and not m.is_admin) then raise exception 'not_authorized'; end if;
  return m;
end$$;
revoke all on function public.vm_authorize(uuid,uuid,text,boolean) from public,anon,authenticated;

create function public.link_phone_membership(p_member uuid,p_token text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.members; u uuid := vm_phone_user();
begin
  select * into m from members where id=p_member for update;
  if not found then raise exception 'membership_unavailable'; end if;
  if m.user_id=u then return; end if;
  if m.user_id is not null or p_token is null or length(p_token)<32 or m.member_token_hash is null or m.member_token_hash<>vm_hash(p_token) then
    raise exception 'not_authorized';
  end if;
  update members set user_id=u where id=p_member;
end$$;
revoke all on function public.link_phone_membership(uuid,text) from public,anon;
grant execute on function public.link_phone_membership(uuid,text) to authenticated;

create function public.list_phone_memberships() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare u uuid := vm_phone_user(); result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('vibe_id',vibe_id,'member_id',id) order by created_at),'[]'::jsonb)
    into result from members where user_id=u;
  return result;
end$$;
revoke all on function public.list_phone_memberships() from public,anon;
grant execute on function public.list_phone_memberships() to authenticated;

-- Older migrations relied on bearer tokens and sometimes inherited PUBLIC execute.
-- Close both paths, keeping access only to verified authenticated accounts.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(array[
      'create_vibe','get_vibe_by_invite','claim_member','join_vibe','get_vibe_snapshot',
      'save_expense_with_splits','record_settlement','add_manual_member','delete_expense',
      'archive_vibe','remove_member','merge_member_into_admin','recalculate_all_expenses_equally',
      'update_expense_with_splits'
    ])
  loop
    execute format('revoke all on function %s from public,anon',f.signature);
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
end$$;
-- Preserve the recorded shares when aliasing the signed-in member in the client.
create or replace function public.get_vibe_snapshot(p_vibe uuid,p_member uuid,p_member_token text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a members;result jsonb;
begin
  a:=vm_authorize(p_vibe,p_member,p_member_token,false);
  select jsonb_build_object(
    'vibe',jsonb_build_object('id',v.id,'name',v.name,'emoji',v.emoji,'type',v.vibe_type,'description',v.description,'starts_at',v.starts_at,'ends_at',v.ends_at,'location',v.location_label,'currency',v.currency,'max_members',v.max_members,'is_archived',v.is_archived),
    'current_member_id',a.id,
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.display_name,'color',coalesce(m.avatar_color,'#5B2EFF'),'is_admin',m.is_admin,'claimed',m.claimed_at is not null) order by m.created_at) from members m where m.vibe_id=v.id),'[]'::jsonb),
    'expenses',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'description',e.description,'amount_cents',e.amount_cents,'paid_by',e.paid_by_member_id,'category',e.category,'date',e.expense_date,'note',e.note,'created_by',e.created_by_member_id,'deleted_at',e.deleted_at,'splits',coalesce((select jsonb_agg(jsonb_build_object('member_id',s.member_id,'share_cents',s.share_cents) order by s.member_id) from expense_splits s where s.expense_id=e.id),'[]'::jsonb),'split_member_ids',coalesce((select jsonb_agg(s.member_id order by s.member_id) from expense_splits s where s.expense_id=e.id),'[]'::jsonb)) order by e.expense_date,e.created_at) from expenses e where e.vibe_id=v.id),'[]'::jsonb),
    'settlements',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'from_member_id',s.from_member_id,'to_member_id',s.to_member_id,'amount_cents',s.amount_cents,'settled_at',s.settled_at) order by s.created_at) from settlements s where s.vibe_id=v.id),'[]'::jsonb),
    'activity',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'actor',x.actor_name_snapshot,'action',replace(x.action_type,'_',' '),'detail',coalesce(x.new_data->>'description',x.new_data->>'name',''),'timestamp',to_char(x.created_at,'DD Mon, HH12:MI AM'),'icon',x.entity_type) order by x.created_at desc) from activity x where x.vibe_id=v.id),'[]'::jsonb)
  ) into result from vibes v where v.id=p_vibe;
  return result;
end$$;

commit;
