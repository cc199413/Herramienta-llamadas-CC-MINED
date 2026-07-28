// ============================================================================
// Edge Function: crear-usuario
// ----------------------------------------------------------------------------
// Permite que un Administrador cree una cuenta ya activa (sin pasar por el
// flujo de "solicitar acceso"), tal como hace hoy el prototipo. Esto SOLO se
// puede hacer con la Secret key de Supabase, que nunca debe estar en el
// navegador — por eso vive aquí, en una función que corre del lado del
// servidor (Supabase la aloja por ti).
//
// Verifica dos cosas antes de crear a nadie:
//   1. Que quien llama tenga una sesión válida (su token de acceso).
//   2. Que el perfil de quien llama tenga rol = "Administrador".
// Si cualquiera de las dos falla, rechaza la solicitud.
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Falta la sesión (encabezado Authorization)." }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // Cliente "como el usuario que llama", solo para confirmar quién es y su rol.
    const clienteUsuario = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: errUsuario } = await clienteUsuario.auth.getUser();
    if (errUsuario || !user) {
      return json({ error: "Sesión inválida o expirada. Vuelve a iniciar sesión." }, 401);
    }

    const { data: perfilQueLlama, error: errPerfil } = await clienteUsuario
      .from("profiles").select("rol").eq("id", user.id).single();
    if (errPerfil || !perfilQueLlama || perfilQueLlama.rol !== "Administrador") {
      return json({ error: "Solo un Administrador puede crear usuarios directamente." }, 403);
    }

    const body = await req.json();
    const nombre = (body.nombre || "").trim();
    const email = (body.email || "").trim();
    const password = body.password || "";
    const rol = body.rol || "Agente";
    if (!nombre || !email || !password) {
      return json({ error: "Completa nombre, correo y contraseña." }, 400);
    }
    const ROLES_VALIDOS = ["Administrador", "Team leader", "Supervisor", "Agente"];
    if (!ROLES_VALIDOS.includes(rol)) {
      return json({ error: "Rol no válido." }, 400);
    }

    // Cliente con privilegios totales (Secret key) — SOLO existe aquí, en el servidor.
    const clienteAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: creado, error: errCrear } = await clienteAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // no exige que confirme el correo para poder entrar
      user_metadata: { nombre, rol },
    });
    if (errCrear) {
      const msg = /already registered|already exists/i.test(errCrear.message)
        ? "Ya existe un usuario con ese correo."
        : errCrear.message;
      return json({ error: msg }, 400);
    }

    // El disparador de la base ya creó el perfil en estado "pendiente";
    // aquí lo activamos de inmediato y marcamos que debe cambiar su
    // contraseña temporal en el primer ingreso.
    const { error: errActivar } = await clienteAdmin
      .from("profiles")
      .update({ estado: "activo", debe_cambiar_password: true })
      .eq("id", creado.user.id);
    if (errActivar) {
      return json({ error: "Usuario creado, pero no se pudo activar: " + errActivar.message }, 500);
    }

    return json({ ok: true, id: creado.user.id }, 200);
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
