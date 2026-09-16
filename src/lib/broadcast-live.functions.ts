import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type LiveStatus = {
  isLive: boolean;
  videoId: string | null;
  title: string | null;
  startedAt: string | null;
};

export const getLiveStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<LiveStatus> => {
    const key =
      process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
    const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
    if (!key || !url) return { isLive: false, videoId: null, title: null, startedAt: null };

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
      .from("broadcast_live_state")
      .select("is_live, video_id, title, started_at")
      .eq("platform", "youtube")
      .maybeSingle();

    return {
      isLive: Boolean(data?.is_live),
      videoId: data?.video_id ?? null,
      title: data?.title ?? null,
      startedAt: data?.started_at ?? null,
    };
  },
);
