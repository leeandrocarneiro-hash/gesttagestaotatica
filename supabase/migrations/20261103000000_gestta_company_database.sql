-- GESTTA: isolated data storage per company, independent of Google Sheets.
-- Each Supabase Auth user represents exactly one company.
create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key references auth.users(id) on delete cascade,
  company_name text not null,
  cnpj text,
  created_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  service_code text not null,
  scheduled_date date,
  client text not null,
  phone text,
  description text not null,
  status text not null default 'Agendado',
  price numeric(14,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  unique(company_id, service_code)
);

create table if not exists public.attendances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  attendance_date date,
  client text not null,
  contact text,
  channel text,
  subject text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  material_date date,
  service_code text,
  material text not null,
  supplier text,
  quantity numeric(14,3) not null default 0,
  unit_cost numeric(14,2) not null default 0,
  total_cost numeric(14,2) generated always as (round(quantity * unit_cost, 2)) stored,
  created_at timestamptz not null default now()
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  receipt_date date,
  service_code text not null,
  client text,
  amount numeric(14,2) not null default 0,
  payment_method text,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  expense_date date,
  service_code text,
  category text not null,
  description text not null,
  amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists services_company_date_idx on public.services(company_id, scheduled_date);
create index if not exists attendances_company_date_idx on public.attendances(company_id, attendance_date);
create index if not exists materials_company_date_idx on public.materials(company_id, material_date);
create index if not exists receipts_company_date_idx on public.receipts(company_id, receipt_date);
create index if not exists expenses_company_date_idx on public.expenses(company_id, expense_date);

alter table public.companies enable row level security;
alter table public.services enable row level security;
alter table public.attendances enable row level security;
alter table public.materials enable row level security;
alter table public.receipts enable row level security;
alter table public.expenses enable row level security;

drop policy if exists "company reads own profile" on public.companies;
create policy "company reads own profile" on public.companies
  for select to authenticated using (id = auth.uid());

drop policy if exists "company updates own profile" on public.companies;
create policy "company updates own profile" on public.companies
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['services','attendances','materials','receipts','expenses'] loop
    execute format('drop policy if exists %I on public.%I', 'company owns rows', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (company_id = auth.uid()) with check (company_id = auth.uid())',
      'company owns rows', t
    );
  end loop;
end $$;

-- Company profile is created automatically when a company signs up.
create or replace function public.handle_new_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.companies (id, company_name, cnpj)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'company_name', 'Minha empresa'),
    nullif(new.raw_user_meta_data ->> 'cnpj', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_company on auth.users;
create trigger on_auth_user_created_company
  after insert on auth.users
  for each row execute procedure public.handle_new_company();
