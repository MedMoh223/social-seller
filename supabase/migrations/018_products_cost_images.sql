-- Sprint 4 — product cost price and image gallery
ALTER TABLE public.products
  ADD COLUMN cost_price numeric(12,2) CHECK (cost_price >= 0),
  ADD COLUMN image_urls text[] NOT NULL DEFAULT '{}';
