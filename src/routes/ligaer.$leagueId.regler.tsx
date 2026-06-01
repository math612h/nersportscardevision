import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const Route = createFileRoute("/ligaer/$leagueId/regler")({
  component: Rules,
});

function Rules() {
  const { leagueId } = useParams({ from: "/ligaer/$leagueId/regler" });
  const { data: rules } = useQuery({
    queryKey: ["rules", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rulesets").select("*").eq("league_id", leagueId).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-4">
      <Link to="/ligaer/$leagueId" params={{ leagueId }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Tilbage til liga
      </Link>
      <h1 className="text-2xl font-bold">Regelsæt</h1>
      {rules?.length === 0 && <p className="text-muted-foreground">Ingen regler oprettet endnu.</p>}
      <Accordion type="multiple" className="w-full">
        {rules?.map((r) => (
          <AccordionItem key={r.id} value={r.id}>
            <AccordionTrigger className="text-left">{r.title}</AccordionTrigger>
            <AccordionContent className="whitespace-pre-wrap">{r.content}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
