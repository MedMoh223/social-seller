-- Sprint 4 — orders: customer link, delivery address, delivery fee, discount
ALTER TABLE public.orders
  ADD COLUMN customer_id uuid REFERENCES public.customers(id),
  ADD COLUMN delivery_address text,
  ADD COLUMN delivery_fee numeric(12,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  ADD COLUMN discount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount >= 0);
