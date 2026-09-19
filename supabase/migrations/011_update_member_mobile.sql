-- Allow an admin to attach or correct the private mobile invitation for an
-- existing unclaimed member without deleting their expenses or balance.
begin;
create function public.set_member_invite_phone(p_vibe uuid,p_actor uuid,p_token text,p_member uuid,p_phone text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare a members;clean_phone text:=trim(p_phone);
begin
  a:=vm_authorize(p_vibe,p_actor,p_token,true);
  if clean_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'invalid_phone'; end if;
  update members set invited_phone_hash=vm_hash(clean_phone),invited_phone_last4=right(clean_phone,4)
    where id=p_member and vibe_id=p_vibe and user_id is null;
  if not found then raise exception 'member_already_joined_or_unavailable'; end if;
  insert into activity(vibe_id,actor_member_id,actor_name_snapshot,action_type,entity_type,entity_id,new_data)
    values(p_vibe,p_actor,a.display_name,'member_mobile_updated','member',p_member,jsonb_build_object('mobile_invite',true));
end$$;
revoke all on function public.set_member_invite_phone(uuid,uuid,text,uuid,text) from public,anon;
grant execute on function public.set_member_invite_phone(uuid,uuid,text,uuid,text) to authenticated;
commit;
