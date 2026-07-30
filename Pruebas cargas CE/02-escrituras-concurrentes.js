// ============================================================================
// 02-escrituras-concurrentes.js
// ----------------------------------------------------------------------------
// Simula muchos agentes registrando resultados de llamadas al mismo tiempo
// (ej. varios marcando "Contactado" en el mismo minuto).
//
// IMPORTANTE: esto SÍ crea filas reales en tu tabla "registros". Usa una
// campaña de prueba dedicada (no una real) y bórrala después si quieres.
//
// Uso:
//   k6 run -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e ACCESS_TOKEN=... \
//           -e CAMPANA_ID=el-id-de-tu-campana-de-prueba \
//           02-escrituras-concurrentes.js
// ============================================================================
import http from 'k6/http';
import { check, sleep } from 'k6';

const SUPABASE_URL = __ENV.SUPABASE_URL;
const ANON_KEY = __ENV.SUPABASE_ANON_KEY;
const TOKEN = __ENV.ACCESS_TOKEN;
const CAMPANA_ID = __ENV.CAMPANA_ID;

export const options = {
  scenarios: {
    escrituras: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 50 }, // 50 "agentes" guardando resultados a la vez
        { duration: '5m', target: 50 },
        { duration: '15s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  const headers = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };
  const codigoFalso = 'PRUEBA-' + Math.floor(Math.random() * 100000);
  const payload = JSON.stringify({
    campana_id: CAMPANA_ID,
    codigo_centro: codigoFalso,
    estado: 'Contactado',
    actividades: [{ q1: 'Prueba de carga' }],
  });

  const res = http.post(`${SUPABASE_URL}/rest/v1/registros`, payload, { headers });
  check(res, { 'registro guardado (200/201)': (r) => r.status === 200 || r.status === 201 });

  sleep(1 + Math.random() * 2);
}
