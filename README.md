# Plataforma para gestión de llamadas · MINED

## Ambientes

| Ambiente | Proyecto Supabase | Project ref | Archivo de la app |
|---|---|---|---|
| **Producción** (uso real del call center) | Operacion CC MINED | `lrjkphiprqbfvhdqjijh` | `registro-actividades-ce.html` (raíz del repo) |
| **Staging** (pruebas antes de desplegar) | Prueba - Operacion CC MINED | `enfkzbdjxxooiolstjyn` | `staging/registro-actividades-ce.html` |

URLs publicadas (GitHub Pages):
- Producción: `https://cc199413.github.io/Herramienta-llamadas-CC-MINED/registro-actividades-ce.html`
- Staging: `https://cc199413.github.io/Herramienta-llamadas-CC-MINED/staging/registro-actividades-ce.html`

La app detecta sola en cuál ambiente está corriendo (comparando `SUPABASE_URL` contra el project ref de producción) y muestra un distintivo visual **"🧪 ENTORNO DE PRUEBA"** en la parte superior cuando NO es producción — no requiere configuración manual.

Ambos ambientes son proyectos de Supabase completamente independientes (base de datos, Auth y Edge Functions separadas) — se pueden usar en simultáneo sin ningún riesgo para producción.

### Cómo reconstruir un ambiente desde cero (útil si algún día hay que rehacer staging, o recuperarse de un desastre en producción)

Corre estos archivos SQL, **en este orden**, en el SQL Editor (o vía `psql`) del proyecto de Supabase:

1. `schema.sql` — estructura de `centros_escolares` y su trigger de `sincronizado_en`.
2. El resto de tablas operativas (`profiles`, `campanas`, `campana_agentes`, `registros`, `tiempos_diarios`, `configuracion`, `bitacora`) y sus políticas RLS — exporta la estructura actual desde el proyecto de producción con `pg_dump --schema-only --no-owner --no-privileges --schema=public` (ver connection string en el Dashboard → Connect → **Session pooler**; el modo de conexión directa suele fallar por resolución DNS/IPv6 desde redes de oficina).
3. **`migracion_permisos.sql`** — sin este paso, todas las consultas fallan con "permission denied" o, en el login de la app, con el mensaje engañoso "No se encontró tu perfil", aunque el esquema y las políticas RLS estén perfectos. Supabase revoca los privilegios por defecto en cualquier proyecto nuevo.
4. Cargar el catálogo de `centros_escolares` (ver sección de sincronización más abajo, o una copia puntual con `\copy` desde producción para un ambiente de prueba).
5. Desplegar las Edge Functions (`supabase/functions/crear-usuario`, `supabase/functions/verificar-correo`) con `--no-verify-jwt`, apuntando al proyecto correcto con `--project-ref` (no hace falta `supabase link` — se puede pasar el ref directo en cada comando para no arriesgarse a desplegar al proyecto equivocado).

---

# Sincronización: Google Sheet de Centros Escolares → Supabase

Este paquete copia el catálogo de Centros Escolares desde tu Google Sheet (fuente
de verdad) hacia una tabla `centros_escolares` en Supabase (copia rápida de
solo lectura para la app). Los **resultados de las llamadas seguirán viviendo
en Supabase**, en tablas aparte — este paso solo resuelve el catálogo de centros.

## 1. Crear la tabla en Supabase

1. Entra a tu proyecto en [supabase.com](https://supabase.com) (o créalo si no existe).
2. Ve a **SQL Editor** → **New query**.
3. Pega el contenido de `supabase/schema.sql` y ejecútalo (▶ Run).
4. Verifica en **Table Editor** que apareció la tabla `centros_escolares`.

Ya quedó probado (lo validé contra un Postgres real antes de entregarlo):
inserción, actualización por código, disparo automático de
`sincronizado_en`, y que dos centros no pueden compartir el mismo código.

## 2. Crear la cuenta de servicio de Google (para leer el Sheet)

1. Ve a [Google Cloud Console](https://console.cloud.google.com/) → crea o
   elige un proyecto.
2. **APIs & Services → Library** → busca "Google Sheets API" → **Enable**.
3. **APIs & Services → Credentials** → **Create Credentials** → **Service account**.
   Dale un nombre (ej. `sync-centros-escolares`) y termina el asistente sin
   asignar roles adicionales.
4. Entra a la cuenta de servicio creada → pestaña **Keys** → **Add Key** →
   **Create new key** → tipo **JSON**. Se descarga un archivo `.json`.
5. Abre tu Google Sheet → botón **Compartir** → agrega el correo de la cuenta
   de servicio (algo como `sync-centros-escolares@tu-proyecto.iam.gserviceaccount.com`)
   con permiso de **Lector**. Sin este paso, el script no podrá leer la hoja.

## 3. Configurar las variables de entorno

```bash
cp .env.example .env
```

Completa en `.env`:

- `GOOGLE_SERVICE_ACCOUNT_KEY`: abre el `.json` descargado en el paso 2.4 y
  pega **todo su contenido en una sola línea** (puedes usar
  `node -e "console.log(JSON.stringify(require('./tu-archivo.json')))"` para
  generar esa línea automáticamente).
- `GOOGLE_SHEET_ID`: la parte de la URL de tu Sheet entre `/d/` y `/edit`.
- `GOOGLE_SHEET_RANGE`: nombre de la pestaña y rango, ej. `Centros!A1:Z`.
- `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`: en tu proyecto de Supabase,
  **Project Settings → API**. Usa la **service_role key**, no la `anon` key
  (la service_role tiene permisos de escritura y nunca debe usarse en el
  navegador — solo aquí, en un script de servidor).

## 4. Instalar dependencias y ejecutar

```bash
npm install
npm run sync
```

Verás un resumen como:

```
Leyendo Google Sheet...
Filas leídas: 5842 · válidas: 5810 · omitidas (sin código/nombre): 32
Lote 1: 500 centro(s) sincronizado(s).
...
Listo. 5810 centro(s) actualizados en Supabase.
```

## 5. Cómo detecta las columnas

El script no depende de que las cabeceras del Sheet coincidan exactamente:
ignora tildes/mayúsculas y reconoce variantes razonables, igual que el
importador de CSV/Excel que ya tenías en la app (Código, Nombre, Departamento,
Municipio, Distrito, Latitud/Longitud, Teléfono 1/2 o una sola columna con
varios números separados por `/`, `,` o `;`, Programa, Modernización, Fase,
Centro Control).

**Nota sobre ubicación geográfica**: si tu Sheet aún no tiene columnas de
Latitud/Longitud, el script sincroniza todo lo demás y deja esos campos en
`null` — no bloquea la sincronización. Cuando quieras, podemos agregar un
paso de geocodificación (a partir de dirección/municipio) para completarlos.

## 6. Automatizar (opcional)

Para que corra solo, sin que alguien lo ejecute a mano:

- **Más simple**: una tarea programada (cron) en cualquier servidor/PC que
  se mantenga encendido, ej. `0 2 * * * cd /ruta/al/proyecto && npm run sync`
  (todas las noches a las 2am).
- **Sin servidor propio**: una GitHub Action con `schedule`, guardando las
  variables de entorno como *secrets* del repositorio.
- **Todo dentro de Supabase**: una Edge Function programada con `pg_cron`,
  si prefieres no depender de infraestructura externa.

Puedo ayudarte a montar cualquiera de estas tres opciones cuando quieras.

## Importante: quién escribe qué

- **Google Sheet → Supabase**: una sola vía. El Sheet manda; nunca escribas
  directamente en la tabla `centros_escolares` desde la app o a mano, porque
  la próxima sincronización sobrescribe esos cambios.
- **Resultados de llamadas**: van en tablas aparte (por ejemplo `registros`,
  `actividades`), que la app sí puede escribir directamente — ese es el
  siguiente paso que definiremos.
