// ============================================================================
// 04-fuerza-bruta.js
// ----------------------------------------------------------------------------
// Qué hace: envía muchos intentos de login seguidos, con la contraseña
// INCORRECTA a propósito, contra UNA cuenta de prueba. El objetivo no es
// adivinar ninguna contraseña real — es confirmar que, a partir de cierta
// cantidad de intentos fallidos en poco tiempo, Supabase empieza a responder
// "429 Too Many Requests" (su límite de intentos ya viene activado por
// defecto). Si en tu prueba NUNCA ves un 429 después de decenas de intentos,
// vale la pena revisar la configuración de "Rate Limits" en Supabase
// (Authentication → Rate Limits).
//
// Usa SIEMPRE una cuenta de PRUEBA para esto, nunca tu cuenta real de
// Administrador (para no arriesgarte a quedar bloqueado de tu propia cuenta
// si Supabase también limita por cuenta, no solo por IP).
//
// Uso:
//   k6 run -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... \
//           -e TEST_EMAIL=cuenta.de.prueba@goes.gob.sv \
//           04-fuerza-bruta.js
// ============================================================================
import http from 'k6/http';
import { sleep } from 'k6';
import { Counter } from 'k6/metrics';

const SUPABASE_URL = __ENV.SUPABASE_URL;
const ANON_KEY = __ENV.SUPABASE_ANON_KEY;
const EMAIL = __ENV.TEST_EMAIL;

const contador429 = new Counter('respuestas_429_limitadas');
const contador400 = new Counter('respuestas_400_credenciales_invalidas');

export const options = {
  scenarios: {
    fuerza_bruta: {
      executor: 'constant-arrival-rate',
      rate: 10,              // 10 intentos por segundo...
      timeUnit: '1s',
      duration: '20s',        // ...durante 20 segundos (≈200 intentos en total)
      preAllocatedVUs: 20,
      maxVUs: 40,
    },
  },
};

export default function () {
  const payload = JSON.stringify({ email: EMAIL, password: 'intento-incorrecto-' + __ITER });
  const res = http.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, payload, {
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
  });
  if (res.status === 429) contador429.add(1);
  if (res.status === 400) contador400.add(1);
  sleep(0.05);
}

// Al final, revisa en el resumen de k6 las métricas "respuestas_429_limitadas"
// y "respuestas_400_credenciales_invalidas": si la primera es mayor a 0,
// confirma que el límite de intentos de Supabase sí se activó.
