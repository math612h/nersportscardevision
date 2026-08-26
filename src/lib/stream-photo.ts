import { supabase } from "@/integrations/supabase/client";

export const STREAM_PHOTO_BUCKET = "stream-photos";

/** Signeret URL til et uploadet streambillede (1 døgn). */
export async function signStreamPhotoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage
    .from(STREAM_PHOTO_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24);
  return data?.signedUrl ?? null;
}
