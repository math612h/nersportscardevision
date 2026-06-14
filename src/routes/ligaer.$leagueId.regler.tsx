import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { acknowledgeLeagueRules } from "@/lib/league-rules.functions";

export const Route = createFileRoute("/ligaer/$leagueId/regler")({
  component: Rules,
  loader: async ({ params }) => {
    const { data } = await supabase
      .from("leagues")
      .select("name")
      .eq("id", params.leagueId)
      .maybeSingle();
    return { leagueName: (data?.name as string | undefined) ?? null };
  },
  head: ({ params, loaderData }) => {
    const name = loaderData?.leagueName ?? "ligaen";
    const title = `Regelsæt for ${name} — LMU Danmark`;
    const desc = `Det fulde regelsæt for ${name} i LMU Danmark: sportslige, tekniske og adfærdsmæssige regler.`;
    const url = `https://danishenduranceseries.dk/ligaer/${params.leagueId}/regler`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:url", content: url },
        { property: "og:type", content: "article" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
});

function AckPanel({ leagueId }: { leagueId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const ackFn = useServerFn(acknowledgeLeagueRules);

  const { data: ack } = useQuery({
    queryKey: ["rules-ack", leagueId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("league_rules_acknowledgements")
        .select("acknowledged_at")
        .eq("league_id", leagueId)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (!user) return null;
  const acked = !!ack;

  const onToggle = async (val: boolean) => {
    if (!val || acked) return;
    try {
      const res = await ackFn({ data: { leagueId } });
      qc.invalidateQueries({ queryKey: ["rules-ack", leagueId, user.id] });
      qc.invalidateQueries({ queryKey: ["my-entry", leagueId, user.id] });
      qc.invalidateQueries({ queryKey: ["league-signups", leagueId] });
      if (res.promoted) {
        toast.success("Tak! Du er nu rykket op på griddet.");
      } else {
        toast.success("Tak – din bekræftelse er gemt.");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke gemme din bekræftelse.");
    }
  };

  return (
    <div
      className={`flex items-start gap-3 rounded-md border p-3 ${
        acked ? "border-primary/40 bg-primary/5" : "border-dashed border-border bg-muted/40"
      }`}
    >
      <Checkbox
        id="rules-ack"
        checked={acked}
        disabled={acked}
        onCheckedChange={(v) => onToggle(!!v)}
        className="mt-0.5"
      />
      <label htmlFor="rules-ack" className="flex-1 cursor-pointer text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          Jeg har læst og forstået reglementet
          {acked && <CheckCircle2 className="h-4 w-4 text-primary" />}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {acked
            ? "Tak – du opfylder kravet for at stå på griddet (sammen med godkendt profil)."
            : "Du skal bekræfte dette for at kunne stå på griddet i denne liga. Uden bekræftelse forbliver du på ventelisten."}
        </span>
      </label>
    </div>
  );
}

function Rules() {
  const { leagueId } = useParams({ from: "/ligaer/$leagueId/regler" });
  const { leagueName } = Route.useLoaderData();

  const { data: rules } = useQuery({
    queryKey: ["rules", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rulesets")
        .select("*")
        .eq("league_id", leagueId)
        .order("section_number", { ascending: true, nullsFirst: false })
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const grouped = (rules ?? []).reduce<Record<string, any[]>>((acc, r: any) => {
    const main = r.section_number ? String(r.section_number).split(".")[0] : "—";
    (acc[main] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <Link to="/ligaer/$leagueId" params={{ leagueId }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" aria-hidden="true" /> Tilbage til liga
      </Link>
      <h1 className="text-2xl font-bold">
        Regelsæt {leagueName ? `– ${leagueName}` : ""}
      </h1>
      <AckPanel leagueId={leagueId} />
      {rules?.length === 0 && <p className="text-muted-foreground">Ingen regler oprettet endnu.</p>}
      <div className="space-y-6">
        {Object.entries(grouped).map(([main, list]) => (
          <div key={main}>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sektion {main}</h2>
            <Accordion type="multiple" className="w-full">
              {list.map((r) => (
                <AccordionItem key={r.id} value={r.id}>
                  <AccordionTrigger className="text-left">
                    {r.section_number && <span className="mr-2 text-muted-foreground">{r.section_number}</span>}
                    {r.title}
                  </AccordionTrigger>
                  <AccordionContent className="whitespace-pre-wrap">{r.content}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ))}
      </div>
    </div>
  );
}
