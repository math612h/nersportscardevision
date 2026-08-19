import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeTrackName, trackImageSlug } from "@/lib/tracks";

const schema = z.object({
  tracks: z.array(z.string().min(1)).max(50),
});

// 1x1 dark PNG used as a placeholder until an admin uploads a real track image.
const PLACEHOLDER_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/**
 * Ensures every discovered track has an entry in the `track-images` bucket so
 * admins can assign a picture to newly released tracks without any code change.
 */
export const ensureTrackImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data }): Promise<{ created: string[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const slugs = Array.from(
      new Set(
        data.tracks
          .map((t) => trackImageSlug(normalizeTrackName(t)))
          .filter((s): s is string => !!s),
      ),
    );
    if (slugs.length === 0) return { created: [] };

    const { data: existing } = await supabaseAdmin.storage.from("track-images").list("", { limit: 1000 });
    const have = new Set((existing ?? []).map((f: { name: string }) => f.name.toLowerCase()));

    const created: string[] = [];
    const buf = Buffer.from(PLACEHOLDER_PNG_BASE64, "base64");
    for (const slug of slugs) {
      // Any existing file that starts with the slug (e.g. spa.png / spa.jpg) counts
      const hit = Array.from(have).some((n) => n === `${slug}.png` || n === `${slug}.jpg` || n === `${slug}.jpeg` || n === `${slug}.webp`);
      if (hit) continue;
      const { error } = await supabaseAdmin.storage
        .from("track-images")
        .upload(`${slug}.png`, buf, { contentType: "image/png", upsert: false });
      if (!error) created.push(`${slug}.png`);
    }
    return { created };
  });
