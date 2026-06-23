-- Social Seller — Sprint 3: top-selling products for the Stats tab.
-- A genuine GROUP BY + SUM + ORDER BY + LIMIT across order_items/orders/
-- products isn't expressible through PostgREST's filter-based REST
-- interface, so this is a small read-only SQL function instead of a
-- query built with the JS query builder — same reasoning as
-- current_tenant_id() being `language sql stable` for a single query.

create or replace function public.get_top_products(p_tenant_id uuid, p_limit integer default 5)
returns table (product_id uuid, name text, total_sold bigint)
language sql
stable
as $$
  select p.id as product_id, p.name, sum(oi.quantity)::bigint as total_sold
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  join public.products p on p.id = oi.product_id
  where o.tenant_id = p_tenant_id
    and o.status = 'delivered'
  group by p.id, p.name
  order by total_sold desc
  limit p_limit;
$$;

-- Backend-only (service_role), same as the other RPCs introduced this sprint.
grant execute on function public.get_top_products(uuid, integer) to service_role;
