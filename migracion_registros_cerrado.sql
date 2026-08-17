-- ============================================================================
-- migracion_registros_cerrado.sql
-- ----------------------------------------------------------------------------
-- Agrega la columna "cerrado" a la tabla registros. Antes, la única forma de
-- saber que un centro ya no debía seguir en la bandeja activa era que su
-- estado fuera EXACTAMENTE el texto "Cerrado por no contacto". Eso causaba
-- que, al cerrar un centro porque TODOS sus teléfonos quedaron marcados como
-- equivocados, el sistema tuviera que sobrescribir el estado real
-- ("Número equivocado") con "Cerrado por no contacto" para poder sacarlo de
-- la bandeja — perdiendo la información real de por qué se cerró.
--
-- Con esta columna, el cierre de la bandeja ya no depende del texto del
-- estado: un registro puede quedar cerrado (cerrado = true) conservando su
-- estado real ("Número equivocado"), y separado de los que de verdad
-- agotaron el máximo de intentos ("Cerrado por no contacto").
-- ============================================================================

alter table public.registros
  add column if not exists cerrado boolean not null default false;

-- Respaldo: todo registro que ya estaba en "Cerrado por no contacto" antes de
-- este cambio, marcarlo también con cerrado = true (coherencia con datos ya
-- existentes; la app de todas formas reconoce ambos casos gracias a la
-- función estaCerrado()).
update public.registros
set cerrado = true
where estado = 'Cerrado por no contacto' and cerrado is distinct from true;

-- ============================================================================
-- Verificación después de correr este archivo:
--
--   select column_name from information_schema.columns
--   where table_name = 'registros' and column_name = 'cerrado';
--   -- Debe devolver 1 fila.
--
--   select count(*) from public.registros where estado = 'Cerrado por no contacto' and cerrado = false;
--   -- Debe devolver 0 (todos los "Cerrado por no contacto" ya existentes quedaron con cerrado = true).
-- ============================================================================
