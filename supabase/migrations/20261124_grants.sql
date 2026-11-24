-- Permisos explícitos para la cuenta del local (rol authenticated).
-- Los proyectos Supabase nuevos ya no dan acceso automático a las tablas nuevas
-- por la Data API, así que sin esto la app recibe "permission denied for table records".
-- RLS sigue activo: el rol anon (sin sesión) no recibe permisos.
grant usage on schema public to authenticated;
grant select, insert, update on public.records to authenticated;
grant select, insert on public.backups to authenticated;
grant usage, select on sequence public.backups_id_seq to authenticated;
