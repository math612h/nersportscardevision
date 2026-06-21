import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKETS = [
  "track-images",
  "avatars",
  "league-banners",
  "team-logos",
  "news-images",
  "division-replays",
] as const;
type Bucket = (typeof BUCKETS)[number];

async function ensureAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Kun admins");
}

export const listBuckets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    return BUCKETS as unknown as string[];
  });

export const listBucketObjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      bucket: z.enum(BUCKETS),
      prefix: z.string().default(""),
      search: z.string().optional(),
      limit: z.number().int().min(1).max(200).default(100),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: items, error } = await supabaseAdmin.storage
      .from(data.bucket)
      .list(data.prefix, {
        limit: data.limit,
        sortBy: { column: "updated_at", order: "desc" },
        search: data.search || undefined,
      });
    if (error) throw error;

    // Sign URLs for files (not folders)
    const files = (items ?? []).filter((i: any) => i.id !== null);
    const folders = (items ?? []).filter((i: any) => i.id === null);
    const paths = files.map((f: any) => (data.prefix ? `${data.prefix}/${f.name}` : f.name));
    let urls: Record<string, string> = {};
    if (paths.length > 0) {
      const { data: signed } = await supabaseAdmin.storage
        .from(data.bucket)
        .createSignedUrls(paths, 60 * 60);
      (signed ?? []).forEach((s: any, i: number) => {
        if (s.signedUrl) urls[paths[i]] = s.signedUrl;
      });
    }
    return {
      folders: folders.map((f: any) => f.name),
      files: files.map((f: any) => ({
        name: f.name,
        path: data.prefix ? `${data.prefix}/${f.name}` : f.name,
        size: f.metadata?.size ?? 0,
        contentType: f.metadata?.mimetype ?? null,
        updatedAt: f.updated_at,
        url: urls[data.prefix ? `${data.prefix}/${f.name}` : f.name] ?? null,
      })),
    };
  });

export const replaceBucketObject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      bucket: z.enum(BUCKETS),
      path: z.string().min(1),
      base64: z.string().min(1),
      contentType: z.string().min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const buf = Buffer.from(data.base64, "base64");
    const { error } = await supabaseAdmin.storage
      .from(data.bucket)
      .upload(data.path, buf, { contentType: data.contentType, upsert: true });
    if (error) throw error;
    await context.supabase.rpc("log_audit" as any, {
      _action: "storage_replace",
      _table: "storage.objects",
      _row_id: `${data.bucket}/${data.path}`,
      _metadata: { size: buf.length, contentType: data.contentType } as any,
    });
    return { ok: true };
  });
