-- ============================================================================
-- DX-Store Supabase Initial SmigrationS Policies, and Storage Setup
-- Run this migrmigrationation in your Supabase Project -> SQL Editor
-- ============================================================================

-- 1. ADMIN USERS TABLE & SECURITY HELPER
-- Only users whose auth.users.id exists in public.admin_users have admin write access.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null default 'admin',
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

drop policy if exists "Admin users can read own admin record" on public.admin_users;
create policy "Admin users can read own admin record"
  on public.admin_users
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Security-definer helper used by all RLS policies to verify admin privileges
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.admin_users
      where user_id = auth.uid()
    );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- Shared updated_at trigger function (pinned search_path for security)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 2. CATEGORIES TABLE
-- ============================================================================
create table if not exists public.categories (
  id text primary key,
  name text not null,
  slug text not null unique,
  description text not null default '',
  image text not null default '',
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists categories_name_lower_idx
  on public.categories (lower(name));

drop trigger if exists set_categories_updated_at on public.categories;
create trigger set_categories_updated_at
  before update on public.categories
  for each row
  execute function public.set_updated_at();

alter table public.categories enable row level security;

drop policy if exists "Public can read categories" on public.categories;
create policy "Public can read categories"
  on public.categories
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins can insert categories" on public.categories;
create policy "Admins can insert categories"
  on public.categories
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admins can update categories" on public.categories;
create policy "Admins can update categories"
  on public.categories
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can delete categories" on public.categories;
create policy "Admins can delete categories"
  on public.categories
  for delete
  to authenticated
  using (public.is_admin());

-- ============================================================================
-- 3. PRODUCTS TABLE
-- ============================================================================
create table if not exists public.products (
  id text primary key,
  name text not null,
  slug text not null unique,
  category text not null,
  brand text,
  price numeric(12, 2) not null check (price >= 0),
  discount_price numeric(12, 2) check (discount_price is null or discount_price >= 0),
  stock integer not null default 0 check (stock >= 0),
  sku text not null default '',
  images jsonb not null default '[]'::jsonb,
  main_image text not null default '',
  status text not null default 'active' check (status in ('active', 'inactive', 'draft', 'out_of_stock')),
  is_featured boolean not null default false,
  is_new_arrival boolean not null default false,
  is_visible boolean not null default true,
  short_description text not null default '',
  description text not null default '',
  specifications jsonb not null default '[]'::jsonb,
  features jsonb not null default '[]'::jsonb,
  warranty text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_category_idx on public.products (category);
create index if not exists products_created_at_idx on public.products (created_at desc);

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
  before update on public.products
  for each row
  execute function public.set_updated_at();

alter table public.products enable row level security;

drop policy if exists "Public can read active visible products; admins read all" on public.products;
create policy "Public can read active visible products; admins read all"
  on public.products
  for select
  to anon, authenticated
  using ((is_visible = true and status not in ('inactive', 'draft')) or public.is_admin());

drop policy if exists "Admins can insert products" on public.products;
create policy "Admins can insert products"
  on public.products
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admins can update products" on public.products;
create policy "Admins can update products"
  on public.products
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can delete products" on public.products;
create policy "Admins can delete products"
  on public.products
  for delete
  to authenticated
  using (public.is_admin());

-- ============================================================================
-- 4. STORE SETTINGS TABLE
-- ============================================================================
create table if not exists public.store_settings (
  id text primary key default 'default',
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists set_store_settings_updated_at on public.store_settings;
create trigger set_store_settings_updated_at
  before update on public.store_settings
  for each row
  execute function public.set_updated_at();

alter table public.store_settings enable row level security;

drop policy if exists "Public can read store settings" on public.store_settings;
create policy "Public can read store settings"
  on public.store_settings
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins can insert store settings" on public.store_settings;
create policy "Admins can insert store settings"
  on public.store_settings
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admins can update store settings" on public.store_settings;
create policy "Admins can update store settings"
  on public.store_settings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can delete store settings" on public.store_settings;
create policy "Admins can delete store settings"
  on public.store_settings
  for delete
  to authenticated
  using (public.is_admin());

-- ============================================================================
-- 5. ORDERS TABLE (Validated public checkout insert + Admin management + Safe tracking)
-- ============================================================================
create table if not exists public.orders (
  id text primary key,
  customer_name text not null,
  phone text not null,
  email text not null default '',
  address text not null,
  district text not null,
  thana text not null default '',
  notes text,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  delivery_charge numeric(12, 2) not null default 0 check (delivery_charge >= 0),
  total numeric(12, 2) not null default 0 check (total >= 0),
  payment_method text not null check (payment_method in ('cod', 'bkash', 'nagad')),
  payment_status text not null default 'Pending' check (payment_status in ('Pending', 'Verified', 'Rejected')),
  payment_phone_number text,
  transaction_id text,
  order_status text not null default 'Pending' check (order_status in ('Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled')),
  timeline jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
  before update on public.orders
  for each row
  execute function public.set_updated_at();

alter table public.orders enable row level security;

-- Public checkout can only insert new Pending orders with valid required fields (cannot forge Verified/Confirmed status)
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
    and total >= 0
    and payment_status = 'Pending'
    and order_status = 'Pending'
  );

drop policy if exists "Admins can read all orders" on public.orders;
create policy "Admins can read all orders"
  on public.orders
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins can update orders" on public.orders;
create policy "Admins can update orders"
  on public.orders
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can delete orders" on public.orders;
create policy "Admins can delete orders"
  on public.orders
  for delete
  to authenticated
  using (public.is_admin());

-- Safe order tracking lookup: requires minimum query length, prevents empty-phone matching,
-- and masks/omits sensitive PII (email, notes, sender wallet phone, full street/phone).
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

-- ============================================================================
-- 6. SUPABASE STORAGE BUCKET & RLS FOR PRODUCT IMAGES
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view product images" on storage.objects;
create policy "Public can view product images"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'product-images');

drop policy if exists "Admins can upload product images" on storage.objects;
create policy "Admins can upload product images"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "Admins can update product images" on storage.objects;
create policy "Admins can update product images"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "Admins can delete product images" on storage.objects;
create policy "Admins can delete product images"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
