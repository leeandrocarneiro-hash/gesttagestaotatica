-- GESTTA multi-company identity foundation.
-- Supabase Auth owns credentials; Google Sheets remains operational storage.
create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 160),
  owner_user_id uuid not null unique references auth.users(id) on delete restrict,
  spreadsheet_id text unique,
  status text not null default 'active' check (status in ('active','suspended','pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null unique references public.companies(id) on delete restrict,
  display_name text,
  role text not null default 'company_admin' check (role in ('company_admin','general_admin')),
  created_at timestamptz not null default now()
);

create index if not exists companies_owner_user_id_idx on public.companies(owner_user_id);
create index if not exists profiles_company_id_idx on public.profiles(company_id);

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.company_id
  from public.profiles p
  where p.user_id = (select auth.uid())
  limit 1
$$;

create or replace function public.is_general_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'general_admin', false)
$$;

create or replace function public.handle_new_gestta_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_company_id uuid;
  company_name text;
begin
  company_name := nullif(trim(new.raw_user_meta_data ->> 'company_name'), '');
  if company_name is null or char_length(company_name) > 160 then
    raise exception 'Nome da empresa obrigatório (2 a 160 caracteres)';
  end if;

  insert into public.companies (name, owner_user_id)
  values (company_name, new.id)
  returning id into new_company_id;

  insert into public.profiles (user_id, company_id, display_name, role)
  values (new.id, new_company_id, nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'company_admin');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_gestta on auth.users;
create trigger on_auth_user_created_gestta
  after insert on auth.users
  for each row execute function public.handle_new_gestta_user();

alter table public.companies enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "company members read own company" on public.companies;
create policy "company members read own company"
  on public.companies for select to authenticated
  using (id = (select public.current_company_id()) or (select public.is_general_admin()));

drop policy if exists "company admins update own company name" on public.companies;
create policy "company admins update own company name"
  on public.companies for update to authenticated
  using (id = (select public.current_company_id()) and owner_user_id = (select auth.uid()))
  with check (id = (select public.current_company_id()) and owner_user_id = (select auth.uid()));

drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile"
  on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_general_admin()));

-- No client-side profile/company inserts: the auth.users trigger provisions them atomically.
-- No client-side spreadsheet_id writes. A trusted server function must validate Google access
-- before setting that mapping; service-role credentials must never reach the browser.
