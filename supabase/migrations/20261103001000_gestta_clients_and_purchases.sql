-- Extend GESTTA's internal database for client and purchasing workflows.
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  document text,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  purchase_date date,
  supplier text not null,
  invoice_number text,
  invoice_key text,
  total numeric(14,2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  purchase_id uuid references public.purchases(id) on delete cascade,
  material_id uuid references public.materials(id) on delete set null,
  description text not null,
  quantity numeric(14,3) not null default 0,
  unit text,
  unit_cost numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists clients_company_idx on public.clients(company_id);
create index if not exists purchases_company_date_idx on public.purchases(company_id,purchase_date);
create index if not exists purchase_items_company_idx on public.purchase_items(company_id);
alter table public.clients enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
drop policy if exists "company owns rows" on public.clients;
create policy "company owns rows" on public.clients for all to authenticated using (company_id = auth.uid()) with check (company_id = auth.uid());
drop policy if exists "company owns rows" on public.purchases;
create policy "company owns rows" on public.purchases for all to authenticated using (company_id = auth.uid()) with check (company_id = auth.uid());
drop policy if exists "company owns rows" on public.purchase_items;
create policy "company owns rows" on public.purchase_items for all to authenticated using (company_id = auth.uid()) with check (company_id = auth.uid());
