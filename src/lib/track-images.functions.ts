import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  tracks: z.array(z.string().min(1)).max(50),
});

/**
 * Registrerer nye baner i `track-images`-bucketen, så en admin kan tildele et
 * billede til baner der først dukker op i resultatfilerne.
 */
export const ensureTrackImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data }): Promise<{ created: string[] }> => {
    const { ensureTrackImagePlaceholders } = await import("@/lib/track-images.server");
    return { created: await ensureTrackImagePlaceholders(data.tracks) };
  });
