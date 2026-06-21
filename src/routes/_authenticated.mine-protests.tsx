import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Gavel, Inbox, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { UserAvatar } from "@/components/UserAvatar";

export const Route = createFileRoute("/_authenticated/mine-protests")({
  component: MyProtests,
});

const OUTCOME_LABEL: Record<string, string> = {
  no_penalty: "Ingen straf",
  warning: "Advarsel",
  time_penalty: "Tidsstraf",
  position_penalty: "Placeringsstraf",
  disqualified: "Diskvalifikation",
};

function MyProtests() {
  const { user } = useAuth();
  const userId = user?.id;

  const { data: submitted } = useQuery({
    queryKey: ["my-protests-submitted", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("protests")
        .select("*, divisions(name, leagues(name)), protest_involved(*)")
        .eq("submitted_by", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: againstMe } = useQuery({
    queryKey: ["my-protests-against", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: inv, error } = await supabase
        .from("protest_involved")
        .select("*, protests(*, divisions(name, leagues(name)))")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return inv ?? [];
    },
  });

  const pendingCount = (againstMe ?? []).filter((r: any) => !r.response && r.protests?.status !== "ruled").length;
  const submittedCount = submitted?.length ?? 0;
  const againstCount = againstMe?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <header className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="relative overflow-hidden bg-gradient-to-br from-primary/25 via-primary/5 to-transparent px-4 py-6 sm:px-6 sm:py-8">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Gavel className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                Stewards
              </p>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Mine sager</h1>
              <p className="text-sm text-muted-foreground">
                Dine indsendte protester og sager hvor du er indklaget.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border bg-muted/30 px-4 py-2.5 text-xs sm:px-6">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Send className="h-3.5 w-3.5 text-primary" />
            {submittedCount} indsendt
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Inbox className="h-3.5 w-3.5" />
            {againstCount} indklaget
          </span>
          {pendingCount > 0 && (
            <Badge variant="destructive" className="ml-auto">{pendingCount} svar mangler</Badge>
          )}
        </div>
      </header>

      <Tabs defaultValue={pendingCount > 0 ? "against" : "submitted"}>
        <TabsList>
          <TabsTrigger value="submitted">Indsendt af mig ({submittedCount})</TabsTrigger>
          <TabsTrigger value="against">
            Indklaget ({againstCount})
            {pendingCount > 0 && <Badge variant="destructive" className="ml-2">{pendingCount}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="submitted" className="space-y-3">
          {submittedCount === 0 && <p className="text-sm text-muted-foreground">Du har ikke indsendt nogen protester.</p>}
          {submitted?.map((p: any) => <SubmittedCard key={p.id} protest={p} />)}
        </TabsContent>

        <TabsContent value="against" className="space-y-3">
          {againstCount === 0 && <p className="text-sm text-muted-foreground">Du er ikke indklaget i nogen sager.</p>}
          {againstMe?.map((row: any) => <AgainstMeCard key={row.id} row={row} />)}
        </TabsContent>
      </Tabs>
    </div>
  );
}


function ProtestHeader({ p }: { p: any }) {
  return (
    <CardHeader>
      <div className="flex items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">{p.divisions?.leagues?.name} · {p.divisions?.name}</CardTitle>
          <CardDescription>{format(new Date(p.created_at), "dd MMM yyyy HH:mm")}</CardDescription>
        </div>
        <div className="flex flex-wrap gap-1">
          {p.lap_number != null && <Badge variant="outline">Omg. {p.lap_number}</Badge>}
          {p.corner && <Badge variant="outline">{p.corner}</Badge>}
          {p.status === "ruled"
            ? <Badge>Afgjort</Badge>
            : <Badge variant="secondary">Åben</Badge>}
        </div>
      </div>
    </CardHeader>
  );
}

function VerdictBlock({ p }: { p: any }) {
  if (p.status !== "ruled") return null;
  const details = (p.verdict_details ?? {}) as Record<string, any>;
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
      <div className="mb-1 flex items-center gap-2">
        <span className="font-semibold">Afgørelse:</span>
        <Badge>{OUTCOME_LABEL[p.verdict_outcome] ?? p.verdict_outcome}</Badge>
        {p.verdict_outcome === "time_penalty" && details.seconds != null && (
          <span className="text-muted-foreground">+{details.seconds} sek.</span>
        )}
        {p.verdict_outcome === "position_penalty" && details.positions != null && (
          <span className="text-muted-foreground">–{details.positions} placering(er)</span>
        )}
      </div>
      {p.verdict_reason && <p className="whitespace-pre-wrap">{p.verdict_reason}</p>}
      {p.ruled_at && <p className="mt-1 text-xs text-muted-foreground">Afgjort {format(new Date(p.ruled_at), "dd MMM yyyy HH:mm")}</p>}
    </div>
  );
}

function SubmittedCard({ protest }: { protest: any }) {
  const involved = protest.protest_involved ?? [];
  return (
    <Card>
      <ProtestHeader p={protest} />
      <CardContent className="space-y-3 text-sm">
        {protest.involved_drivers && <p><span className="text-muted-foreground">Indklaget:</span> {protest.involved_drivers}</p>}
        <p className="whitespace-pre-wrap">{protest.description}</p>
        {protest.video_url && <a href={protest.video_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">Video</a>}

        <div>
          <p className="mb-1 font-semibold">Svar fra indklagede:</p>
          {involved.length === 0 && <p className="text-muted-foreground">Ingen indklagede koblet.</p>}
          <ul className="space-y-2">
            {involved.map((r: any) => (
              <li key={r.id} className="rounded border border-border p-2">
                <p className="text-xs font-medium"><UserAvatar userId={r.user_id} name={r.driver_name} size="xs" /></p>
                {r.response
                  ? <p className="mt-1 whitespace-pre-wrap">{r.response}</p>
                  : <p className="mt-1 text-xs italic text-muted-foreground">Har endnu ikke svaret</p>}
              </li>
            ))}
          </ul>
        </div>

        <VerdictBlock p={protest} />
      </CardContent>
    </Card>
  );
}

function AgainstMeCard({ row }: { row: any }) {
  const p = row.protests;
  const qc = useQueryClient();
  const [response, setResponse] = useState(row.response ?? "");
  const locked = p.status === "ruled";

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("protest_involved")
        .update({ response: response.trim() || null, responded_at: new Date().toISOString() })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dit svar er gemt");
      qc.invalidateQueries({ queryKey: ["my-protests-against"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <ProtestHeader p={p} />
      <CardContent className="space-y-3 text-sm">
        <div>
          <p className="text-muted-foreground">Klager beskriver:</p>
          <p className="whitespace-pre-wrap">{p.description}</p>
          {p.video_url && <a href={p.video_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">Video</a>}
        </div>

        <div>
          <p className="mb-1 font-semibold">Din version af hændelsen</p>
          <Textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            rows={4}
            maxLength={2000}
            disabled={locked}
            placeholder="Uddyb hændelsen fra din synsvinkel…"
          />
          {!locked && (
            <Button className="mt-2" size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
              {row.response ? "Opdater svar" : "Send svar"}
            </Button>
          )}
          {row.responded_at && <p className="mt-1 text-xs text-muted-foreground">Sidst opdateret {format(new Date(row.responded_at), "dd MMM yyyy HH:mm")}</p>}
        </div>

        <VerdictBlock p={p} />
      </CardContent>
    </Card>
  );
}
