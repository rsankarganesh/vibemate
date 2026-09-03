-- Admin-only expense editing/deletion with complete before-and-after audit snapshots.
create or replace function public.update_expense_with_splits(p_vibe uuid,p_actor uuid,p_token text,p_expense uuid,p_description text,p_amount bigint,p_payer uuid,p_category text,p_date date,p_note text,p_splits jsonb)
returns void language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare a members;e expenses;split_total bigint;version_no integer;old_snapshot jsonb;new_snapshot jsonb;
begin
  a:=vm_authorize(p_vibe,p_actor,p_token,true);
  select * into e from expenses where id=p_expense and vibe_id=p_vibe and deleted_at is null;
  if not found then raise exception 'expense_unavailable';end if;
  if p_amount<=0 or length(trim(p_description))<1 then raise exception 'invalid_expense';end if;
  if not exists(select 1 from members where id=p_payer and vibe_id=p_vibe) then raise exception 'invalid_payer';end if;
  select sum((x->>'share_cents')::bigint) into split_total from jsonb_array_elements(p_splits)x;
  if split_total<>p_amount or exists(select 1 from jsonb_array_elements(p_splits)x where not exists(select 1 from members where id=(x->>'member_id')::uuid and vibe_id=p_vibe)) then raise exception 'invalid_splits';end if;
  old_snapshot:=to_jsonb(e)||jsonb_build_object('splits',(select coalesce(jsonb_agg(to_jsonb(s) order by s.member_id),'[]'::jsonb) from expense_splits s where s.expense_id=e.id));
  select coalesce(max(version_number),0)+1 into version_no from expense_versions where expense_id=e.id;
  insert into expense_versions(expense_id,vibe_id,version_number,snapshot,changed_by_member_id) values(e.id,p_vibe,version_no,old_snapshot,p_actor);
  update expenses set description=trim(p_description),amount_cents=p_amount,paid_by_member_id=p_payer,category=p_category,expense_date=p_date,note=nullif(trim(p_note),''),updated_at=now() where id=e.id returning * into e;
  delete from expense_splits where expense_id=e.id;
  insert into expense_splits(expense_id,member_id,share_cents) select e.id,(x->>'member_id')::uuid,(x->>'share_cents')::bigint from jsonb_array_elements(p_splits)x;
  new_snapshot:=to_jsonb(e)||jsonb_build_object('splits',(select coalesce(jsonb_agg(to_jsonb(s) order by s.member_id),'[]'::jsonb) from expense_splits s where s.expense_id=e.id));
  insert into activity(vibe_id,actor_member_id,actor_name_snapshot,action_type,entity_type,entity_id,old_data,new_data) values(p_vibe,p_actor,a.display_name,'expense_edited','expense',e.id,old_snapshot,new_snapshot);
end$$;

create or replace function public.delete_expense(p_vibe uuid,p_actor uuid,p_token text,p_expense uuid)
returns void language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare a members;e expenses;version_no integer;old_snapshot jsonb;
begin
  a:=vm_authorize(p_vibe,p_actor,p_token,true);
  select * into e from expenses where id=p_expense and vibe_id=p_vibe and deleted_at is null;
  if not found then raise exception 'expense_unavailable';end if;
  old_snapshot:=to_jsonb(e)||jsonb_build_object('splits',(select coalesce(jsonb_agg(to_jsonb(s) order by s.member_id),'[]'::jsonb) from expense_splits s where s.expense_id=e.id));
  select coalesce(max(version_number),0)+1 into version_no from expense_versions where expense_id=e.id;
  insert into expense_versions(expense_id,vibe_id,version_number,snapshot,changed_by_member_id) values(e.id,p_vibe,version_no,old_snapshot,p_actor);
  update expenses set deleted_at=now(),deleted_by_member_id=p_actor,updated_at=now() where id=e.id;
  insert into activity(vibe_id,actor_member_id,actor_name_snapshot,action_type,entity_type,entity_id,old_data) values(p_vibe,p_actor,a.display_name,'expense_deleted','expense',e.id,old_snapshot);
end$$;

grant execute on function public.update_expense_with_splits(uuid,uuid,text,uuid,text,bigint,uuid,text,date,text,jsonb) to anon;
