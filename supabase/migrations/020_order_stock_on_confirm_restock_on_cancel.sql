-- Social Seller — US-16 : réappro stock automatique à l'annulation.
--
-- Avant cette migration :
--   • Le stock était décrémenté à la livraison (status = 'delivered').
--   • La cancellation n'étant possible que depuis 'new' ou 'confirmed'
--     (avant toute décrémentation), le réappro était un no-op.
--
-- Après cette migration :
--   • Le stock est décrémenté à la confirmation (status = 'confirmed').
--     C'est plus réaliste pour un commerce physique : la commande
--     confirmée réserve les articles, pas la livraison constatée.
--   • Sur annulation depuis 'confirmed' (seul état où le stock a déjà
--     été décrémenté), le stock est restitué automatiquement.
--
-- Les commandes existantes déjà en 'confirmed'/'preparing'/'shipped'
-- conservent leur stock tel quel (pas de ré-ajustement rétroactif).
-- Seules les nouvelles transitions déclenchent la nouvelle logique.

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
    (v_old_status = 'new'       and p_new_status in ('confirmed', 'cancelled')) or
    (v_old_status = 'confirmed' and p_new_status in ('preparing', 'cancelled')) or
    (v_old_status = 'preparing' and p_new_status = 'shipped') or
    (v_old_status = 'shipped'   and p_new_status = 'delivered')
  ) then
    raise exception 'invalid_transition: % -> %', v_old_status, p_new_status;
  end if;

  if p_new_status = 'cancelled' and coalesce(btrim(p_cancelled_reason), '') = '' then
    raise exception 'cancelled_reason_required';
  end if;

  update public.orders
  set
    status           = p_new_status,
    cancelled_reason = case
                         when p_new_status = 'cancelled' then p_cancelled_reason
                         else cancelled_reason
                       end
  where id = p_order_id
  returning * into v_order;

  -- Décrémentation stock : à la confirmation (stock réservé dès validation).
  if p_new_status = 'confirmed' then
    update public.products p
    set stock_quantity = greatest(p.stock_quantity - oi.quantity, 0)
    from public.order_items oi
    where oi.order_id = p_order_id
      and p.id = oi.product_id
      and p.tenant_id = p_tenant_id;
  end if;

  -- Réappro stock : si annulation depuis 'confirmed' (le seul état où
  -- le stock a déjà été décrémenté par cette fonction).
  if p_new_status = 'cancelled' and v_old_status = 'confirmed' then
    update public.products p
    set stock_quantity = p.stock_quantity + oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id
      and p.id = oi.product_id
      and p.tenant_id = p_tenant_id;
  end if;

  insert into public.audit_log (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  values (
    v_order.tenant_id,
    p_user_id,
    'order_status_changed',
    'orders',
    p_order_id,
    jsonb_build_object('status', v_old_status),
    jsonb_build_object(
      'status', p_new_status,
      'cancelled_reason', p_cancelled_reason
    )
  );

  return v_order;
end;
$$;

grant execute on function public.transition_order_status(uuid, uuid, text, uuid, text) to service_role;
