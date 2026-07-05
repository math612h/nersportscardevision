import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Search, X, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { compareSectionNumbers } from "@/lib/rules-renumber";

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

  const { data: sections } = useQuery({
    queryKey: ["ruleset-sections", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ruleset_sections" as any)
        .select("*")
        .eq("league_id", leagueId)
        .order("sort_order")
        .order("section_number");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return rules ?? [];
    return (rules ?? []).filter((r: any) =>
      [r.title, r.content, r.section_number].some((f) => (f ?? "").toString().toLowerCase().includes(q)),
    );
  }, [rules, q]);

  const grouped = filtered.reduce<Record<string, any[]>>((acc, r: any) => {
    const main = r.section_number ? String(r.section_number).split(".")[0] : "—";
    (acc[main] ??= []).push(r);
    return acc;
  }, {});
  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a: any, b: any) => compareSectionNumbers(a.section_number, b.section_number));
  }

  const sectionTitle = (main: string) => {
    const s = sections?.find((x) => String(x.section_number) === main);
    return s?.title as string | undefined;
  };

  // Merge: include sections with no rules too, and sort by section_number numerically
  const orderedKeys = Array.from(
    new Set<string>([
      ...(sections ?? []).map((s) => String(s.section_number)),
      ...Object.keys(grouped),
    ]),
  ).sort((a, b) => {
    const na = parseFloat(a); const nb = parseFloat(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  }).filter((k) => (grouped[k]?.length ?? 0) > 0 || !q); // hide empty sections while searching

  const highlight = (text: string) => {
    if (!q || !text) return text;
    const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return parts.map((p, i) =>
      p.toLowerCase() === q ? (
        <mark key={i} className="rounded bg-primary/30 px-0.5 text-foreground">{p}</mark>
      ) : (
        <span key={i}>{p}</span>
      ),
    );
  };

  // Regelsæt er offentligt tilgængeligt.

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        to="/ligaer/$leagueId"
        params={{ leagueId }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden="true" /> Tilbage til liga
      </Link>

      <div className="flex items-start gap-4 rounded-2xl border bg-gradient-to-br from-primary/5 to-transparent p-6">
        <div className="rounded-xl bg-primary/10 p-3">
          <BookOpen className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Regelsæt</h1>
          {leagueName && <p className="text-sm text-muted-foreground">{leagueName}</p>}
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Søg i regelsættet…"
          className="h-11 pl-9 pr-9"
        />
        {query && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
            onClick={() => setQuery("")}
            aria-label="Ryd søgning"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {rules?.length === 0 && <p className="text-muted-foreground">Ingen regler oprettet endnu.</p>}
      {rules && rules.length > 0 && orderedKeys.length === 0 && q && (
        <p className="text-sm text-muted-foreground">Ingen regler matcher "{query}".</p>
      )}
      {q && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} resultat{filtered.length === 1 ? "" : "er"}
        </p>
      )}

      <Accordion
        type="multiple"
        className="space-y-2"
        value={q ? orderedKeys.map((k) => `sec-${k}`) : undefined}
      >
        {orderedKeys.map((main) => {
          const list = grouped[main] ?? [];
          const title = sectionTitle(main);
          return (
            <AccordionItem
              key={main}
              value={`sec-${main}`}
              className="overflow-hidden rounded-xl border bg-card"
            >
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex flex-1 items-center gap-3 text-left">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
                    {main}
                  </span>
                  <span className="font-semibold">
                    {title ?? `Sektion ${main}`}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {list.length} {list.length === 1 ? "regel" : "regler"}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="border-t bg-muted/20 px-2 pb-2 pt-2">
                {list.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">Ingen regler i denne sektion endnu.</p>
                ) : (
                  <Accordion
                    type="multiple"
                    className="space-y-1"
                    value={q ? list.map((r) => r.id) : undefined}
                  >
                    {list.map((r) => (
                      <AccordionItem
                        key={r.id}
                        value={r.id}
                        className="overflow-hidden rounded-lg border bg-background"
                      >
                        <AccordionTrigger className="px-3 py-2 text-left text-sm hover:no-underline">
                          <span className="flex items-center gap-2">
                            {r.section_number && (
                              <span className="text-xs text-muted-foreground">{r.section_number}</span>
                            )}
                            <span className="font-medium">{highlight(r.title)}</span>
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="whitespace-pre-wrap px-3 pb-3 text-sm leading-relaxed text-muted-foreground">
                          {highlight(r.content)}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
