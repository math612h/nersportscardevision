import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export type LiveStatus = {
  isLive: boolean;
  videoId: string | null;
  title: string | null;
  startedAt: string | null;
  lastVideoId: string | null;
  lastTitle: string | null;
  manualVideoId: string | null;
  manualTitle: string | null;
  manualEnabled: boolean;
};

const EMPTY_STATUS: LiveStatus = {
  isLive: false,
  videoId: null,
  title: null,
  startedAt: null,
  lastVideoId: null,
  lastTitle: null,
  manualVideoId: null,
  manualTitle: null,
  manualEnabled: false,
};

export const getLiveStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<LiveStatus> => {
    const key =
      process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
    const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
    if (!key || !url) return EMPTY_STATUS;

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
      .select(
        "is_live, video_id, title, started_at, last_video_id, last_title, manual_video_id, manual_title, manual_enabled",
      )
      .eq("platform", "youtube")
      .maybeSingle();

    return {
      isLive: Boolean(data?.is_live),
      videoId: data?.video_id ?? null,
      title: data?.title ?? null,
      startedAt: data?.started_at ?? null,
      lastVideoId: data?.last_video_id ?? null,
      lastTitle: data?.last_title ?? null,
      manualVideoId: data?.manual_video_id ?? null,
      manualTitle: data?.manual_title ?? null,
      manualEnabled: Boolean(data?.manual_enabled),
    };
  },
);

/** Udleder et YouTube-video-ID fra watch-, youtu.be-, shorts- eller live-URL'er. */
export function parseYoutubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const v = url.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      const m = url.pathname.match(/^\/(?:live|shorts|embed)\/([a-zA-Z0-9_-]{11})/);
      if (m) return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
  if (!isAdmin) throw new Error("Kun admins kan ændre stream-linket.");
}

export const setManualStreamLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        url: z.string().trim().max(500),
        title: z.string().trim().max(300).optional(),
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let videoId: string | null = null;
    if (data.enabled || data.url) {
      videoId = parseYoutubeVideoId(data.url);
      if (!videoId) {
        throw new Error(
          "Kunne ikke genkende et YouTube-link. Brug fx https://www.youtube.com/watch?v=… eller https://youtu.be/…",
        );
      }
    }

    const payload = data.enabled
      ? { manual_video_id: videoId, manual_title: data.title || null, manual_enabled: true }
      : { manual_video_id: null, manual_title: null, manual_enabled: false };

    const { error } = await supabaseAdmin
      .from("broadcast_live_state")
      .update(payload)
      .eq("platform", "youtube");
    if (error) throw new Error(error.message);
    return { ok: true, videoId };
  });
