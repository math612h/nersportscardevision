import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { GuestLock } from "@/components/GuestGate";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

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

function Rules() {
  const { leagueId } = useParams({ from: "/ligaer/$leagueId/regler" });
  const { leagueName } = Route.useLoaderData();
  const { user, loading: authLoading } = useAuth();


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

