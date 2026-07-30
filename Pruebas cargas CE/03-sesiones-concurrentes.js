// ============================================================================
// 03-sesiones-concurrentes.js
// ----------------------------------------------------------------------------
// Simula que muchas personas inician sesión al mismo tiempo (ej. todo el
// equipo entrando a las 8:00 AM en punto).
//
// Usa una lista de cuentas de PRUEBA reales (no tu cuenta de Administrador
// real) — ver README para cómo crear varias cuentas de prueba rápido.
//
// Uso:
//   k6 run -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... \
//           -e TEST_PASSWORD=Prueba123! \
//           03-sesiones-concurrentes.js
// ============================================================================
import http from 'k6/http';
import { check, sleep } from 'k6';

const SUPABASE_URL = __ENV.SUPABASE_URL;
const ANON_KEY = __ENV.SUPABASE_ANON_KEY;
const PASSWORD = __ENV.TEST_PASSWORD;

// Genera correos de prueba qa1@..., qa2@..., etc. Ajusta el dominio/prefijo
// a como hayas nombrado tus cuentas de prueba.
const DOMINIO = __ENV.TEST_DOMAIN || 'goes.gob.sv';
const PREFIJO = __ENV.TEST_PREFIX || 'qa';
const CANTIDAD_CUENTAS = parseInt(__ENV.TEST_ACCOUNTS || '50');

export const options = {
  scenarios: {
    logins: {
      executor: 'per-vu-iterations',
      vus: CANTIDAD_CUENTAS,
      iterations: 1, // cada "persona" inicia sesión una sola vez, todos a la vez
      maxDuration: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  const email = `${PREFIJO}${__VU}@${DOMINIO}`;
  const payload = JSON.stringify({ email, password: PASSWORD });
  const res = http.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, payload, {
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
  });
  check(res, {
    'login exitoso (200)': (r) => r.status === 200,
  });
  sleep(0.5);
}
