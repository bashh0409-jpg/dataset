create or replace function public.claim_workspace_credit_checkout(
  p_workspace_id uuid,
  p_purchaser_id uuid,
  p_product_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_purchase public.workspace_credit_purchases%rowtype;
begin
  if p_workspace_id is null
    or p_purchaser_id is null
    or nullif(trim(p_product_id), '') is null
    or not exists (
      select 1
      from public.workspace_members
      where workspace_id = p_workspace_id
        and user_id = p_purchaser_id
        and role = 'owner'
    )
  then
    raise exception 'Workspace owner is required to purchase credits.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_workspace_id::text || ':workspace-credit-checkout',
      0
    )
  );

  select *
    into v_purchase
    from public.workspace_credit_purchases
    where workspace_id = p_workspace_id
      and status in ('creating', 'open')
    order by created_at desc
    limit 1
    for update;

  if found and v_purchase.status = 'open' then
    if v_purchase.expires_at > now() then
      return jsonb_build_object(
        'status', 'existing',
        'purchase_id', v_purchase.id,
        'checkout_url', v_purchase.checkout_url
      );
    end if;
    update public.workspace_credit_purchases
      set status = 'expired', updated_at = now()
      where id = v_purchase.id;
  elsif found then
    return jsonb_build_object(
      'status',
      case
        when v_purchase.updated_at < now() - interval '30 seconds'
          then 'stale'
        else 'in_progress'
      end,
      'purchase_id', v_purchase.id
    );
  end if;

  insert into public.workspace_credit_purchases (
    workspace_id, purchaser_id, product_id
  )
  values (p_workspace_id, p_purchaser_id, p_product_id)
  returning * into v_purchase;

  return jsonb_build_object('status', 'claimed', 'purchase_id', v_purchase.id);
end;
$$;

create or replace function public.reclaim_workspace_credit_checkout(
  p_purchase_id uuid,
  p_purchaser_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_rows integer;
begin
  update public.workspace_credit_purchases
    set updated_at = now()
    where id = p_purchase_id
      and purchaser_id = p_purchaser_id
      and status = 'creating'
      and updated_at < now() - interval '30 seconds';

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.claim_workspace_credit_checkout(
  uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.reclaim_workspace_credit_checkout(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_workspace_credit_checkout(
  uuid, uuid, text
) to service_role;
grant execute on function public.reclaim_workspace_credit_checkout(uuid, uuid)
  to service_role;
