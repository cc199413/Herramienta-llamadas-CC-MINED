# Pruebas de carga y de resiliencia — Actividades de Centros Educativos

Estos scripts usan **k6** (herramienta gratuita y de código abierto, de Grafana,
diseñada exactamente para esto) para simular muchas conexiones simultáneas
contra tu proyecto de Supabase, sin necesitar abrir cientos de pestañas del
navegador a mano. Ya están ajustados a tu escala real: **~50 agentes
simultáneos, de 6:00 AM a 10:00 PM (16 horas)**.

Probé el mecanismo de los 5 scripts (incluyendo a escala de 50 usuarios
virtuales) contra un servidor simulado antes de entregártelos. Lo que no pude
probar es contra tu proyecto REAL (no tengo acceso a él desde mi entorno), así
que la primera corrida real conviene hacerla con cuidado y en un horario de
bajo uso.

## Un detalle importante sobre "conexiones concurrentes"

Cuando busques en la documentación de Supabase sobre límites de conexiones
concurrentes (200 en el plan Free, 500 en Pro), ese número es específicamente
para **Realtime** (conexiones por websocket, para actualizaciones en vivo) —
tu app **no usa eso todavía** (no tiene suscripciones en tiempo real), así que
ese límite no aplica a tu caso. Lo que sí importa para ti es qué tan bien
responde la **API normal (REST/Postgres)** bajo ~50 peticiones a la vez,
sostenido durante horas — que es justo lo que estos scripts miden. Dicho
esto, 50 personas usando periódicamente un formulario (no 50 personas
transmitiendo video o chateando en vivo) es una carga bastante ligera para
cualquier base de datos moderna — no deberías tener problemas de capacidad
con un plan Pro estándar, pero vale la pena confirmarlo con una prueba real.

## ⚠️ Antes de empezar — léelo con calma

1. **Nunca lo corras contra producción "en caliente"**, mientras agentes reales
   estén trabajando. Hazlo en un horario donde nadie más esté usando la
   herramienta, o mejor aún, crea un **proyecto de Supabase aparte para
   pruebas** (mismo esquema, datos de mentira) si quieres repetir esto
   seguido.
2. **Las pruebas de escritura y de fuerza bruta generan datos y tráfico
   reales** en tu base — usa siempre una campaña de prueba dedicada y cuentas
   de prueba, nunca tu cuenta de Administrador real ni una campaña en uso.
3. Revisa el **plan de Supabase que tienes contratado**: cada prueba consume
   parte de tu cuota de solicitudes/cómputo del mes. No hace falta correr las
   pruebas largas (minutos u horas) más de una o dos veces.

## 1. Instalar k6 (una sola vez)

En Windows, la forma más simple es con Chocolatey (si no lo tienes, puedes
instalar k6 descargando el instalador directo desde
[k6.io/docs/get-started/installation](https://k6.io/docs/get-started/installation/)):
```
choco install k6
```
Confirma que quedó instalado:
```
k6 version
```

## 2. Conseguir los datos que los scripts necesitan

- **SUPABASE_URL**: tu Project URL (`https://lrjkphiprqbfvhdqjijh.supabase.co`).
- **SUPABASE_ANON_KEY**: tu Publishable key (`sb_publishable_...`).
- **ACCESS_TOKEN** (para los scripts de lectura/escritura): el token de una
  sesión ya iniciada. La forma más fácil de conseguirlo: abre la app en el
  navegador, inicia sesión con una cuenta de prueba, abre las Herramientas de
  Desarrollador (F12) → pestaña **Application/Aplicación → Local Storage** →
  busca una entrada que empiece con `sb-` — ahí dentro (en formato JSON) está
  el `access_token`. Cópialo tal cual.

## 3. Crear varias cuentas de prueba rápido (para las pruebas 3 y 4)

Para no crear 50 cuentas a mano, usa el mismo script de sincronización que ya
tienes, o más simple: entra a **Administración → ＋ Crear usuario** y crea
unas 20-50 cuentas con un patrón de correo predecible, por ejemplo
`qa1@goes.gob.sv`, `qa2@goes.gob.sv`, ... todas con la misma contraseña de
prueba. Avísame si prefieres que te arme un script que las cree
automáticamente en vez de hacerlo a mano.

## 4. Correr cada prueba

### Prueba 1 — Lecturas concurrentes
Simula 50 agentes consultando datos (centros, campañas, registros) al mismo
tiempo durante ~5 minutos.
```
k6 run -e SUPABASE_URL=https://tu-proyecto.supabase.co ^
       -e SUPABASE_ANON_KEY=sb_publishable_... ^
       -e ACCESS_TOKEN=el-token-que-copiaste ^
       01-lecturas-concurrentes.js
```
(en PowerShell, usa `` ` `` en vez de `^` para continuar la línea, o escribe
todo en una sola línea).

### Prueba 2 — Escrituras concurrentes
Simula 50 agentes guardando resultados de llamada al mismo tiempo. **Usa el
`id` de una campaña de PRUEBA** (créala primero, y saca su id desde
**Table Editor → campanas** en Supabase).
```
k6 run -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e ACCESS_TOKEN=... ^
       -e CAMPANA_ID=el-id-de-tu-campana-de-prueba ^
       02-escrituras-concurrentes.js
```

### Prueba 3 — Sesiones concurrentes (logins simultáneos)
Simula que 50 personas inician sesión en el mismo instante — el peor caso
posible (en la realidad la gente no entra exactamente al mismo segundo, pero
si esto aguanta, aguanta cualquier llegada más escalonada).
```
k6 run -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... ^
       -e TEST_PASSWORD=TuContraseñaDePrueba ^
       -e TEST_PREFIX=qa -e TEST_DOMAIN=goes.gob.sv -e TEST_ACCOUNTS=50 ^
       03-sesiones-concurrentes.js
```
(esto asume que tus cuentas de prueba se llaman `qa1@goes.gob.sv`,
`qa2@goes.gob.sv`, etc. — ajusta `TEST_PREFIX`/`TEST_DOMAIN` a como las hayas
nombrado tú).

### Prueba 4 — Resiliencia a fuerza bruta
Envía ~200 intentos de login fallidos, seguidos, contra UNA cuenta de prueba,
para confirmar que Supabase empieza a bloquear (429) después de cierta
cantidad de intentos.
```
k6 run -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... ^
       -e TEST_EMAIL=cuenta.de.prueba@goes.gob.sv ^
       04-fuerza-bruta.js
```

### Prueba 5 — Jornada completa simulada (la más representativa de tu uso real)
Simula el ciclo real de trabajo de 50 agentes — revisar bandeja, "atender" un
centro (con pausas realistas de 20-90 segundos), guardar el resultado,
esperar, y repetir — sostenido en el tiempo, no solo una ráfaga corta.

Por defecto corre 15 minutos, como prueba rápida representativa:
```
k6 run -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e ACCESS_TOKEN=... ^
       -e CAMPANA_ID=tu-campana-de-prueba ^
       05-jornada-completa.js
```

Si quieres más confianza antes de ir a producción, puedes extenderla — por
ejemplo, 2 horas:
```
k6 run ... -e SOAK_MINUTOS=120 05-jornada-completa.js
```
Para simular las 16 horas completas (6:00 AM a 10:00 PM), usa
`SOAK_MINUTOS=960` y déjalo corriendo en una computadora que no se vaya a
apagar/suspender durante ese tiempo (puedes usar `nohup ... &` en Mac/Linux,
o el Programador de tareas en Windows, para que siga corriendo sin mantener
la ventana abierta). Esto genera muchos registros de prueba — el mismo
script explica al final cómo identificarlos y borrarlos después.

## 5. Cómo leer los resultados

Al terminar cada prueba, k6 imprime un resumen. Lo más importante:

- **`http_req_failed`**: porcentaje de peticiones que fallaron. Si sube mucho
  (más del 5-10%), significa que el sistema empezó a rechazar peticiones bajo
  esa carga.
- **`http_req_duration` (p95)**: el 95% de las peticiones tardaron menos de
  este tiempo. Si supera 2-3 segundos, la experiencia empieza a sentirse
  lenta para quien esté usando la app en ese momento.
- **En la prueba 4 específicamente**: busca las líneas
  `respuestas_400_credenciales_invalidas` y `respuestas_429_limitadas`. Si la
  segunda queda en 0 después de muchos intentos, es una señal de que el
  límite de intentos de Supabase no está activo — revisa
  **Authentication → Rate Limits** en tu proyecto.

## 6. Después de probar

- Borra las filas de prueba que hayas creado (`registros` con
  `codigo_centro` empezando en "PRUEBA-" o "PRUEBA-JORNADA-", la campaña de
  prueba, las cuentas `qa1@...`, etc.) para no dejar basura en tu base real.
- Si algún resultado te preocupa (muchos errores, tiempos muy altos), avísame
  y lo revisamos juntos — puede ser una señal de que conviene subir de plan
  en Supabase, o ajustar algo en el código.

