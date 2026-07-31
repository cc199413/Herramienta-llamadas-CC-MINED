// ============================================================================
// Edge Function: verificar-correo
// ----------------------------------------------------------------------------
// Se usa ANTES de iniciar sesión, en la pantalla "¿Olvidaste tu contraseña?".
// El cliente (navegador) no tiene sesión todavía, por lo que no puede
// consultar la tabla "profiles" (RLS lo bloquea). Esta función corre del lado
// del servidor con la Secret key (nunca expuesta al navegador) y responde
// ÚNICAMENTE con un booleano: si el correo pertenece o no a un usuario ya
// registrado. No revela nada más (ni nombre, ni rol, ni estado).
//
// Se despliega igual que "crear-usuario":
//   supabase functions deploy verificar-correo --no-verify-jwt
// (--no-verify-jwt porque quien llama aún NO tiene sesión).
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const email = (body.email || "").trim().toLowerCase();
    if (!email) return json({ error: "Falta el correo a verificar." }, 400);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const clienteAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // "profiles" guarda el correo (columna "email", agregada en migracion_email.sql).
    // Buscamos sin distinguir mayúsculas/minúsculas.
    const { data, error } = await clienteAdmin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .limit(1);

    if (error) return json({ error: error.message }, 500);

    return json({ existe: (data || []).length > 0 }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Error inesperado." }, 500);
  }
});

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
