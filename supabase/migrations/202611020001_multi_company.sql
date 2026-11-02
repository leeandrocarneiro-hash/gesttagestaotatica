-- GESTTA multi-company foundation
-- Run in Supabase SQL Editor before enabling the application integration.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'company_admin' check (role in ('general_admin','company_admin','employee')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trade_name text,
  tax_id text,
  contact_email text not null,
  phone text,
  created_by uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending','approved','awaiting_sheet','active','rejected','blocked')),
  spreadsheet_id text,
  spreadsheet_url text,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_spreadsheet_required_when_active check (status <> 'active' or spreadsheet_id is not null)
);

create unique index if not exists companies_tax_id_unique on public.companies (tax_id) where tax_id is not null and tax_id <> '';

create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'employee' check (role in ('company_admin','employee')),
  permissions jsonb not null default '{"dashboard":true}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

create index if not exists company_members_user_id_idx on public.company_members(user_id);
create index if not exists companies_status_idx on public.companies(status);

create or replace function public.is_general_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'general_admin' and p.active = true
  );
$$;

create or replace function public.is_company_admin(target_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id = target_company
      and m.user_id = auth.uid()
      and m.role = 'company_admin'
      and m.active = true
  );
$$;

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles
for select to authenticated using (id = auth.uid() or public.is_general_admin());

drop policy if exists "General admins manage profiles" on public.profiles;
create policy "General admins manage profiles" on public.profiles
for all to authenticated using (public.is_general_admin()) with check (public.is_general_admin());

drop policy if exists "Members read their company" on public.companies;
create policy "Members read their company" on public.companies
for select to authenticated using (
  public.is_general_admin() or exists (
    select 1 from public.company_members m
    where m.company_id = companies.id and m.user_id = auth.uid() and m.active = true
  )
);

drop policy if exists "Authenticated users request company registration" on public.companies;
create policy "Authenticated users request company registration" on public.companies
for insert to authenticated with check (
  status = 'pending' and spreadsheet_id is null and approved_by is null and approved_at is null and created_by = auth.uid()
);

drop policy if exists "General admins manage companies" on public.companies;
create policy "General admins manage companies" on public.companies
for all to authenticated using (public.is_general_admin()) with check (public.is_general_admin());

drop policy if exists "Members read own memberships" on public.company_members;
create policy "Members read own memberships" on public.company_members
for select to authenticated using (
  user_id = auth.uid() or public.is_general_admin() or public.is_company_admin(company_id)
);

drop policy if exists "Company creator can add first admin" on public.company_members;
create policy "Company creator can add first admin" on public.company_members
for insert to authenticated with check (
  user_id = auth.uid() and role = 'company_admin' and exists (
    select 1 from public.companies c
    where c.id = company_id and c.created_by = auth.uid() and c.status = 'pending'
  )
);

drop policy if exists "Company admins manage their employees" on public.company_members;
create policy "Company admins manage their employees" on public.company_members
for all to authenticated using (
  public.is_general_admin() or (
    public.is_company_admin(company_id) and role = 'employee'
  )
) with check (
  public.is_general_admin() or (
    public.is_company_admin(company_id) and role = 'employee'
  )
);

-- The first general administrator must be promoted manually by a trusted project owner:
-- update public.profiles set role = 'general_admin' where id = '<AUTH_USER_UUID>';
-- Do not expose a service-role key in the browser.
