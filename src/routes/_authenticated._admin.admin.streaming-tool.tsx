import { createFileRoute } from "@tanstack/react-router";
import { Radio, ExternalLink, MonitorPlay, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const STREAMING_TOOL_URL = "https://broadcast.lmudanmark.dk";

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
            <Radio className="h-4 w-4 text-primary" /> LMU Danmarks streamingværktøj
          </CardTitle>
          <CardDescription>
            Streamingværktøjet er et separat system, der bruges til at styre overlays og grafik på
            live streamen LMU Danmark på YouTube og Twitch. Det åbner i en ny fane.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button asChild size="lg" className="gap-2">
            <a href={STREAMING_TOOL_URL} target="_blank" rel="noopener noreferrer">
              Åbn streamingværktøj
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>

          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Bemærk: Subdomænet <span className="font-medium text-foreground">broadcast.lmudanmark.dk</span>{" "}
              er under opsætning. Hvis knappen endnu ikke virker, er værktøjet ikke aktivt endnu –
              prøv igen senere.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
