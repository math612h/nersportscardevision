import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GUEST_EMAIL_DOMAIN = "guests.lmudanmark.dk";

function randomCode(): string {
  // 12-tegns alfanumerisk (uden forvirrende tegn 0/O/1/I/l)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export const createGuestCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { label: string }) => {
    const label = (d?.label ?? "").trim();
    if (!label) throw new Error("Etiket er påkrævet");
    if (label.length > 80) throw new Error("Etiket må højst være 80 tegn");
    return { label };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const code = randomCode();
    const email = `guest-${code.toLowerCase()}@${GUEST_EMAIL_DOMAIN}`;

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: code,
      email_confirm: true,
      user_metadata: {
        display_name: `Gæst: ${data.label}`,
        is_guest: true,
      },
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "Kunne ikke oprette gæstebruger");
    const userId = created.user.id;

    // Sørg for at brugeren har gæst-rollen (ikke racer)
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "guest" });
    if (roleErr) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(roleErr.message);
    }

    // Markér profilen som godkendt så gæsten kan tilgå alt
    await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, display_name: `Gæst: ${data.label}`, approved: true, accepts_danish: true, media_consent: true });

    const { data: row, error: insErr } = await supabaseAdmin
      .from("guest_codes")
      .insert({ code, label: data.label, user_id: userId, created_by: context.userId })
      .select("*")
      .single();
    if (insErr) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(insErr.message);
    }
    return row;
  });

export const listGuestCodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("guest_codes")
      .select("id, code, label, user_id, created_by, created_at, last_used_at, revoked")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateGuestCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; label?: string; revoked?: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {};
    if (typeof data.label === "string") patch.label = data.label.trim();
    if (typeof data.revoked === "boolean") patch.revoked = data.revoked;
    const { error } = await supabaseAdmin.from("guest_codes").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteGuestCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("guest_codes")
      .select("user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (row?.user_id) {
      await supabaseAdmin.auth.admin.deleteUser(row.user_id);
    } else {
      await supabaseAdmin.from("guest_codes").delete().eq("id", data.id);
    }
    return { ok: true };
  });

/**
 * Public (unauthenticated) — bytter en gæstekode til den email, klienten kan
 * logge ind med (password = koden). Vi returnerer kun email, ikke andet.
 */
export const resolveGuestCode = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string }) => {
    const code = (d?.code ?? "").trim().toUpperCase();
    if (!code) throw new Error("Indtast en kode");
    return { code };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("guest_codes")
      .select("id, user_id, revoked")
      .eq("code", data.code)
      .maybeSingle();
    if (!row || row.revoked) throw new Error("Ukendt eller spærret kode");

    const { data: user, error: uErr } = await supabaseAdmin.auth.admin.getUserById(row.user_id);
    if (uErr || !user.user?.email) throw new Error("Gæstebrugeren findes ikke længere");

    await supabaseAdmin.from("guest_codes").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
    return { email: user.user.email };
  });
