-- ============================================================================
-- migracion_trazabilidad_y_sync.sql
-- ----------------------------------------------------------------------------
-- Resuelve el caso real: un centro puede pasar de Agente A (asignación
-- inicial, nunca llegó a llamar) a Agente B (hizo el primer intento, "No
-- contestó") a Agente C (quien finalmente logró contacto) — y cada uno de
-- esos tres datos debe conservarse por separado, sin importar cuántas veces
-- se reasigne el centro después.
--
-- También habilita Realtime sobre "registros", para que la Bandeja de cada
-- agente se mantenga sincronizada en vivo — antes, si alguien reasignaba un
-- centro mientras el agente ya tenía la sesión abierta, su pantalla seguía
-- mostrándolo como "suyo" hasta que refrescara manualmente, y al intentar
-- guardar la base de datos rechazaba el cambio (correctamente) porque ya no
-- le pertenecía — pareciendo un error, cuando en realidad solo hacía falta
-- refrescar los datos.
-- ============================================================================

-- 1) Columnas de trazabilidad en registros (si ya existían, esto no hace nada).
alter table public.registros
  add column if not exists agente_original_id uuid references public.profiles(id),
  add column if not exists primer_intento_agente_id uuid references public.profiles(id),
  add column if not exists primer_intento_estado text,
  add column if not exists primer_intento_en timestamptz;

-- 2) Asignación inicial de cada centro al crear la campaña, congelada para siempre
--    (independiente de "registros.agente_id", que sí cambia con cada reasignación).
alter table public.campanas
  add column if not exists asignacion_inicial jsonb;

-- Respaldo: para campañas que ya existían antes de esta migración, no hay forma
-- de recuperar la asignación real del momento de creación — se usa la
-- asignación actual como mejor aproximación disponible.
update public.campanas
set asignacion_inicial = (
  select jsonb_object_agg(r.codigo_centro, r.agente_id)
  from public.registros r
  where r.campana_id = campanas.id and r.agente_id is not null
)
where asignacion_inicial is null;

-- 3) Habilita Realtime sobre registros, para el refresco en vivo de la Bandeja.
alter publication supabase_realtime add table public.registros;

-- ============================================================================
-- Verificación después de correr este archivo:
--
--   select column_name from information_schema.columns
--   where table_name = 'registros'
--     and column_name in ('agente_original_id','primer_intento_agente_id','primer_intento_estado','primer_intento_en');
--   -- Debe devolver 4 filas.
--
--   select column_name from information_schema.columns
--   where table_name = 'campanas' and column_name = 'asignacion_inicial';
--   -- Debe devolver 1 fila.
--
--   select tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename='registros';
--   -- Debe devolver 1 fila.
-- ============================================================================
