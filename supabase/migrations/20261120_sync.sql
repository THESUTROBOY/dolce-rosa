-- Dolce Rosa: sincronización entre equipos.
-- Cada registro de la app (cuenta, comanda, gasto, producto…) es una fila de `records`.
-- Solo usuarios con sesión iniciada (la cuenta del local) pueden leer o escribir.

create table if not exists public.records (
  collection text not null,
  id text not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  device text,
  primary key (collection, id)
);
create index if not exists records_updated_at on public.records (updated_at);
alter table public.records enable row level security;
create policy "local lee" on public.records for select to authenticated using (true);
create policy "local inserta" on public.records for insert to authenticated with check (true);
create policy "local actualiza" on public.records for update to authenticated using (true) with check (true);
alter table public.records replica identity full;
alter publication supabase_realtime add table public.records;

-- Respaldo diario completo; se guardan los últimos 30 días.
create table if not exists public.backups (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  device text,
  data jsonb not null
);
alter table public.backups enable row level security;
create policy "local lee respaldos" on public.backups for select to authenticated using (true);
create policy "local respalda" on public.backups for insert to authenticated with check (true);

create or replace function public.prune_backups() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.backups where created_at < now() - interval '30 days';
  return new;
end $$;
drop trigger if exists prune_backups on public.backups;
create trigger prune_backups after insert on public.backups for each statement execute function public.prune_backups();

-- Fotos de boletas y facturas (privadas).
insert into storage.buckets (id, name, public) values ('boletas', 'boletas', false) on conflict (id) do nothing;
create policy "local sube fotos" on storage.objects for insert to authenticated with check (bucket_id = 'boletas');
create policy "local ve fotos" on storage.objects for select to authenticated using (bucket_id = 'boletas');
