// ============================================================================
// 05-jornada-completa.js
// ----------------------------------------------------------------------------
// Simula tu escenario real: ~50 agentes trabajando a la vez, cada uno
// repitiendo el ciclo real de trabajo (revisar su bandeja → "atender" un
// centro durante un rato → guardar el resultado → esperar antes del
// siguiente) durante un período sostenido — no solo una ráfaga corta.
//
// Por defecto corre 15 minutos (para poder validar antes de la jornada real
// sin ocupar toda una tarde). Para una prueba de resistencia real de las
// 16 horas completas (6:00 AM a 10:00 PM), cambia SOAK_MINUTOS a 960 y
// déjalo corriendo — ver nota al final de este archivo.
//
// Uso (prueba corta representativa, 15 min):
//   k6 run -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e ACCESS_TOKEN=... \
//           -e CAMPANA_ID=tu-campana-de-prueba \
//           05-jornada-completa.js
//
// Uso (prueba larga, ej. 2 horas, para tener más confianza antes de ir a
// producción):
//   k6 run ... -e SOAK_MINUTOS=120 05-jornada-completa.js
// ============================================================================
import http from 'k6/http';
import { check, sleep } from 'k6';

const SUPABASE_URL = __ENV.SUPABASE_URL;
const ANON_KEY = __ENV.SUPABASE_ANON_KEY;
const TOKEN = __ENV.ACCESS_TOKEN;
const CAMPANA_ID = __ENV.CAMPANA_ID;
const AGENTES = parseInt(__ENV.AGENTES || '50');
const SOAK_MINUTOS = parseInt(__ENV.SOAK_MINUTOS || '15');

export const options = {
  scenarios: {
    jornada: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: AGENTES },              // los agentes van "llegando" en el primer minuto
        { duration: `${SOAK_MINUTOS}m`, target: AGENTES }, // se mantiene sostenido
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  const headersLectura = { apikey: ANON_KEY, Authorization: `Bearer ${TOKEN}` };

  // 1. Revisar la bandeja (como cuando un agente entra a ver qué le toca)
  const bandeja = http.get(`${SUPABASE_URL}/rest/v1/registros?select=*&campana_id=eq.${CAMPANA_ID}&limit=50`, { headers: headersLectura });
  check(bandeja, { 'bandeja: status 200': (r) => r.status === 200 });

  // 2. "Atender" el centro: simula el tiempo real que un agente pasa al
  //    teléfono antes de guardar el resultado (entre 20s y 90s).
  sleep(20 + Math.random() * 70);

  // 3. Guardar el resultado de la llamada
  const codigoFalso = 'PRUEBA-JORNADA-' + Math.floor(Math.random() * 1000000);
  const payload = JSON.stringify({
    campana_id: CAMPANA_ID,
    codigo_centro: codigoFalso,
    estado: 'Contactado',
    actividades: [{ q1: 'Prueba de jornada completa' }],
  });
  const guardar = http.post(`${SUPABASE_URL}/rest/v1/registros`, payload, {
    headers: { ...headersLectura, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
  });
  check(guardar, { 'registro guardado (200/201)': (r) => r.status === 200 || r.status === 201 });

  // 4. Pausa antes de la siguiente llamada (entre 5s y 20s — cambiar de
  //    pantalla, anotar algo, etc.)
  sleep(5 + Math.random() * 15);
}

// ----------------------------------------------------------------------------
// Sobre correr esto las 16 horas completas (SOAK_MINUTOS=960):
//   - Déjalo corriendo en una computadora que no vayas a apagar ni suspender
//     (una laptop que se bloquea/duerme puede cortar la prueba a medias).
//   - Con "nohup k6 run ... > resultado.log 2>&1 &" en Mac/Linux, o el
//     Programador de tareas de Windows, puedes dejarlo corriendo sin
//     mantener la ventana abierta.
//   - Esto SÍ crea muchos registros de prueba (uno cada ~35-45s por cada
//     uno de los 50 agentes simulados, durante toda la duración) — bórralos
//     después buscando por el prefijo "PRUEBA-JORNADA-" en la tabla
//     registros, y borra también la campaña de prueba si ya no la necesitas.
// ----------------------------------------------------------------------------
