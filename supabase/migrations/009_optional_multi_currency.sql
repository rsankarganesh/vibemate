-- Optional foreign-currency expense entry. AUD remains the ledger and settlement currency.
begin;

alter table public.vibes add column multi_currency_enabled boolean not null default false;
alter table public.expenses
  add column original_currency char(3),
  add column original_amount_minor bigint,
  add column exchange_rate numeric(20,10),
  add column exchange_rate_date date,
  add column exchange_rate_provider text,
  add constraint expenses_fx_complete check (
    (original_currency is null and original_amount_minor is null and exchange_rate is null and exchange_rate_date is null and exchange_rate_provider is null)
    or
    (original_currency is not null and original_currency <> 'AUD' and original_amount_minor > 0 and exchange_rate > 0 and exchange_rate_date is not null and char_length(exchange_rate_provider) between 2 and 80)
  );

create function public.set_vibe_currency_options(p_vibe uuid,p_actor uuid,p_token text,p_enabled boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform vm_authorize(p_vibe,p_actor,p_token,true);
  update vibes set multi_currency_enabled=p_enabled,updated_at=now() where id=p_vibe;
end$$;
revoke all on function public.set_vibe_currency_options(uuid,uuid,text,boolean) from public,anon;
grant execute on function public.set_vibe_currency_options(uuid,uuid,text,boolean) to authenticated;

create function public.save_expense_with_fx(
  p_vibe uuid,p_actor uuid,p_token text,p_description text,p_amount bigint,p_payer uuid,p_category text,p_date date,p_note text,p_splits jsonb,
  p_original_currency char(3),p_original_amount bigint,p_exchange_rate numeric,p_rate_date date,p_rate_provider text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare e uuid; decimals integer; expected bigint;
begin
  perform vm_authorize(p_vibe,p_actor,p_token,false);
  if p_original_currency is not null then
    if not (select multi_currency_enabled from vibes where id=p_vibe) then raise exception 'multi_currency_disabled'; end if;
    if p_original_currency='AUD' or p_original_amount<=0 or p_exchange_rate<=0 or p_rate_date is null or p_rate_provider<>'ECB via Frankfurter' then raise exception 'invalid_exchange_rate'; end if;
    decimals:=case when p_original_currency in ('JPY','KRW') then 0 else 2 end;
    expected:=round(p_original_amount*p_exchange_rate*100/power(10,decimals))::bigint;
    if expected<>p_amount then raise exception 'conversion_does_not_reconcile'; end if;
  elsif p_original_amount is not null or p_exchange_rate is not null or p_rate_date is not null or p_rate_provider is not null then
    raise exception 'incomplete_exchange_rate';
  end if;
  e:=save_expense_with_splits(p_vibe,p_actor,p_token,p_description,p_amount,p_payer,p_category,p_date,p_note,p_splits);
  update expenses set original_currency=p_original_currency,original_amount_minor=p_original_amount,exchange_rate=p_exchange_rate,exchange_rate_date=p_rate_date,exchange_rate_provider=p_rate_provider where id=e;
  return e;
end$$;
revoke all on function public.save_expense_with_fx(uuid,uuid,text,text,bigint,uuid,text,date,text,jsonb,char,bigint,numeric,date,text) from public,anon;
grant execute on function public.save_expense_with_fx(uuid,uuid,text,text,bigint,uuid,text,date,text,jsonb,char,bigint,numeric,date,text) to authenticated;

create function public.update_expense_with_fx(
  p_vibe uuid,p_actor uuid,p_token text,p_expense uuid,p_description text,p_amount bigint,p_payer uuid,p_category text,p_date date,p_note text,p_splits jsonb,
  p_original_currency char(3),p_original_amount bigint,p_exchange_rate numeric,p_rate_date date,p_rate_provider text
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare decimals integer; expected bigint;
begin
  perform vm_authorize(p_vibe,p_actor,p_token,true);
  if p_original_currency is not null then
    if not (select multi_currency_enabled from vibes where id=p_vibe) then raise exception 'multi_currency_disabled'; end if;
    if p_original_currency='AUD' or p_original_amount<=0 or p_exchange_rate<=0 or p_rate_date is null or p_rate_provider<>'ECB via Frankfurter' then raise exception 'invalid_exchange_rate'; end if;
    decimals:=case when p_original_currency in ('JPY','KRW') then 0 else 2 end;
    expected:=round(p_original_amount*p_exchange_rate*100/power(10,decimals))::bigint;
    if expected<>p_amount then raise exception 'conversion_does_not_reconcile'; end if;
  elsif p_original_amount is not null or p_exchange_rate is not null or p_rate_date is not null or p_rate_provider is not null then
    raise exception 'incomplete_exchange_rate';
  end if;
  perform update_expense_with_splits(p_vibe,p_actor,p_token,p_expense,p_description,p_amount,p_payer,p_category,p_date,p_note,p_splits);
  update expenses set original_currency=p_original_currency,original_amount_minor=p_original_amount,exchange_rate=p_exchange_rate,exchange_rate_date=p_rate_date,exchange_rate_provider=p_rate_provider where id=p_expense and vibe_id=p_vibe;
end$$;
revoke all on function public.update_expense_with_fx(uuid,uuid,text,uuid,text,bigint,uuid,text,date,text,jsonb,char,bigint,numeric,date,text) from public,anon;
grant execute on function public.update_expense_with_fx(uuid,uuid,text,uuid,text,bigint,uuid,text,date,text,jsonb,char,bigint,numeric,date,text) to authenticated;

-- Wrap the phone-secured snapshot so older migrations stay independently deployable.
alter function public.get_vibe_snapshot(uuid,uuid,text) rename to get_vibe_snapshot_before_currency;
create function public.get_vibe_snapshot(p_vibe uuid,p_member uuid,p_member_token text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb; enriched jsonb;
begin
  result:=get_vibe_snapshot_before_currency(p_vibe,p_member,p_member_token);
  result:=jsonb_set(result,'{vibe}',(result->'vibe') || jsonb_build_object('multi_currency_enabled',(select multi_currency_enabled from vibes where id=p_vibe)),false);
  select coalesce(jsonb_agg(item.value || jsonb_strip_nulls(jsonb_build_object(
    'original_currency',e.original_currency,'original_amount_minor',e.original_amount_minor,'exchange_rate',e.exchange_rate,
    'exchange_rate_date',e.exchange_rate_date,'exchange_rate_provider',e.exchange_rate_provider
  )) order by item.ordinality),'[]'::jsonb) into enriched
  from jsonb_array_elements(result->'expenses') with ordinality item(value,ordinality)
  join expenses e on e.id=(item.value->>'id')::uuid;
  return jsonb_set(result,'{expenses}',enriched,false);
end$$;
revoke all on function public.get_vibe_snapshot(uuid,uuid,text) from public,anon;
grant execute on function public.get_vibe_snapshot(uuid,uuid,text) to authenticated;

commit;
