-- Correct duplicate merging: remove the duplicate from each affected split and
-- redistribute the full expense deterministically across the remaining selected members.
create or replace function public.merge_member_into_admin(p_vibe uuid,p_actor uuid,p_token text,p_source uuid)
returns void language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare a members;s members;r record;ids uuid[];n integer;base bigint;remainder bigint;
begin
  a:=vm_authorize(p_vibe,p_actor,p_token,true);
  select * into s from members where id=p_source and vibe_id=p_vibe and not is_admin;
  if not found or p_source=p_actor then raise exception 'invalid_merge'; end if;
  if exists(select 1 from settlements where vibe_id=p_vibe and (from_member_id=p_source or to_member_id=p_source)) then raise exception 'merge_has_settlements'; end if;
  for r in select distinct e.id,e.amount_cents from expenses e join expense_splits x on x.expense_id=e.id where e.vibe_id=p_vibe and x.member_id=p_source loop
    select array_agg(q.member_id order by q.member_id) into ids from (select distinct case when member_id=p_source then p_actor else member_id end member_id from expense_splits where expense_id=r.id) q;
    n:=array_length(ids,1);base:=r.amount_cents/n;remainder:=r.amount_cents%n;
    delete from expense_splits where expense_id=r.id;
    insert into expense_splits(expense_id,member_id,share_cents) select r.id,u.member_id,base+case when u.ordinality<=remainder then 1 else 0 end from unnest(ids) with ordinality u(member_id,ordinality);
  end loop;
  update expenses set paid_by_member_id=p_actor where vibe_id=p_vibe and paid_by_member_id=p_source;
  update expenses set created_by_member_id=p_actor where vibe_id=p_vibe and created_by_member_id=p_source;
  update expenses set deleted_by_member_id=p_actor where vibe_id=p_vibe and deleted_by_member_id=p_source;
  update expense_versions set changed_by_member_id=p_actor where vibe_id=p_vibe and changed_by_member_id=p_source;
  update invites set created_by_member_id=p_actor where vibe_id=p_vibe and created_by_member_id=p_source;
  update members set created_by_member_id=p_actor where vibe_id=p_vibe and created_by_member_id=p_source;
  update activity set actor_member_id=null where vibe_id=p_vibe and actor_member_id=p_source;
  insert into activity(vibe_id,actor_member_id,actor_name_snapshot,action_type,entity_type,entity_id,old_data,new_data) values(p_vibe,p_actor,a.display_name,'member_merged','member',p_source,jsonb_build_object('name',s.display_name),jsonb_build_object('merged_into',a.display_name));
  delete from members where id=p_source;
end$$;

-- Admin-only repair for a vibe whose expenses are all intended to be split equally
-- across every current member. Used to repair data produced by the earlier merge.
create or replace function public.recalculate_all_expenses_equally(p_vibe uuid,p_actor uuid,p_token text)
returns void language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare a members;e record;ids uuid[];n integer;base bigint;remainder bigint;
begin
  a:=vm_authorize(p_vibe,p_actor,p_token,true);
  select array_agg(id order by id) into ids from members where vibe_id=p_vibe;
  n:=array_length(ids,1);if n is null or n<1 then raise exception 'no_members';end if;
  for e in select id,amount_cents from expenses where vibe_id=p_vibe and deleted_at is null loop
    base:=e.amount_cents/n;remainder:=e.amount_cents%n;delete from expense_splits where expense_id=e.id;
    insert into expense_splits(expense_id,member_id,share_cents) select e.id,u.member_id,base+case when u.ordinality<=remainder then 1 else 0 end from unnest(ids) with ordinality u(member_id,ordinality);
  end loop;
  insert into activity(vibe_id,actor_member_id,actor_name_snapshot,action_type,entity_type,entity_id,new_data) values(p_vibe,p_actor,a.display_name,'splits_recalculated','vibe',p_vibe,jsonb_build_object('mode','everyone_equal','member_count',n));
end$$;
grant execute on function public.recalculate_all_expenses_equally(uuid,uuid,text) to anon;
