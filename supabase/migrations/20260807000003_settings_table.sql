-- Settings table for site-wide configuration flags
create table if not exists public.settings (
  key   text primary key,
  value text not null
);

-- Only authenticated (admin) users can update settings
alter table public.settings enable row level security;

create policy "Anyone can read settings"
  on public.settings for select
  using (true);

create policy "Only authenticated users can update settings"
  on public.settings for update
  using (auth.role() = 'authenticated');

create policy "Only authenticated users can insert settings"
  on public.settings for insert
  with check (auth.role() = 'authenticated');

-- Default: catalog is NOT public (admin-only)
insert into public.settings (key, value)
values ('catalog_public', 'false')
on conflict (key) do nothing;
