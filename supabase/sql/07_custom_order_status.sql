-- Custom orders: same note-carrying fix already applied to orders in 06.
--
-- log_custom_order_status_change already inserts a custom_order_status_history
-- row whenever the status changes, and trg_custom_order_status_logged emails
-- the customer about it. So the dashboard must NOT insert its own row - that
-- would duplicate both the timeline entry and the customer's email.
--
-- Safe to re-run.

begin;

create or replace function public.log_custom_order_status_change()
returns trigger
language plpgsql
as $$
begin
  if old.status is distinct from new.status then
    insert into public.custom_order_status_history (custom_order_id, status, note, changed_by)
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

-- Move a request along, optionally recording a quote and a private note.
-- The customer-facing note goes into the timeline (and so into their email);
-- admin_notes stays internal.
create or replace function public.admin_set_custom_order_status(
  p_id            uuid,
  p_status        text,
  p_note          text    default null,
  p_quoted_price  numeric default null,
  p_admin_notes   text    default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'You do not have permission to change this request.';
  end if;

  perform set_config('sunflora.status_note',  coalesce(btrim(p_note), ''), true);
  perform set_config('sunflora.status_actor', coalesce(auth.uid()::text, ''), true);

  update public.custom_orders
     set status       = p_status::custom_order_status,
         quoted_price = coalesce(p_quoted_price, quoted_price),
         admin_notes  = coalesce(p_admin_notes, admin_notes)
   where id = p_id;

  perform set_config('sunflora.status_note',  '', true);
  perform set_config('sunflora.status_actor', '', true);
end $$;

revoke execute on function public.admin_set_custom_order_status(uuid, text, text, numeric, text) from public, anon;
grant  execute on function public.admin_set_custom_order_status(uuid, text, text, numeric, text) to authenticated;

commit;
