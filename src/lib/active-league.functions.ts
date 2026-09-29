import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type ActiveLeague = { id: string; name: string } | null;

/** Den aktive liga: nyeste offentlige liga, som ikke er sat til offseason. */
export const getActiveLeague = createServerFn({ method: "GET" }).handler(
  async (): Promise<ActiveLeague> => {
    const key =
      process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
    const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
    if (!key || !url) return null;
    const client = createClient<Database>(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
            h.delete("Authorization");
          }
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data } = await client
      .from("leagues")
      .select("id, name")
      .eq("published", true)
      .eq("is_offseason", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? { id: data.id, name: data.name } : null;
  },
);
