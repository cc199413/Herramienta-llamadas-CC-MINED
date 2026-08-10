-- ============================================================================
-- migracion_permisos.sql
-- ----------------------------------------------------------------------------
-- Otorga los privilegios de PostgreSQL (GRANTs) necesarios sobre el esquema
-- public. Supabase revoca los privilegios por defecto en cualquier proyecto
-- nuevo; sin este script, las políticas de RLS (Row Level Security) de cada
-- tabla NUNCA llegan a evaluarse, y toda consulta falla con "permission
-- denied" o, en el caso del login de la app, con el mensaje engañoso
-- "No se encontró tu perfil" — aunque la fila sí exista y la política RLS
-- sea correcta.
--
-- Este archivo se aplicó originalmente en producción de forma manual (no
-- había quedado versionado en el repo). Se reconstruyó y documentó aquí el
-- 10/ago/2026 al montar el ambiente de staging, para no depender de la
-- memoria la próxima vez que haya que levantar un proyecto de Supabase desde
-- cero.
--
-- Cuándo correr esto:
--   - Justo después de aplicar el esquema completo (tablas + políticas RLS)
--     en un proyecto de Supabase nuevo (producción o staging).
--   - Se puede correr las veces que haga falta; todos los GRANT de aquí son
--     idempotentes (no fallan si ya estaban aplicados).
-- ============================================================================

-- Permite que los roles anon (sin sesión) y authenticated (con sesión) vean
-- que el esquema "public" existe. Sin esto, ni siquiera se puede intentar
-- una consulta contra ninguna tabla.
grant usage on schema public to anon, authenticated;

-- Privilegios sobre las tablas para usuarios YA autenticados (con sesión
-- de Supabase Auth). Las políticas RLS de cada tabla son las que de verdad
-- deciden qué filas puede ver/editar cada quien; esto solo habilita que el
-- motor intente evaluarlas.
grant select, insert, update, delete on all tables in schema public to authenticated;

-- centros_escolares también se puede leer sin sesión (pantalla de login no
-- la necesita hoy, pero se deja explícito por si algún flujo público la usa
-- a futuro, p.ej. una vista de solo-lectura del catálogo).
grant select on public.centros_escolares to anon, authenticated;

-- Secuencias (autoincrementales) usadas por columnas id/serial, si las hay.
grant usage, select on all sequences in schema public to authenticated;

-- Aplica los mismos privilegios automáticamente a cualquier tabla o
-- secuencia NUEVA que se cree en el futuro en este esquema, sin tener que
-- acordarse de correr un GRANT manual cada vez que se agregue una tabla.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;

-- ============================================================================
-- Verificación rápida después de correr este archivo:
--
--   select grantee, table_name, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public' and grantee = 'authenticated'
--   order by table_name, privilege_type;
--
-- Debe listar SELECT/INSERT/UPDATE/DELETE para las 8 tablas del proyecto:
-- bitacora, campana_agentes, campanas, centros_escolares, configuracion,
-- profiles, registros, tiempos_diarios.
-- ============================================================================
