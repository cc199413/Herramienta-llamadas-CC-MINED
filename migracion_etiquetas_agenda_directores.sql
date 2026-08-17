-- ============================================================================
-- migracion_etiquetas_agenda_directores.sql
-- ----------------------------------------------------------------------------
-- Soporte para:
--   1) Etiquetar campañas (columna nueva + lista de etiquetas disponibles).
--   2) El nuevo módulo "Agenda semanal directores", alimentado por cualquier
--      campaña etiquetada como "Agenda semanal directores".
-- ============================================================================

-- 1) Columna de etiqueta en campanas.
alter table public.campanas
  add column if not exists etiqueta text;

-- 2) Lista de etiquetas disponibles, editable desde la app. updateConfiguracion()
--    usa UPDATE (no upsert), así que esta fila debe existir de antemano.
insert into public.configuracion (clave, valor)
values ('etiquetas_campana', '{"lista":["Agenda semanal directores"]}'::jsonb)
on conflict (clave) do nothing;

-- 3) Política de RLS para esta clave nueva (la tabla configuracion usa una política de UPDATE
--    por cada clave específica — ver migracion_sesion_turno_apoyo.sql para el mismo patrón, y la
--    explicación de por qué es indispensable: sin ella, el guardado se descarta en silencio, sin
--    ningún error visible). Puede editarla cualquier rol que también pueda crear campañas.
drop policy if exists configuracion_update_etiquetas on public.configuracion;
create policy configuracion_update_etiquetas
on public.configuracion
for update
using (clave = 'etiquetas_campana' and rol_actual() = ANY (ARRAY['Administrador','Team leader','Supervisor']))
with check (clave = 'etiquetas_campana' and rol_actual() = ANY (ARRAY['Administrador','Team leader','Supervisor']));

-- ============================================================================
-- Verificación después de correr este archivo:
--
--   select column_name from information_schema.columns
--   where table_name = 'campanas' and column_name = 'etiqueta';
--   -- Debe devolver 1 fila.
--
--   select clave, valor from public.configuracion where clave = 'etiquetas_campana';
--   -- Debe devolver la lista con "Agenda semanal directores".
--
--   select policyname from pg_policies where tablename = 'configuracion' and policyname = 'configuracion_update_etiquetas';
--   -- Debe devolver 1 fila.
-- ============================================================================
