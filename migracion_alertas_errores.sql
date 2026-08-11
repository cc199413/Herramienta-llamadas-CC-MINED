-- ============================================================================
-- migracion_alertas_errores.sql
-- ----------------------------------------------------------------------------
-- Tabla para el nuevo módulo "Alertas": cuando a un Agente (o cualquier
-- usuario) le falla un guardado, además de mostrárselo a él en pantalla
-- (V1.16), se registra aquí para que Administrador, Team leader y
-- Supervisor lo vean en un módulo dedicado, con contador de pendientes.
--
-- Ejecutar en el SQL Editor, DESPUÉS de migracion_permisos.sql (esta última
-- ya otorga GRANT + ALTER DEFAULT PRIVILEGES sobre "todas las tablas,
-- incluidas las futuras" al rol authenticated, así que esta tabla nueva
-- hereda esos permisos automáticamente — no hace falta un GRANT aparte,
-- solo las políticas de RLS de abajo).
-- ============================================================================

create table if not exists public.alertas_errores (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.profiles(id) on delete set null,
  usuario_nombre text not null,
  usuario_rol text,
  mensaje text not null,
  detalle text,
  creado_en timestamptz not null default now(),
  revisado boolean not null default false,
  revisado_por uuid references public.profiles(id) on delete set null,
  revisado_en timestamptz
);

alter table public.alertas_errores enable row level security;

-- Cualquier usuario autenticado puede reportar SU PROPIO error (no el de otro).
drop policy if exists alertas_insert_propio on public.alertas_errores;
create policy alertas_insert_propio
on public.alertas_errores
for insert
with check (auth.uid() = usuario_id);

-- Solo Administrador, Team leader y Supervisor pueden ver la lista de alertas.
drop policy if exists alertas_select_supervision on public.alertas_errores;
create policy alertas_select_supervision
on public.alertas_errores
for select
using (rol_actual() in ('Administrador','Team leader','Supervisor'));

-- Solo esos mismos roles pueden marcar una alerta como revisada.
drop policy if exists alertas_update_supervision on public.alertas_errores;
create policy alertas_update_supervision
on public.alertas_errores
for update
using (rol_actual() in ('Administrador','Team leader','Supervisor'))
with check (rol_actual() in ('Administrador','Team leader','Supervisor'));

create index if not exists alertas_errores_revisado_idx on public.alertas_errores (revisado, creado_en desc);

-- ============================================================================
-- Verificación después de correr este archivo:
--
--   select count(*) from public.alertas_errores;
--   -- Debe devolver 0 (tabla recién creada, sin filas todavía).
--
--   select policyname, cmd from pg_policies where tablename = 'alertas_errores';
--   -- Debe devolver 3 filas (insert, select, update).
-- ============================================================================
