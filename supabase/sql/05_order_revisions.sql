-- Editable order items, with the customer notified of every change.
--
-- This deliberately reverses the original "line items are a financial record"
-- rule. Because it does, the change is not allowed to be silent: every
-- revision recalculates the order totals, writes an entry to
-- order_status_history saying what changed, and queues an email to the
-- customer. All three happen in ONE transaction - if the audit entry or the
-- queued email cannot be written, the item change is rolled back too.
--
-- Safe to re-run.

begin;

-- ---------------------------------------------------------------------------
-- 1. The financial-protection trigger has to let a *reviewed* change through,
--    while still blocking someone quietly editing a total by hand.
--    admin_revise_order sets a transaction-local flag; nothing else can.
-- ---------------------------------------------------------------------------
create or replace function public.orders_protect_financials()
returns trigger
language plpgsql
as $$
begin
  -- order_number, owner and placement time are never editable by anyone but
  -- the service role, revision or not.
  if current_user <> 'service_role' then
    if new.order_number is distinct from old.order_number
    or new.user_id     is distinct from old.user_id
    or new.created_at  is distinct from old.created_at then
      raise exception 'This order''s identity cannot be changed.';
    end if;
  end if;

  -- Amounts may change only inside admin_revise_order.
  if current_user <> 'service_role'
     and coalesce(current_setting('sunflora.order_revision', true), '') <> 'on' then
    if new.total        is distinct from old.total
    or new.subtotal     is distinct from old.subtotal
    or new.discount     is distinct from old.discount
    or new.shipping_fee is distinct from old.shipping_fee then
      raise exception
        'Order amounts can only be changed by revising the items, so the customer is told.';
    end if;
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Outbox. A revision records the email here in the same transaction, so a
--    mail can never be "forgotten" because a network call failed. A sender
--    drains it and marks rows sent.
-- ---------------------------------------------------------------------------
create table if not exists public.order_notifications (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  kind        text not null,
  to_email    text,
  payload     jsonb not null default '{}'::jsonb,
  status      text not null default 'pending',   -- pending | sent | failed
  attempts    int  not null default 0,
  last_error  text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);

create index if not exists order_notifications_pending_idx
  on public.order_notifications (status, created_at);

alter table public.order_notifications enable row level security;

-- Admins may look at the queue; nobody else can see it at all.
drop policy if exists admin_read_order_notifications on public.order_notifications;
create policy admin_read_order_notifications on public.order_notifications
  for select to authenticated using (public.is_admin());

drop policy if exists admin_update_order_notifications on public.order_notifications;
create policy admin_update_order_notifications on public.order_notifications
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. The one supported way to revise a placed order.
--
--    p_items is the complete desired list, e.g.
--      [{"id":"<existing row>","quantity":2,"unit_price":649},
--       {"product_name":"Gift wrap","quantity":1,"unit_price":50}]
--    Rows with an id are updated (keeping sku / image / mrp), rows without are
--    inserted, and anything left out is removed.
-- ---------------------------------------------------------------------------
create or replace function public.admin_revise_order(
  p_order_id uuid,
  p_items    jsonb,
  p_reason   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order      orders%rowtype;
  v_before     jsonb;
  v_after      jsonb;
  v_subtotal   numeric;
  v_total      numeric;
  v_keep       uuid[];
  v_email      text;
  v_changes    text;
begin
  if not public.is_admin() then
    raise exception 'You do not have permission to change this order.';
  end if;

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'That order could not be found.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'An order must still have at least one item.';
  end if;

  -- Snapshot for the audit entry and the email.
  select jsonb_agg(jsonb_build_object(
           'name', product_name, 'quantity', quantity, 'unit_price', unit_price)
           order by product_name)
    into v_before
    from order_items where order_id = p_order_id;

  -- Update / insert.
  v_keep := array[]::uuid[];
  declare it jsonb;
  begin
    for it in select value from jsonb_array_elements(p_items) loop
      if coalesce(it->>'quantity','0')::numeric <= 0 then
        raise exception 'Every item needs a quantity of at least one.';
      end if;
      if coalesce(it->>'unit_price','-1')::numeric < 0 then
        raise exception 'An item price cannot be negative.';
      end if;

      if nullif(it->>'id','') is not null then
        update order_items
           set product_name = coalesce(nullif(it->>'product_name',''), product_name),
               quantity     = (it->>'quantity')::int,
               unit_price   = (it->>'unit_price')::numeric,
               size_label   = coalesce(it->>'size_label', size_label),
               color_name   = coalesce(it->>'color_name', color_name)
         where id = (it->>'id')::uuid and order_id = p_order_id;
        v_keep := v_keep || (it->>'id')::uuid;
      else
        declare new_id uuid;
        begin
          insert into order_items (order_id, product_id, product_name, size_label,
                                   color_name, quantity, unit_price)
          values (p_order_id,
                  nullif(it->>'product_id','')::uuid,
                  coalesce(nullif(it->>'product_name',''), 'Item'),
                  nullif(it->>'size_label',''),
                  nullif(it->>'color_name',''),
                  (it->>'quantity')::int,
                  (it->>'unit_price')::numeric)
          returning id into new_id;
          v_keep := v_keep || new_id;
        end;
      end if;
    end loop;
  end;

  delete from order_items where order_id = p_order_id and not (id = any(v_keep));

  -- Recalculate. Shipping and discount are left exactly as they were.
  select coalesce(sum(quantity * unit_price), 0) into v_subtotal
    from order_items where order_id = p_order_id;
  v_total := v_subtotal + coalesce(v_order.shipping_fee, 0) - coalesce(v_order.discount, 0);

  select jsonb_agg(jsonb_build_object(
           'name', product_name, 'quantity', quantity, 'unit_price', unit_price)
           order by product_name)
    into v_after
    from order_items where order_id = p_order_id;

  perform set_config('sunflora.order_revision', 'on', true);
  update orders
     set subtotal = v_subtotal,
         total    = v_total,
         updated_at = now()
   where id = p_order_id;
  perform set_config('sunflora.order_revision', 'off', true);

  -- Audit entry. Uses the order's current status so the timeline stays honest.
  v_changes := format('Items revised. Total %s to %s.',
                      to_char(coalesce(v_order.total,0), 'FM999999990.00'),
                      to_char(v_total, 'FM999999990.00'));
  if coalesce(btrim(p_reason), '') <> '' then
    v_changes := v_changes || ' Reason: ' || left(btrim(p_reason), 500);
  end if;

  insert into order_status_history (order_id, status, note, changed_by)
  values (p_order_id, v_order.status, v_changes, auth.uid());

  -- Queue the customer email in the same transaction.
  v_email := coalesce(nullif(v_order.guest_email, ''),
                      (select u.email from auth.users u where u.id = v_order.user_id));

  insert into public.order_notifications (order_id, kind, to_email, payload)
  values (p_order_id, 'order_revised', v_email,
          jsonb_build_object(
            'order_number',  v_order.order_number,
            'customer_name', coalesce(nullif(v_order.guest_name,''), 'there'),
            'reason',        nullif(btrim(coalesce(p_reason,'')), ''),
            'items_before',  coalesce(v_before, '[]'::jsonb),
            'items_after',   coalesce(v_after,  '[]'::jsonb),
            'total_before',  coalesce(v_order.total, 0),
            'total_after',   v_total,
            'shipping_fee',  coalesce(v_order.shipping_fee, 0),
            'discount',      coalesce(v_order.discount, 0)
          ));

  return jsonb_build_object(
    'subtotal',      v_subtotal,
    'total',         v_total,
    'email_queued',  v_email is not null,
    'to_email',      v_email
  );
end $$;

revoke execute on function public.admin_revise_order(uuid, jsonb, text) from public, anon;
grant  execute on function public.admin_revise_order(uuid, jsonb, text) to authenticated;

commit;
