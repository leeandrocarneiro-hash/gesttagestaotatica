-- GESTTA: identidade e isolamento por empresa.
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  spreadsheet_id text unique,
  created_at timestamptz not null default now()
);
alter table public.companies enable row level security;
create policy "company owner can read own company" on public.companies
  for select to authenticated using (owner_user_id = auth.uid());
create policy "company owner can set own sheet once" on public.companies
  for update to authenticated using (owner_user_id = auth.uid() and spreadsheet_id is null)
  with check (owner_user_id = auth.uid());
create or replace function public.create_company_for_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.companies(name, owner_user_id)
  values (coalesce(nullif(new.raw_user_meta_data->>'company_name',''), 'Minha empresa'), new.id)
  on conflict (owner_user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_gestta_company on auth.users;
create trigger on_auth_user_created_gestta_company
after insert on auth.users for each row execute procedure public.create_company_for_new_user();
