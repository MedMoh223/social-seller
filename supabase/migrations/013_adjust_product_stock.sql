-- Social Seller — Sprint 3: stock adjustment (Stock tab).
-- Read-modify-write on stock_quantity + the audit log entry happen
-- inside this one plpgsql function (one transaction, `for update` row
-- lock) — this is the "transaction" CLAUDE.md calls for on stock
-- operations: two concurrent adjustments on the same product can't
-- silently lose one of them the way a naive read-then-write from the
-- backend in two separate requests could.
--
-- Called only from backend/src/routes/products.ts (service_role) with
-- req.user.{tenantId,id} already resolved from the verified JWT.
-- p_tenant_id is still re-checked against the product's actual
-- tenant_id below as defense in depth.

create or replace function public.adjust_product_stock(
  p_product_id uuid,
  p_tenant_id uuid,
  p_delta integer,
  p_reason text,
  p_user_id uuid
)
returns public.products
language plpgsql
as $$
declare
  v_product public.products;
  v_old_quantity integer;
  v_new_quantity integer;
begin
  select * into v_product from public.products where id = p_product_id for update;

  if v_product.id is null or v_product.tenant_id <> p_tenant_id or v_product.deleted_at is not null then
    raise exception 'product_not_found';
  end if;

  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required';
  end if;

  v_old_quantity := v_product.stock_quantity;
  v_new_quantity := v_old_quantity + p_delta;

  if v_new_quantity < 0 then
    raise exception 'insufficient_stock';
  end if;

  update public.products
  set stock_quantity = v_new_quantity
  where id = p_product_id
  returning * into v_product;

  insert into public.audit_log (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  values (
    p_tenant_id,
    p_user_id,
    'stock_adjusted',
    'products',
    p_product_id,
    jsonb_build_object('stock_quantity', v_old_quantity),
    jsonb_build_object('stock_quantity', v_new_quantity, 'delta', p_delta, 'reason', p_reason)
  );

  return v_product;
end;
$$;

grant execute on function public.adjust_product_stock(uuid, uuid, integer, text, uuid) to service_role;
