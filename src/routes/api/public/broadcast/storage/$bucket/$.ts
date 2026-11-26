import { createFileRoute } from "@tanstack/react-router";

// Permanent, ikke-udløbende billed-URL'er til broadcast-kontrolpanelet.
// Proxyer privat storage via admin-klienten så URL'en aldrig udløber.
export const Route = createFileRoute("/api/public/broadcast/storage/$bucket/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const bucket = params.bucket ?? "";
        const path = (params as any)._splat ?? "";
        const allowed = new Set(["stream-photos", "avatars", "sponsor-images"]);
        if (!allowed.has(bucket) || !path || path.includes("..")) {
          return new Response("Not found", { status: 404 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        if (bucket === "stream-photos") {
          // Only serve stream photos that a driver has actively set on their profile.
          const { data: owner } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("stream_photo_path", path)
            .limit(1)
            .maybeSingle();
          if (!owner) return new Response("Not found", { status: 404 });
        }
        const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
        if (error || !data) return new Response("Not found", { status: 404 });

        const ext = path.split(".").pop()?.toLowerCase() ?? "";
        const contentType =
          data.type ||
          (ext === "png" ? "image/png"
            : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
            : ext === "webp" ? "image/webp"
            : ext === "gif" ? "image/gif"
            : ext === "svg" ? "image/svg+xml"
            : "application/octet-stream");

        return new Response(data, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" },
        }),
    },
  },
});
