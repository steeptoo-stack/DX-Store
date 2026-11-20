-- ============================================================================
-- DX-Store Payment System Migration (Nagad, Rocket, Upay, Advance Delivery COD & Screenshots)
-- Safe to run on an existing DX-Store database: preserves all products, categories,
-- store_settings, customers, and existing orders.
-- ============================================================================

-- 1. UPDATE ORDERS TABLE FOR ROCKET, UPAY, ADVANCE/COD SPLIT & SCREENSHOT PROOF
do $$
declare
  c_name text;
begin
  for c_name in
    select conname
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%payment_method%'
  loop
    execute format('alter table public.orders drop constraint %I', c_name);
  end loop;
end $$;

alter table public.orders
  add constraint orders_payment_method_check
  check (payment_method in ('cod', 'bkash', 'nagad', 'rocket', 'upay'));

alter table public.orders
  add column if not exists advance_amount numeric(12, 2) not null default 0 check (advance_amount >= 0);

alter table public.orders
  add column if not exists remaining_cod_amount numeric(12, 2) not null default 0 check (remaining_cod_amount >= 0);

alter table public.orders
  add column if not exists payment_screenshot_url text;

-- Backfill existing historical orders without altering existing totals
update public.orders
set
  advance_amount = case
    when payment_method = 'cod' then 0
    else coalesce(delivery_charge, 0)
  end,
  remaining_cod_amount = case
    when payment_method = 'cod' then coalesce(total, 0)
    else greatest(0, coalesce(total, 0) - coalesce(delivery_charge, 0))
  end
where advance_amount = 0
  and remaining_cod_amount = 0
  and total > 0;

-- Ensure table-level privileges exist while RLS keeps customer rows private
grant select, insert on public.orders to anon, authenticated;
grant update, delete on public.orders to authenticated;

-- 2. UPDATE ORDER INSERTION RLS POLICY (ENFORCE TRXID OR SCREENSHOT FOR MOBILE BANKING)
drop policy if exists "Anyone can place an order" on public.orders;
create policy "Anyone can place an order"
  on public.orders
  for insert
  to anon, authenticated
  with check (
    char_length(trim(id)) > 0
    and char_length(trim(customer_name)) > 0
    and char_length(regexp_replace(phone, '[^0-9]', '', 'g')) >= 6
    and char_length(trim(address)) > 0
    and char_length(trim(district)) > 0
    and jsonb_typeof(items) = 'array'
    and items <> '[]'::jsonb
    and subtotal >= 0
    and delivery_charge >= 0
    and advance_amount >= 0
    and remaining_cod_amount >= 0
    and total >= 0
    and payment_method in ('cod', 'bkash', 'nagad', 'rocket', 'upay')
    and (
      payment_method = 'cod'
      or char_length(trim(coalesce(transaction_id, ''))) > 0
      or char_length(trim(coalesce(payment_screenshot_url, ''))) > 0
    )
    and payment_status = 'Pending'
    and order_status = 'Pending'
  );

-- 3. UPDATE SAFE ORDER TRACKING RPC (RETURNS ADVANCE/COD AMOUNTS WITHOUT EXPOSING PRIVATE SCREENSHOTS)
drop function if exists public.track_order(text);
create or replace function public.track_order(p_query text)
returns table (
  id text,
  customer_name text,
  phone text,
  email text,
  address text,
  district text,
  thana text,
  notes text,
  items jsonb,
  subtotal numeric,
  delivery_charge numeric,
  advance_amount numeric,
  remaining_cod_amount numeric,
  total numeric,
  payment_method text,
  payment_status text,
  payment_phone_number text,
  transaction_id text,
  order_status text,
  timeline jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with clean as (
    select
      coalesce(trim(p_query), '') as raw_q,
      regexp_replace(coalesce(trim(p_query), ''), '[^0-9]', '', 'g') as digits_q
  )
  select
    o.id,
    o.customer_name,
    case
      when char_length(o.phone) >= 6 then left(o.phone, 3) || '*****' || right(o.phone, 3)
      else '***'
    end as phone,
    ''::text as email,
    o.district as address,
    o.district,
    ''::text as thana,
    null::text as notes,
    o.items,
    o.subtotal,
    o.delivery_charge,
    o.advance_amount,
    o.remaining_cod_amount,
    o.total,
    o.payment_method,
    o.payment_status,
    null::text as payment_phone_number,
    case
      when o.transaction_id is not null and char_length(o.transaction_id) >= 4
        then left(o.transaction_id, 2) || '****' || right(o.transaction_id, 2)
      else null
    end as transaction_id,
    o.order_status,
    o.timeline,
    o.created_at,
    o.updated_at
  from public.orders o, clean c
  where char_length(c.raw_q) >= 5
    and (
      lower(o.id) = lower(c.raw_q)
      or (
        char_length(c.digits_q) >= 10
        and regexp_replace(o.phone, '[^0-9]', '', 'g') = c.digits_q
      )
    )
  order by o.created_at desc
  limit 1;
$$;

revoke all on function public.track_order(text) from public;
grant execute on function public.track_order(text) to anon, authenticated;

-- 4. PRIVATE SUPABASE STORAGE BUCKET & STRICT RLS POLICIES FOR PAYMENT SCREENSHOTS
-- Public/anonymous users can upload proof images only into orders/... and cannot list or read other customers' screenshots.
-- Only authenticated admins (public.is_admin()) can view, generate signed URLs for, or delete payment screenshots.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-screenshots',
  'payment-screenshots',
  false,
  5242880, -- 5 MB
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Customers can upload payment screenshots" on storage.objects;
create policy "Customers can upload payment screenshots"
  on storage.objects
  for insert
  to anon, authenticated
  with check (
    bucket_id = 'payment-screenshots'
    and name like 'orders/%'
  );

drop policy if exists "Admins can view payment screenshots" on storage.objects;
create policy "Admins can view payment screenshots"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'payment-screenshots' and public.is_admin());

drop policy if exists "Admins can delete payment screenshots" on storage.objects;
create policy "Admins can delete payment screenshots"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'payment-screenshots' and public.is_admin());
