#!/usr/bin/env node
/**
 * sync-centros-escolares.js
 * ---------------------------------------------------------------------------
 * Lee el catálogo de Centros Escolares desde un Google Sheet (fuente de verdad)
 * y actualiza (upsert) la tabla `centros_escolares` en Supabase (copia de solo
 * lectura para la app). Pensado para correr manualmente o por cron.
 *
 * Uso:
 *   node scripts/sync-centros-escolares.js
 *
 * Variables de entorno requeridas (ver .env.example):
 *   GOOGLE_SERVICE_ACCOUNT_KEY   JSON completo de la cuenta de servicio (una línea)
 *   GOOGLE_SHEET_ID              ID de la hoja (de la URL de Google Sheets)
 *   GOOGLE_SHEET_RANGE           Ej: "Centros!A1:Z"  (opcional, default abajo)
 *   SUPABASE_URL                 URL del proyecto Supabase
 *   SUPABASE_SERVICE_ROLE_KEY    Service role key (NUNCA la anon key aquí)
 * ---------------------------------------------------------------------------
 */
require('dotenv').config();
const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');

const RANGE_DEFAULT = 'Centros!A1:Z';

/* ---------------------------------------------------------------------- */
/* Normalización de encabezados: minúsculas, sin tildes, sin espacios/símbolos */
/* (misma lógica que ya usa el prototipo para la carga de CSV/Excel)        */
/* ---------------------------------------------------------------------- */
function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function truthy(v) {
  return /^(si|s[ií]|true|verdadero|1|x|yes)$/i.test(String(v ?? '').trim());
}

function toNumberOrNull(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Convierte una fila (objeto {header: valor}) del Sheet a una fila de centros_escolares */
function rowToCentro(rawRow, filaOrigen) {
  const m = {};
  Object.keys(rawRow).forEach(k => { m[norm(k)] = rawRow[k]; });

  const get = (...regexes) => {
    for (const key of Object.keys(m)) {
      if (regexes.some(rx => rx.test(key))) return m[key];
    }
    return '';
  };

  // teléfonos: columnas separadas (Telefono 1, Telefono 2...) o una sola con separadores
  const telefonos = [];
  Object.keys(m).forEach(key => {
    if (/(telefono|tel\d|fono|movil|celular|contacto)/.test(key)) {
      String(m[key]).split(/[\/,;|]+/).forEach(t => {
        t = t.trim();
        if (t) telefonos.push(t);
      });
    }
  });

  const codigo = String(get(/^codigo/, /codigo/, /^code/) || '').trim();
  const nombre = String(get(/nombre/, /^centroeducativo/, /^centroescolar/, /^centro/, /escuela/) || '').trim();

  return {
    codigo,
    nombre,
    departamento: String(get(/departamento/, /depto/) || '').trim() || null,
    municipio: String(get(/municipio/) || '').trim() || null,
    distrito: String(get(/distrito/) || '').trim() || null,
    direccion: String(get(/direccion/) || '').trim() || null,
    latitud: toNumberOrNull(get(/^lat/, /latitud/)),
    longitud: toNumberOrNull(get(/^lon/, /longitud/, /^lng/)),
    telefonos,
    programa: String(get(/programa/) || '').trim() || null,
    modernizacion: truthy(get(/moderniz/)),
    fase: String(get(/fase/) || '').trim() || null,
    control: truthy(get(/control/)),
    fila_origen_sheet: filaOrigen,
  };
}

/* ---------------------------------------------------------------------- */
/* Lectura del Google Sheet vía cuenta de servicio                         */
/* ---------------------------------------------------------------------- */
async function leerSheet() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_KEY en el entorno.');
  const credentials = JSON.parse(keyJson);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('Falta GOOGLE_SHEET_ID en el entorno.');
  const range = process.env.GOOGLE_SHEET_RANGE || RANGE_DEFAULT;

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const values = res.data.values || [];
  if (values.length < 2) return []; // solo encabezados o vacío

  const headers = values[0];
  return values.slice(1).map((row, i) => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = row[idx] ?? ''; });
    return rowToCentro(obj, i + 2); // +2: fila 1 es encabezado, base 1
  });
}

/* ---------------------------------------------------------------------- */
/* Escritura (upsert) en Supabase                                          */
/* ---------------------------------------------------------------------- */
async function sincronizar() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  console.log('Leyendo Google Sheet...');
  const filas = await leerSheet();

  const validas = filas.filter(f => f.codigo && f.nombre);
  const omitidas = filas.length - validas.length;

  console.log(`Filas leídas: ${filas.length} · válidas: ${validas.length} · omitidas (sin código/nombre): ${omitidas}`);
  if (validas.length === 0) {
    console.log('Nada que sincronizar. Verifica el rango/hoja y las cabeceras.');
    return;
  }

  // upsert por lotes para no exceder límites de payload
  const LOTE = 500;
  let total = 0;
  for (let i = 0; i < validas.length; i += LOTE) {
    const lote = validas.slice(i, i + LOTE);
    const { error, count } = await supabase
      .from('centros_escolares')
      .upsert(lote, { onConflict: 'codigo', count: 'exact' });
    if (error) throw new Error(`Error al sincronizar lote ${i / LOTE + 1}: ${error.message}`);
    total += lote.length;
    console.log(`Lote ${Math.floor(i / LOTE) + 1}: ${lote.length} centro(s) sincronizado(s).`);
  }

  console.log(`Listo. ${total} centro(s) actualizados en Supabase.`);
  if (omitidas > 0) {
    console.warn(`Aviso: ${omitidas} fila(s) del Sheet se omitieron por faltar código o nombre.`);
  }
}

sincronizar().catch(err => {
  console.error('Error en la sincronización:', err.message);
  process.exit(1);
});
