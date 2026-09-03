-- Merge an accidental duplicate participant into the current Admin atomically.
create or replace function public.merge_member_into_admin(p_vibe uuid,p_actor uuid,p_token text,p_source uuid)
returns void language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare a members;s members;r record;
begin
  a:=vm_authorize(p_vibe,p_actor,p_token,true);
  select * into s from members where id=p_source and vibe_id=p_vibe and not is_admin;
  if not found or p_source=p_actor then raise exception 'invalid_merge'; end if;
  if exists(select 1 from settlements where vibe_id=p_vibe and (from_member_id=p_source or to_member_id=p_source)) then raise exception 'merge_has_settlements'; end if;
  for r in select expense_id,share_cents from expense_splits where member_id=p_source loop
    if exists(select 1 from expense_splits where expense_id=r.expense_id and member_id=p_actor) then
      update expense_splits set share_cents=share_cents+r.share_cents where expense_id=r.expense_id and member_id=p_actor;
      delete from expense_splits where expense_id=r.expense_id and member_id=p_source;
    else update expense_splits set member_id=p_actor where expense_id=r.expense_id and member_id=p_source; end if;
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
grant execute on function public.merge_member_into_admin(uuid,uuid,text,uuid) to anon;
