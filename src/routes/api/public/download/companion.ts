import { createFileRoute } from "@tanstack/react-router";
import companionZipAsset from "@/assets/companion-zip.asset.json";

export const Route = createFileRoute("/api/public/download/companion")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(null, {
          status: 302,
          headers: {
            Location: (companionZipAsset as { url: string }).url,
          },
        });
      },
    },
  },
});
