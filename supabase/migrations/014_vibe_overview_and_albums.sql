-- Rich vibe overview, RSVP and lightweight links to externally hosted albums.
-- Vibemates stores only the link and display metadata, never the photos.
begin;

alter table public.vibes add column cover_image_url text;
alter table public.vibes add column announcement text;

create table public.vibe_rsvps(
  vibe_id uuid not null references public.vibes(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  status text not null check(status in ('going','maybe','cant_go')),
  updated_at timestamptz not null default now(),
  primary key(vibe_id,member_id)
);

create table public.shared_albums(
  id uuid primary key default gen_random_uuid(),
  vibe_id uuid not null references public.vibes(id) on delete cascade,
  title text not null check(char_length(title) between 1 and 80),
  provider text not null check(provider in ('google_photos','apple_photos','onedrive','dropbox','youtube','google_drive','other')),
  album_url text not null check(album_url ~ '^https://'),
  cover_image_url text check(cover_image_url is null or cover_image_url ~ '^https://'),
  photo_count integer not null default 0 check(photo_count>=0),
  video_count integer not null default 0 check(video_count>=0),
  added_by_member_id uuid references public.members(id) on delete set null,
  added_by_name text not null,
  created_at timestamptz not null default now()
);
create index shared_albums_vibe_idx on public.shared_albums(vibe_id,created_at);
alter table public.vibe_rsvps enable row level security;
alter table public.shared_albums enable row level security;

create function public.set_vibe_rsvp(p_vibe uuid,p_actor uuid,p_token text,p_status text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare a members;
begin
  a:=vm_authorize(p_vibe,p_actor,p_token,false);
  if p_status not in ('going','maybe','cant_go') then raise exception 'invalid_rsvp';end if;
  insert into vibe_rsvps(vibe_id,member_id,status) values(p_vibe,p_actor,p_status)
    on conflict(vibe_id,member_id) do update set status=excluded.status,updated_at=now();
  insert into activity(vibe_id,actor_member_id,actor_name_snapshot,action_type,entity_type,entity_id,new_data)
    values(p_vibe,p_actor,a.display_name,'rsvp_updated','vibe',p_vibe,jsonb_build_object('status',p_status));
end$$;
revoke all on function public.set_vibe_rsvp(uuid,uuid,text,text) from public,anon;
grant execute on function public.set_vibe_rsvp(uuid,uuid,text,text) to authenticated;

create function public.update_vibe_overview(
  p_vibe uuid,p_actor uuid,p_token text,p_starts_at timestamptz,p_location text,p_type text,p_cover_url text,p_announcement text
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare a members;
begin
  a:=vm_authorize(p_vibe,p_actor,p_token,true);
  if trim(p_location)='' or trim(p_type)='' then raise exception 'overview_fields_required';end if;
  if nullif(trim(p_cover_url),'') is not null and trim(p_cover_url) !~ '^https://' then raise exception 'invalid_cover_url';end if;
  update vibes set starts_at=p_starts_at,location_label=trim(p_location),vibe_type=trim(p_type),
    cover_image_url=nullif(trim(p_cover_url),''),announcement=nullif(trim(p_announcement),''),updated_at=now()
    where id=p_vibe;
  insert into activity(vibe_id,actor_member_id,actor_name_snapshot,action_type,entity_type,entity_id,new_data)
    values(p_vibe,p_actor,a.display_name,'overview_updated','vibe',p_vibe,jsonb_build_object('location',trim(p_location)));
end$$;
revoke all on function public.update_vibe_overview(uuid,uuid,text,timestamptz,text,text,text,text) from public,anon;
grant execute on function public.update_vibe_overview(uuid,uuid,text,timestamptz,text,text,text,text) to authenticated;

create function public.add_shared_album(
  p_vibe uuid,p_actor uuid,p_token text,p_title text,p_provider text,p_url text,p_cover_url text,p_photos integer,p_videos integer
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a members;album_id uuid;
begin
  a:=vm_authorize(p_vibe,p_actor,p_token,false);
  if trim(p_title)='' then raise exception 'album_title_required';end if;
  if p_provider not in ('google_photos','apple_photos','onedrive','dropbox','youtube','google_drive','other') then raise exception 'invalid_album_provider';end if;
  if trim(p_url) !~ '^https://' then raise exception 'invalid_album_url';end if;
  if nullif(trim(p_cover_url),'') is not null and trim(p_cover_url) !~ '^https://' then raise exception 'invalid_cover_url';end if;
  if coalesce(p_photos,0)<0 or coalesce(p_videos,0)<0 then raise exception 'invalid_media_count';end if;
  insert into shared_albums(vibe_id,title,provider,album_url,cover_image_url,photo_count,video_count,added_by_member_id,added_by_name)
    values(p_vibe,trim(p_title),p_provider,trim(p_url),nullif(trim(p_cover_url),''),coalesce(p_photos,0),coalesce(p_videos,0),p_actor,a.display_name)
    returning id into album_id;
  insert into activity(vibe_id,actor_member_id,actor_name_snapshot,action_type,entity_type,entity_id,new_data)
    values(p_vibe,p_actor,a.display_name,'album_added','album',album_id,jsonb_build_object('name',trim(p_title),'provider',p_provider));
  return album_id;
end$$;
revoke all on function public.add_shared_album(uuid,uuid,text,text,text,text,text,integer,integer) from public,anon;
grant execute on function public.add_shared_album(uuid,uuid,text,text,text,text,text,integer,integer) to authenticated;

create function public.remove_shared_album(p_vibe uuid,p_actor uuid,p_token text,p_album uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare a members;album shared_albums;
begin
  a:=vm_authorize(p_vibe,p_actor,p_token,false);
  select * into album from shared_albums where id=p_album and vibe_id=p_vibe;
  if not found then raise exception 'album_unavailable';end if;
  if not a.is_admin and album.added_by_member_id<>p_actor then raise exception 'not_authorized';end if;
  delete from shared_albums where id=p_album;
  insert into activity(vibe_id,actor_member_id,actor_name_snapshot,action_type,entity_type,entity_id,old_data)
    values(p_vibe,p_actor,a.display_name,'album_removed','album',p_album,jsonb_build_object('name',album.title));
end$$;
revoke all on function public.remove_shared_album(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.remove_shared_album(uuid,uuid,text,uuid) to authenticated;

alter function public.get_vibe_snapshot(uuid,uuid,text) rename to get_vibe_snapshot_before_overview;
create function public.get_vibe_snapshot(p_vibe uuid,p_member uuid,p_member_token text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  result:=get_vibe_snapshot_before_overview(p_vibe,p_member,p_member_token);
  result:=jsonb_set(result,'{vibe}',(result->'vibe') || jsonb_strip_nulls(jsonb_build_object(
    'cover_image_url',(select cover_image_url from vibes where id=p_vibe),
    'announcement',(select announcement from vibes where id=p_vibe)
  )),false);
  result:=result || jsonb_build_object(
    'rsvps',coalesce((select jsonb_agg(jsonb_build_object('member_id',r.member_id,'status',r.status) order by r.updated_at)
      from vibe_rsvps r where r.vibe_id=p_vibe),'[]'::jsonb),
    'albums',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'title',a.title,'provider',a.provider,'url',a.album_url,'cover_image_url',a.cover_image_url,
      'photo_count',a.photo_count,'video_count',a.video_count,'added_by_member_id',a.added_by_member_id,
      'added_by_name',a.added_by_name,'created_at',a.created_at
    ) order by a.created_at desc) from shared_albums a where a.vibe_id=p_vibe),'[]'::jsonb)
  );
  return result;
end$$;
revoke all on function public.get_vibe_snapshot(uuid,uuid,text) from public,anon;
grant execute on function public.get_vibe_snapshot(uuid,uuid,text) to authenticated;

commit;
