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
  const ruled = p.status === "ruled";
  return (
    <CardHeader className="space-y-2 pb-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
            {p.divisions?.leagues?.name ?? "Liga"}
          </p>
          <CardTitle className="text-base">{p.divisions?.name ?? "Afdeling"}</CardTitle>
          <CardDescription className="text-xs">{format(new Date(p.created_at), "dd MMM yyyy HH:mm")}</CardDescription>
        </div>
        {ruled ? (
          <Badge className="shrink-0">Afgjort</Badge>
        ) : (
          <Badge variant="secondary" className="shrink-0">Åben</Badge>
        )}
      </div>
      {(p.lap_number != null || p.corner) && (
        <div className="flex flex-wrap gap-1">
          {p.lap_number != null && <Badge variant="outline" className="text-[10px]">Omg. {p.lap_number}</Badge>}
          {p.corner && <Badge variant="outline" className="text-[10px]">{p.corner}</Badge>}
        </div>
      )}
    </CardHeader>
  );
}

function VerdictBlock({ p }: { p: any }) {
  if (p.status !== "ruled") return null;
  const details = (p.verdict_details ?? {}) as Record<string, any>;
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
      <div className="mb-1.5 flex items-center gap-2">
        <Gavel className="h-4 w-4 text-primary" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Afgørelse</span>
        <Badge className="ml-auto">{OUTCOME_LABEL[p.verdict_outcome] ?? p.verdict_outcome}</Badge>
      </div>
      {(p.verdict_outcome === "time_penalty" && details.seconds != null) && (
        <p className="text-xs text-muted-foreground">+{details.seconds} sek.</p>
      )}
      {(p.verdict_outcome === "position_penalty" && details.positions != null) && (
        <p className="text-xs text-muted-foreground">–{details.positions} placering(er)</p>
      )}
      {p.verdict_reason && <p className="mt-2 whitespace-pre-wrap">{p.verdict_reason}</p>}
      {p.ruled_at && <p className="mt-2 text-xs text-muted-foreground">Afgjort {format(new Date(p.ruled_at), "dd MMM yyyy HH:mm")}</p>}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </p>
  );
}

function SubmittedCard({ protest }: { protest: any }) {
  const involved = protest.protest_involved ?? [];
  return (
    <Card>
      <ProtestHeader p={protest} />
      <CardContent className="space-y-4 border-t border-border pt-4 text-sm">
        {protest.involved_drivers && (
          <div className="space-y-1">
            <SectionLabel>Indklaget</SectionLabel>
            <p>{protest.involved_drivers}</p>
          </div>
        )}

        <div className="space-y-1">
          <SectionLabel>Din beskrivelse</SectionLabel>
          <p className="whitespace-pre-wrap">{protest.description}</p>
          {protest.video_url && (
            <a href={protest.video_url} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-primary underline">
              Se video
            </a>
          )}
        </div>

        <div className="space-y-2">
          <SectionLabel>Svar fra indklagede</SectionLabel>
          {involved.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">Ingen indklagede koblet.</p>
          ) : (
            <ul className="space-y-2">
              {involved.map((r: any) => (
                <li key={r.id} className="rounded-lg border border-border bg-muted/30 p-3">
                  <UserAvatar userId={r.user_id} name={r.driver_name} size="xs" />
                  {r.response ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm">{r.response}</p>
                  ) : (
                    <p className="mt-2 text-xs italic text-muted-foreground">Har endnu ikke svaret</p>
                  )}
                </li>
              ))}
            </ul>
          )}
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
      <CardContent className="space-y-4 border-t border-border pt-4 text-sm">
        <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3">
          <SectionLabel>Klager beskriver</SectionLabel>
          <p className="whitespace-pre-wrap">{p.description}</p>
          {p.video_url && (
            <a href={p.video_url} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-primary underline">
              Se video
            </a>
          )}
        </div>

        <div className="space-y-2">
          <SectionLabel>Din version af hændelsen</SectionLabel>
          <Textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            rows={4}
            maxLength={2000}
            disabled={locked}
            placeholder="Uddyb hændelsen fra din synsvinkel…"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            {!locked ? (
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                {row.response ? "Opdater svar" : "Send svar"}
              </Button>
            ) : <span />}
            {row.responded_at && (
              <p className="text-xs text-muted-foreground">
                Sidst opdateret {format(new Date(row.responded_at), "dd MMM yyyy HH:mm")}
              </p>
            )}
          </div>
        </div>

        <VerdictBlock p={p} />
      </CardContent>
    </Card>
  );
}

