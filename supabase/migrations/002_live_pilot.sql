-- Live pilot read/join/settlement functions. Apply after 001_initial_schema.sql.
create or replace function public.join_vibe(p_raw_token text,p_display_name text,p_member_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v vibes;m members;n integer;
begin
  if length(trim(p_display_name)) not between 1 and 60 or length(p_member_token)<32 then raise exception 'invalid_join'; end if;
  select vb.* into v from invites i join vibes vb on vb.id=i.vibe_id where i.token_hash=vm_hash(p_raw_token) and i.revoked_at is null and (i.expires_at is null or i.expires_at>now()) and not vb.is_archived;
  if not found then raise exception 'invite_unavailable'; end if;
  select count(*) into n from members where vibe_id=v.id;
  if n>=v.max_members then raise exception 'vibe_full'; end if;
  insert into members(vibe_id,display_name,member_token_hash,claimed_at) values(v.id,trim(p_display_name),vm_hash(p_member_token),now()) returning * into m;
  insert into activity(vibe_id,actor_member_id,actor_name_snapshot,action_type,entity_type,entity_id,new_data) values(v.id,m.id,m.display_name,'member_joined','member',m.id,jsonb_build_object('name',m.display_name));
  return jsonb_build_object('vibe_id',v.id,'member_id',m.id);
end$$;

create or replace function public.get_vibe_snapshot(p_vibe uuid,p_member uuid,p_member_token text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a members;result jsonb;
begin
  a:=vm_authorize(p_vibe,p_member,p_member_token,false);
  select jsonb_build_object(
    'vibe',jsonb_build_object('id',v.id,'name',v.name,'emoji',v.emoji,'type',v.vibe_type,'description',v.description,'starts_at',v.starts_at,'ends_at',v.ends_at,'location',v.location_label,'currency',v.currency,'max_members',v.max_members,'is_archived',v.is_archived),
    'current_member_id',a.id,
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.display_name,'color',coalesce(m.avatar_color,'#5B2EFF'),'is_admin',m.is_admin,'claimed',m.claimed_at is not null) order by m.created_at) from members m where m.vibe_id=v.id),'[]'::jsonb),
    'expenses',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'description',e.description,'amount_cents',e.amount_cents,'paid_by',e.paid_by_member_id,'category',e.category,'date',e.expense_date,'note',e.note,'created_by',e.created_by_member_id,'deleted_at',e.deleted_at,'split_member_ids',coalesce((select jsonb_agg(s.member_id order by s.member_id) from expense_splits s where s.expense_id=e.id),'[]'::jsonb)) order by e.expense_date,e.created_at) from expenses e where e.vibe_id=v.id),'[]'::jsonb),
    'settlements',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'from_member_id',s.from_member_id,'to_member_id',s.to_member_id,'amount_cents',s.amount_cents,'settled_at',s.settled_at) order by s.created_at) from settlements s where s.vibe_id=v.id),'[]'::jsonb),
    'activity',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'actor',x.actor_name_snapshot,'action',replace(x.action_type,'_',' '),'detail',coalesce(x.new_data->>'description',x.new_data->>'name',''),'timestamp',to_char(x.created_at,'DD Mon, HH12:MI AM'),'icon',x.entity_type) order by x.created_at desc) from activity x where x.vibe_id=v.id),'[]'::jsonb)
  ) into result from vibes v where v.id=p_vibe;
  return result;
end$$;

create or replace function public.record_settlement(p_vibe uuid,p_actor uuid,p_token text,p_from uuid,p_to uuid,p_amount bigint)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a members;s settlements;
begin
  a:=vm_authorize(p_vibe,p_actor,p_token,false);
  if p_amount<=0 or p_from=p_to or not exists(select 1 from members where id=p_from and vibe_id=p_vibe) or not exists(select 1 from members where id=p_to and vibe_id=p_vibe) then raise exception 'invalid_settlement'; end if;
  insert into settlements(vibe_id,from_member_id,to_member_id,amount_cents,created_by_member_id) values(p_vibe,p_from,p_to,p_amount,p_actor) returning * into s;
  insert into activity(vibe_id,actor_member_id,actor_name_snapshot,action_type,entity_type,entity_id,new_data) values(p_vibe,p_actor,a.display_name,'settlement_recorded','settlement',s.id,to_jsonb(s));
  return s.id;
end$$;

grant execute on function public.join_vibe(text,text,text),public.get_vibe_snapshot(uuid,uuid,text),public.record_settlement(uuid,uuid,text,uuid,uuid,bigint) to anon;
