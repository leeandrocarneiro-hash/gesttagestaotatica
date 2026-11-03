-- GESTTA multi-company hardening.
-- Backfill company profiles for auth users that existed before the signup trigger.
insert into public.companies (id, company_name)
select u.id,
       coalesce(nullif(u.raw_user_meta_data ->> 'company_name', ''), 'Minha empresa')
from auth.users u
left join public.companies c on c.id = u.id
where c.id is null
on conflict (id) do nothing;

-- Reassert tenant isolation on every company-owned table. The authenticated
-- user's UUID is the tenant ID; clients cannot choose another company's ID.
alter table public.companies enable row level security;
alter table public.services enable row level security;
alter table public.attendances enable row level security;
alter table public.materials enable row level security;
alter table public.receipts enable row level security;
alter table public.expenses enable row level security;
alter table public.clients enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

drop policy if exists "company reads own profile" on public.companies;
create policy "company reads own profile"
  on public.companies for select to authenticated
  using (id = (select auth.uid()));

-- Company profile creation and status changes are performed only by trusted
-- database triggers/operators, never by a normal company account.
drop policy if exists "company updates own profile" on public.companies;
drop policy if exists "company inserts own profile" on public.companies;

do $$
declare t text;
begin
  foreach t in array array[
    'services','attendances','materials','receipts','expenses',
    'clients','purchases','purchase_items'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'company owns rows', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (company_id = (select auth.uid())) with check (company_id = (select auth.uid()))',
      'company owns rows', t
    );
  end loop;
end $$;

-- A purchase item may only reference a purchase or material belonging to the
-- same tenant. This prevents cross-company links even if IDs are guessed.
create or replace function public.gestta_validate_purchase_item_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.purchase_id is not null and not exists (
    select 1 from public.purchases p
    where p.id = new.purchase_id and p.company_id = new.company_id
  ) then
    raise exception 'A compra informada não pertence a esta empresa.';
  end if;

  if new.material_id is not null and not exists (
    select 1 from public.materials m
    where m.id = new.material_id and m.company_id = new.company_id
  ) then
    raise exception 'O material informado não pertence a esta empresa.';
  end if;

  return new;
end;
$$;

drop trigger if exists gestta_purchase_item_tenant_guard on public.purchase_items;
create trigger gestta_purchase_item_tenant_guard
  before insert or update of company_id, purchase_id, material_id
  on public.purchase_items
  for each row execute function public.gestta_validate_purchase_item_tenant();

create index if not exists clients_company_created_idx
  on public.clients(company_id, created_at desc);
create index if not exists purchases_company_created_idx
  on public.purchases(company_id, created_at desc);
create index if not exists purchase_items_company_created_idx
  on public.purchase_items(company_id, created_at desc);

-- The administrator grant table is private; an account can only read its own
-- grant. Grants must be assigned by a trusted database operator.
alter table public.gestta_admins enable row level security;
drop policy if exists "admin can read own admin grant" on public.gestta_admins;
create policy "admin can read own admin grant"
  on public.gestta_admins for select to authenticated
  using (user_id = (select auth.uid()));
