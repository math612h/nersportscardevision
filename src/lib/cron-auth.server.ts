/**
 * Authenticates calls to privileged cron endpoints.
 *
 * Callers must send `x-cron-secret` with either the server-only CRON_SECRET
 * or the database-held cron token (used by pg_cron jobs). The publishable
 * key is public and is never accepted as authentication.
 */
export async function authorizeCron(request: Request): Promise<Response | null> {
  const header = request.headers.get("x-cron-secret")?.trim();
  if (!header || header.length < 32 || header.length > 256) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const envSecret = process.env.CRON_SECRET;
  if (envSecret && header === envSecret) return null;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).rpc("verify_cron_token", { _token: header });
    if (!error && data === true) return null;
  } catch (e) {
    console.error("cron auth check failed");
  }
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

/** Token for server code that triggers cron endpoints itself (admin "run now"). */
export async function getCronToken(): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).rpc("get_cron_token");
  if (error || typeof data !== "string" || !data) throw new Error("Cron-token mangler.");
  return data;
}
