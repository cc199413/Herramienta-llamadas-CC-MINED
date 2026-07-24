-- ============================================================================
-- Esquema: centros_escolares
-- Copia en Supabase de la base de centros escolares que vive en Google Sheets.
-- Esta tabla es de SOLO LECTURA para la app (la escribe únicamente el script
-- de sincronización); el Google Sheet sigue siendo la fuente de verdad.
-- ============================================================================

create extension if not exists pgcrypto; -- para gen_random_uuid()

create table if not exists public.centros_escolares (
  id                uuid primary key default gen_random_uuid(),
  codigo            text not null unique,        -- código oficial del CE (clave natural)
  nombre            text not null,
  departamento      text,
  municipio         text,
  distrito          text,
  direccion         text,                         -- dirección textual, si la hoja la tiene
  latitud           double precision,             -- ubicación geográfica (nullable hasta geocodificar)
  longitud          double precision,
  telefonos         text[] not null default '{}', -- uno o varios números
  programa          text,                         -- ej. "Despega", o null
  modernizacion     boolean not null default false,
  fase              text,
  control            boolean not null default false, -- centro "control"
  fila_origen_sheet  integer,                      -- fila en el Sheet, útil para depurar
  sincronizado_en    timestamptz not null default now(),
  creado_en          timestamptz not null default now()
);

comment on table public.centros_escolares is
  'Copia sincronizada desde Google Sheets. No editar manualmente salvo excepción justificada: los cambios se sobrescriben en la próxima sincronización.';

-- Búsquedas típicas de la app: por código, y por ubicación
create index if not exists idx_centros_codigo       on public.centros_escolares (codigo);
create index if not exists idx_centros_departamento  on public.centros_escolares (departamento);
create index if not exists idx_centros_municipio     on public.centros_escolares (municipio);

-- Refresca sincronizado_en automáticamente en cada UPDATE (además del que hace el script)
create or replace function public.tocar_sincronizado_en()
returns trigger language plpgsql as $$
begin
  new.sincronizado_en = now();
  return new;
end;
$$;

drop trigger if exists trg_centros_sincronizado_en on public.centros_escolares;
create trigger trg_centros_sincronizado_en
  before update on public.centros_escolares
  for each row execute function public.tocar_sincronizado_en();

-- ----------------------------------------------------------------------------
-- Seguridad (RLS): habilitada por defecto. Ajusta las políticas según tus roles
-- reales en Supabase Auth. Este ejemplo asume:
--   - cualquier usuario autenticado puede LEER (la app la necesita para armar
--     campañas y mostrar la bandeja)
--   - solo el rol de servicio (usado por el script de sync) puede ESCRIBIR
-- ----------------------------------------------------------------------------
alter table public.centros_escolares enable row level security;

drop policy if exists "centros_lectura_autenticados" on public.centros_escolares;
create policy "centros_lectura_autenticados"
  on public.centros_escolares for select
  to authenticated
  using (true);

-- No se crea política de INSERT/UPDATE/DELETE para 'authenticated' ni 'anon':
-- solo la service_role key (usada por el script de sincronización, nunca
-- expuesta al navegador) puede escribir en esta tabla.
