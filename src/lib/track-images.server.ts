import { normalizeTrackName, trackImageSlug } from "@/lib/tracks";

// 1x1 dark PNG used as a placeholder until an admin uploads a real track image.
const PLACEHOLDER_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/**
 * Ensures every discovered track has an entry in the `track-images` bucket so
 * admins can assign a picture to newly released tracks without a code change.
 */
export async function ensureTrackImagePlaceholders(tracks: string[]): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const slugs = Array.from(
    new Set(
      tracks
        .map((t) => trackImageSlug(normalizeTrackName(t)))
        .filter((s): s is string => !!s),
    ),
  );
  if (slugs.length === 0) return [];

  const { data: existing } = await supabaseAdmin.storage.from("track-images").list("", { limit: 1000 });
  const have = new Set((existing ?? []).map((f: { name: string }) => f.name.toLowerCase()));

  const created: string[] = [];
  const buf = Buffer.from(PLACEHOLDER_PNG_BASE64, "base64");
  for (const slug of slugs) {
    if (["png", "jpg", "jpeg", "webp"].some((ext) => have.has(`${slug}.${ext}`))) continue;
    const { error } = await supabaseAdmin.storage
      .from("track-images")
      .upload(`${slug}.png`, buf, { contentType: "image/png", upsert: false });
    if (!error) created.push(`${slug}.png`);
  }
  return created;
}
