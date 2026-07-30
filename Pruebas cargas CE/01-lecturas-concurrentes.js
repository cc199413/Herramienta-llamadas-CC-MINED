// ============================================================================
// 01-lecturas-concurrentes.js
// ----------------------------------------------------------------------------
// Simula ~50 agentes consultando datos al mismo tiempo (ej. abriendo la
// Bandeja de llamadas, que lee centros_escolares/campañas/registros) —
// ajustado a tu escala real: 50 agentes en simultáneo.
//
// Uso:
//   k6 run -e SUPABASE_URL=https://tu-proyecto.supabase.co \
//           -e SUPABASE_ANON_KEY=sb_publishable_... \
//           -e ACCESS_TOKEN=el-token-de-un-usuario-ya-logeado \
//           01-lecturas-concurrentes.js
//
// Nota: esto valida la carga sobre la API REST (Postgres/PostgREST), que es
// lo que tu app realmente usa hoy. No confundir con el límite de "Realtime
// concurrent connections" de Supabase (200 en Free, 500 en Pro) — ese límite
// es para conexiones por websocket (actualizaciones en vivo), que tu app
// todavía no usa, así que no aplica aquí.
// ============================================================================
import http from 'k6/http';
import { check, sleep } from 'k6';

const SUPABASE_URL = __ENV.SUPABASE_URL;
const ANON_KEY = __ENV.SUPABASE_ANON_KEY;
const TOKEN = __ENV.ACCESS_TOKEN; // token de un usuario ya autenticado (ver README)
const AGENTES = parseInt(__ENV.AGENTES || '50');

export const options = {
  scenarios: {
    lecturas: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: AGENTES },  // sube a 50 "agentes" leyendo a la vez
        { duration: '5m', target: AGENTES },   // se mantiene 5 minutos (prueba corta representativa)
        { duration: '15s', target: 0 },        // baja
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1500'], // 95% de las respuestas deben tardar menos de 1.5s
    http_req_failed: ['rate<0.05'],    // menos de 5% de errores
  },
};

export default function () {
  const headers = { apikey: ANON_KEY, Authorization: `Bearer ${TOKEN}` };

  const res1 = http.get(`${SUPABASE_URL}/rest/v1/centros_escolares?select=*&limit=50`, { headers });
  check(res1, { 'centros_escolares: status 200': (r) => r.status === 200 });

  const res2 = http.get(`${SUPABASE_URL}/rest/v1/campanas?select=*`, { headers });
  check(res2, { 'campanas: status 200': (r) => r.status === 200 });

  const res3 = http.get(`${SUPABASE_URL}/rest/v1/registros?select=*&limit=100`, { headers });
  check(res3, { 'registros: status 200': (r) => r.status === 200 });

  sleep(1 + Math.random()); // pausa entre "refrescos", como haría una persona real
}
