// Server-only helper used by other server fns to fetch a message template body.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type StoredTemplate = {
  id: string;
  key: string;
  title: string;
  body: string;
  default_channel_id: string | null;
};

export async function getTemplateByKey(key: string): Promise<StoredTemplate | null> {
  const { data, error } = await supabaseAdmin
    .from("message_templates")
    .select("id, key, title, body, default_channel_id")
    .eq("key", key)
    .maybeSingle();
  if (error) return null;
  return (data ?? null) as StoredTemplate | null;
}
