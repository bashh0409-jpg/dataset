create table public.workspace_credit_balances (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table public.workspace_credit_purchases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  purchaser_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  credits integer not null default 500 check (credits = 500),
  status text not null default 'creating'
    check (status in ('creating', 'open', 'paid', 'expired')),
  polar_checkout_id text unique,
  checkout_url text,
  expires_at timestamptz,
  polar_order_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  check (
    (
      status = 'creating'
      and polar_checkout_id is null
      and checkout_url is null
      and expires_at is null
      and polar_order_id is null
      and paid_at is null
    )
    or (
      status = 'open'
      and polar_checkout_id is not null
      and checkout_url is not null
      and expires_at is not null
      and polar_order_id is null
      and paid_at is null
    )
    or (
      status = 'paid'
      and polar_order_id is not null
      and paid_at is not null
    )
    or (status = 'expired' and polar_order_id is null and paid_at is null)
  )
);

create unique index workspace_credit_purchases_one_pending_per_workspace
  on public.workspace_credit_purchases(workspace_id)
  where status in ('creating', 'open');

create table public.workspace_credit_ledger (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  purchase_id uuid references public.workspace_credit_purchases(id) on delete set null,
  polar_order_id text unique,
  amount integer not null check (amount <> 0),
  reason text not null check (reason in ('purchase', 'generation')),
  created_at timestamptz not null default now()
);

create index workspace_credit_ledger_workspace_created_idx
  on public.workspace_credit_ledger(workspace_id, created_at desc);

alter table public.workspace_credit_balances enable row level security;
alter table public.workspace_credit_purchases enable row level security;
alter table public.workspace_credit_ledger enable row level security;

revoke all on public.workspace_credit_balances
  from public, anon, authenticated;
grant select on public.workspace_credit_balances to authenticated;
create policy "Workspace members can read credit balances"
  on public.workspace_credit_balances for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

revoke all on public.workspace_credit_purchases
  from public, anon, authenticated;
grant all on public.workspace_credit_purchases to service_role;

revoke all on public.workspace_credit_ledger
  from public, anon, authenticated;
grant all on public.workspace_credit_ledger to service_role;

create or replace function public.reserve_workspace_credit(
  p_workspace_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance integer;
begin
  if v_user_id is null then
    return jsonb_build_object('status', 'not_authenticated');
  end if;

  if p_workspace_id is null or not public.is_workspace_member(p_workspace_id) then
    return jsonb_build_object('status', 'not_a_member');
  end if;

  insert into public.workspace_credit_balances (workspace_id)
    values (p_workspace_id)
    on conflict (workspace_id) do nothing;

  select balance into v_balance
    from public.workspace_credit_balances
    where workspace_id = p_workspace_id
    for update;

  if v_balance < 1 then
    return jsonb_build_object('status', 'insufficient', 'balance', v_balance);
  end if;

  update public.workspace_credit_balances
    set balance = balance - 1, updated_at = now()
    where workspace_id = p_workspace_id
    returning balance into v_balance;

  insert into public.workspace_credit_ledger (
    workspace_id, user_id, amount, reason
  )
  values (p_workspace_id, v_user_id, -1, 'generation');

  return jsonb_build_object('status', 'allowed', 'balance', v_balance);
end;
$$;

revoke all on function public.reserve_workspace_credit(uuid)
  from public, anon;
grant execute on function public.reserve_workspace_credit(uuid)
  to authenticated;

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
        when v_purchase.updated_at < now() - interval '5 minutes'
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
      and updated_at < now() - interval '5 minutes';

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

create or replace function public.save_workspace_credit_checkout(
  p_purchase_id uuid,
  p_purchaser_id uuid,
  p_checkout_id text,
  p_checkout_url text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_rows integer;
begin
  if nullif(trim(p_checkout_id), '') is null
    or nullif(trim(p_checkout_url), '') is null
    or p_expires_at <= now()
  then
    return false;
  end if;

  update public.workspace_credit_purchases
    set polar_checkout_id = p_checkout_id,
        checkout_url = p_checkout_url,
        expires_at = p_expires_at,
        status = case when status = 'creating' then 'open' else status end,
        updated_at = now()
    where id = p_purchase_id
      and purchaser_id = p_purchaser_id
      and status in ('creating', 'paid');

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

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
    workspace_id, purchaser_id, purchase_id, polar_order_id, amount, reason
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

revoke all on function public.claim_workspace_credit_checkout(
  uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.reclaim_workspace_credit_checkout(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.save_workspace_credit_checkout(
  uuid, uuid, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.claim_workspace_credit_checkout(
  uuid, uuid, text
) to service_role;
grant execute on function public.reclaim_workspace_credit_checkout(uuid, uuid)
  to service_role;
grant execute on function public.save_workspace_credit_checkout(
  uuid, uuid, text, text, timestamptz
) to service_role;
