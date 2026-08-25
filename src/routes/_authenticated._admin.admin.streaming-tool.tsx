import { createFileRoute } from "@tanstack/react-router";
import { Radio, Download, MonitorPlay, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const BROADCAST_DOWNLOAD_URL = "https://broadcast.lmudanmark.dk/download";

export const Route = createFileRoute("/_authenticated/_admin/admin/streaming-tool")({
  head: () => ({ meta: [{ title: "Streaming tool – Kontrolpanel" }] }),
  component: AdminStreamingTool,
});

function AdminStreamingTool() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <MonitorPlay className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Streaming tool</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary" /> LMU Danmarks broadcast-app
          </CardTitle>
          <CardDescription>
            Download broadcast-appen, som bruges til at styre overlays og grafik på LMU Danmarks
            live streams på YouTube og Twitch. Installér appen på den PC, der kører streamen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button asChild size="lg" className="gap-2">
            <a href={BROADCAST_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4" />
              Download LMU Danmark Broadcast App
            </a>
          </Button>

          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Bemærk: Hvis download-linket ikke virker, er broadcast-appen ikke aktiv endnu –
              prøv igen senere.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
