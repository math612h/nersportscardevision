import { createFileRoute } from "@tanstack/react-router";
import { readFile } from "fs/promises";

export const Route = createFileRoute("/api/public/download/companion")({
  server: {
    handlers: {
      GET: async () => {
        const filePath = "/mnt/documents/NER-Sportscar-Companion-Windows.zip";
        try {
          const buffer = await readFile(filePath);
          return new Response(buffer, {
            status: 200,
            headers: {
              "Content-Type": "application/zip",
              "Content-Disposition": 'attachment; filename="NER-Sportscar-Companion-Windows.zip"',
            },
          });
        } catch {
          return new Response("File not found", { status: 404 });
        }
      },
    },
  },
});
