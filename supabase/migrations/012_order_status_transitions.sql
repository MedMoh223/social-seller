-- Social Seller — Sprint 3: order status transitions (Orders tab).
-- Status change + stock decrement (on delivery) + audit log all happen
-- inside this single plpgsql function so they commit atomically — a
-- Postgres function body is one transaction by default; if any step
-- raises, everything rolls back. This is the "transaction" the task
-- asks for: supabase-js has no multi-statement transaction primitive
-- over PostgREST, so this RPC is the standard way to get one.
--
-- Called only from backend/src/routes/orders.ts (service_role) — the
-- route already resolves req.user.{tenantId,id} from the verified JWT,
-- so p_tenant_id/p_user_id here are trusted inputs from that call, not
-- from the mobile client directly. p_tenant_id is still re-checked
-- against the order's actual tenant_id below as defense in depth, in
-- case that route-level check is ever skipped by a future bug.

create or replace function public.transition_order_status(
  p_order_id uuid,
  p_tenant_id uuid,
  p_new_status text,
  p_user_id uuid,
  p_cancelled_reason text default null
)
returns public.orders
language plpgsql
as $$
declare
  v_order public.orders;
  v_old_status text;
begin
  select * into v_order from public.orders where id = p_order_id for update;

  if v_order.id is null or v_order.tenant_id <> p_tenant_id then
    raise exception 'order_not_found';
  end if;

  v_old_status := v_order.status;

  if not (
    (v_old_status = 'new' and p_new_status in ('confirmed', 'cancelled')) or
    (v_old_status = 'confirmed' and p_new_status in ('preparing', 'cancelled')) or
    (v_old_status = 'preparing' and p_new_status = 'shipped') or
    (v_old_status = 'shipped' and p_new_status = 'delivered')
  ) then
    raise exception 'invalid_transition: % -> %', v_old_status, p_new_status;
  end if;

  if p_new_status = 'cancelled' and coalesce(btrim(p_cancelled_reason), '') = '' then
    raise exception 'cancelled_reason_required';
  end if;

  update public.orders
  set status = p_new_status,
      cancelled_reason = case when p_new_status = 'cancelled' then p_cancelled_reason else cancelled_reason end
  where id = p_order_id
  returning * into v_order;

  if p_new_status = 'delivered' then
    update public.products p
    set stock_quantity = greatest(p.stock_quantity - oi.quantity, 0)
    from public.order_items oi
    where oi.order_id = p_order_id
      and p.id = oi.product_id;
  end if;

  insert into public.audit_log (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  values (
    v_order.tenant_id,
    p_user_id,
    'order_status_changed',
    'orders',
    p_order_id,
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', p_new_status)
  );

  return v_order;
end;
$$;

-- Backend-only: no grant to anon/authenticated, mirroring the rest of
-- this migration set's "service_role calls this directly" functions.
grant execute on function public.transition_order_status(uuid, uuid, text, uuid, text) to service_role;
