create or replace function public.apply_workspace_credit_purchase(
  p_webhook_event_id text,
  p_event_type text,
  p_purchase_id uuid,
  p_order_id text,
  p_product_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_purchase public.workspace_credit_purchases%rowtype;
begin
  if nullif(trim(p_webhook_event_id), '') is null
    or nullif(trim(p_order_id), '') is null
    or nullif(trim(p_product_id), '') is null
  then
    raise exception 'Invalid workspace credit purchase webhook.';
  end if;

  select *
    into v_purchase
    from public.workspace_credit_purchases
    where id = p_purchase_id
      and product_id = p_product_id
    for update;

  if not found then
    return false;
  end if;

  insert into public.polar_webhook_events (event_id, event_type)
    values (p_webhook_event_id, p_event_type)
    on conflict (event_id) do nothing;

  if not found then
    return false;
  end if;

  if v_purchase.status = 'paid' then
    return false;
  end if;

  update public.workspace_credit_purchases
    set status = 'paid',
        polar_order_id = p_order_id,
        paid_at = now(),
        updated_at = now()
    where id = v_purchase.id;

  insert into public.workspace_credit_balances (workspace_id, balance)
    values (v_purchase.workspace_id, v_purchase.credits)
    on conflict (workspace_id) do update
      set balance = public.workspace_credit_balances.balance + excluded.balance,
          updated_at = now();

  insert into public.workspace_credit_ledger (
    workspace_id, user_id, purchase_id, polar_order_id, amount, reason
  )
  values (
    v_purchase.workspace_id,
    v_purchase.purchaser_id,
    v_purchase.id,
    p_order_id,
    v_purchase.credits,
    'purchase'
  );

  return true;
end;
$$;

revoke all on function public.apply_workspace_credit_purchase(
  text, text, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.apply_workspace_credit_purchase(
  text, text, uuid, text, text
) to service_role;
