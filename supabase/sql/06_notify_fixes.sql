-- Corrections once the existing notification machinery was visible.
--
-- What was already there and I had not accounted for:
--   * log_order_status_change  - BEFORE UPDATE on orders, already inserts an
--     order_status_history row whenever the status changes.
--   * trg_order_status_logged  - AFTER INSERT on order_status_history, calls
--     notify_edge('order.status_changed') which emails the customer.
--
-- Consequences this fixes:
--   1. The dashboard inserted its own history row on top of the trigger's, so
--      every status change produced TWO timeline entries and TWO emails.
--   2. admin_revise_order's audit row also tripped that email, so revising the
--      items sent the customer a "Your order is now: <stage>" message even
--      though the stage had not changed.
--
-- Safe to re-run.

begin;

-- ---------------------------------------------------------------------------
-- 1. Let a history row opt out of the customer email. Default true, so every
--    existing path behaves exactly as it does today.
-- ---------------------------------------------------------------------------
alter table public.order_status_history
  add column if not exists notify boolean not null default true;

create or replace function public.trg_order_status_logged()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.notify then
    perform public.notify_edge('order.status_changed', to_jsonb(new));
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Carry the note and the author into the row the trigger writes, instead of
--    the dashboard inserting a second one.
-- ---------------------------------------------------------------------------
create or replace function public.log_order_status_change()
returns trigger
language plpgsql
as $$
begin
  if old.status is distinct from new.status then
    insert into public.order_status_history (order_id, status, note, changed_by)
    values (
      new.id,
      new.status,
      nullif(current_setting('sunflora.status_note', true), ''),
      nullif(current_setting('sunflora.status_actor', true), '')::uuid
    );
  end if;
  new.updated_at = now();
  return new;
end $$;

-- The one supported way for the dashboard to move an order along.
create or replace function public.admin_set_order_status(
  p_order_id uuid,
  p_status   text,
  p_note     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'You do not have permission to change this order.';
  end if;

  perform set_config('sunflora.status_note',  coalesce(btrim(p_note), ''), true);
  perform set_config('sunflora.status_actor', coalesce(auth.uid()::text, ''), true);

  update public.orders set status = p_status::order_status where id = p_order_id;

  perform set_config('sunflora.status_note',  '', true);
  perform set_config('sunflora.status_actor', '', true);
end $$;

revoke execute on function public.admin_set_order_status(uuid, text, text) from public, anon;
grant  execute on function public.admin_set_order_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. admin_revise_order: same as 05, except the audit row is written with
--    notify = false. The customer still hears about the change - but from the
--    revision email, which actually describes what changed, rather than from a
--    status email announcing a stage that did not move.
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
  v_order    orders%rowtype;
  v_before   jsonb;
  v_after    jsonb;
  v_subtotal numeric;
  v_total    numeric;
  v_keep     uuid[];
  v_email    text;
  v_changes  text;
begin
  if not public.is_admin() then
    raise exception 'You do not have permission to change this order.';
  end if;

  select * into v_order from orders where id = p_order_id;
  if not found then raise exception 'That order could not be found.'; end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'An order must still have at least one item.';
  end if;

  select jsonb_agg(jsonb_build_object('name', product_name, 'quantity', quantity,
                                      'unit_price', unit_price) order by product_name)
    into v_before from order_items where order_id = p_order_id;

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
          values (p_order_id, nullif(it->>'product_id','')::uuid,
                  coalesce(nullif(it->>'product_name',''), 'Item'),
                  nullif(it->>'size_label',''), nullif(it->>'color_name',''),
                  (it->>'quantity')::int, (it->>'unit_price')::numeric)
          returning id into new_id;
          v_keep := v_keep || new_id;
        end;
      end if;
    end loop;
  end;

  delete from order_items where order_id = p_order_id and not (id = any(v_keep));

  select coalesce(sum(quantity * unit_price), 0) into v_subtotal
    from order_items where order_id = p_order_id;
  v_total := v_subtotal + coalesce(v_order.shipping_fee, 0) - coalesce(v_order.discount, 0);

  select jsonb_agg(jsonb_build_object('name', product_name, 'quantity', quantity,
                                      'unit_price', unit_price) order by product_name)
    into v_after from order_items where order_id = p_order_id;

  perform set_config('sunflora.order_revision', 'on', true);
  update orders set subtotal = v_subtotal, total = v_total, updated_at = now()
   where id = p_order_id;
  perform set_config('sunflora.order_revision', 'off', true);

  v_changes := format('Items revised. Total %s to %s.',
                      to_char(coalesce(v_order.total,0), 'FM999999990.00'),
                      to_char(v_total, 'FM999999990.00'));
  if coalesce(btrim(p_reason), '') <> '' then
    v_changes := v_changes || ' Reason: ' || left(btrim(p_reason), 500);
  end if;

  -- notify => false: the revision email covers this, not a status email.
  insert into order_status_history (order_id, status, note, changed_by, notify)
  values (p_order_id, v_order.status, v_changes, auth.uid(), false);

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

  return jsonb_build_object('subtotal', v_subtotal, 'total', v_total,
                            'email_queued', v_email is not null, 'to_email', v_email);
end $$;

commit;
