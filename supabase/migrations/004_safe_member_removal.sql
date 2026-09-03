-- Safe admin member removal. Referenced financial participants are never deleted.
create or replace function public.remove_member(p_vibe uuid,p_actor uuid,p_token text,p_member uuid)
returns void language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare a members; target members;
begin
  a:=vm_authorize(p_vibe,p_actor,p_token,true);
  select * into target from members where id=p_member and vibe_id=p_vibe;
  if not found then raise exception 'member_not_found'; end if;
  if target.is_admin or target.id=p_actor then raise exception 'cannot_remove_admin'; end if;
  if exists(select 1 from expenses where vibe_id=p_vibe and (paid_by_member_id=p_member or created_by_member_id=p_member or deleted_by_member_id=p_member))
     or exists(select 1 from expense_splits s join expenses e on e.id=s.expense_id where e.vibe_id=p_vibe and s.member_id=p_member)
     or exists(select 1 from settlements where vibe_id=p_vibe and (from_member_id=p_member or to_member_id=p_member or created_by_member_id=p_member)) then
    raise exception 'member_has_financial_history';
  end if;
  insert into activity(vibe_id,actor_member_id,actor_name_snapshot,action_type,entity_type,entity_id,old_data) values(p_vibe,p_actor,a.display_name,'member_removed','member',p_member,jsonb_build_object('name',target.display_name));
  delete from members where id=p_member;
end$$;
grant execute on function public.remove_member(uuid,uuid,text,uuid) to anon;
