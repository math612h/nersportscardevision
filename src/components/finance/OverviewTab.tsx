import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getFinanceOverview } from "@/lib/finance/finance.functions";
import { dkk, StatusBadge } from "./shared";
import { AlertTriangle } from "lucide-react";

export function useOverview() {
  const fn = useServerFn(getFinanceOverview);
  return useQuery({ queryKey: ["fin", "overview"], queryFn: () => fn() });
}

export function OverviewTab({ go }: { go: (tab: string) => void }) {
  const { data, isLoading, error } = useOverview();
  if (isLoading) return <p className="text-muted-foreground">Indlæser…</p>;
  if (error) return <p className="text-destructive">{(error as Error).message}</p>;
  if (!data) return null;
  const s: any = data.settings ?? {};
  const t = data.tasks;
  const lastExternal = (data.backups as any[]).find((b) => b.kind === "external" && b.status === "succeeded");
  const tasks: [string, number, string][] = [
    ["Poster der kræver kontrol", t.review, "journal"],
    ["Kladder der ikke er bogført", t.drafts, "journal"],
    ["Uafstemte bankbevægelser", t.unmatched, "bank"],
    ["Mulige dubletter i bank", t.dupes, "bank"],
    ["Fakturaer uden bilag", t.billsNoDoc, "udgifter"],
    ["Udlæg der venter på godkendelse", t.claimsPending, "udlaeg"],
    ["Synkroniseringsfejl", t.syncErrors, "stripe"],
    ["Stripe-events der ikke er behandlet", t.pendingEvents, "stripe"],
  ];
  const openingsPosted = (data.openings as any[]).every((o) => o.status === "posted");
  const b = data.balances as Record<string, number>;
  return (
    <div className="space-y-4">
      {!lastExternal && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Ekstern backup mangler</AlertTitle>
          <AlertDescription>Der er ikke sat en ekstern backup op. Hent en samlet eksport under fanen Backup, og gem den uden for systemet.</AlertDescription>
        </Alert>
      )}
      {!s.auto_posting_enabled && (
        <Alert>
          <AlertTitle>Automatisk bogføring er slået fra</AlertTitle>
          <AlertDescription>
            Stripe-bevægelser lægges som kladder. Slå automatisk bogføring til under Opsætning, når skæringspunkt, regler og åbningsposter er godkendt.
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge ok={!!s.cutoff_approved_at}>Skæringspunkt {s.cutoff_approved_at ? "godkendt" : "mangler"}</StatusBadge>
              <StatusBadge ok={!!s.rules_approved_at}>Regler {s.rules_approved_at ? "godkendt" : "mangler"}</StatusBadge>
              <StatusBadge ok={openingsPosted}>Åbningsposter {openingsPosted ? "bogført" : "mangler"}</StatusBadge>
              <StatusBadge ok={s.vat_confirmed_at ? true : "warn"}>Moms/skat {s.vat_confirmed_at ? "afklaret" : "ikke afklaret"}</StatusBadge>
            </div>
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Opgaver</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {tasks.map(([label, n, tab]) => (
              <button key={label} onClick={() => go(tab)} className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-muted">
                <span>{label}</span><StatusBadge ok={n === 0}>{n}</StatusBadge>
              </button>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Beholdninger (bogført)</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {[["1000", "Bank"], ["1010", "Stripe-beholdning"], ["1020", "Overførsler undervejs"], ["2000", "Leverandørgæld"], ["2100", "Gæld til udlægshavere"]].map(([c, n]) => (
              <div key={c} className="flex justify-between"><span>{n}</span><span className="tabular-nums">{dkk(c.startsWith("2") ? -(b[c] ?? 0) : b[c] ?? 0)}</span></div>
            ))}
            <p className="pt-2 text-xs text-muted-foreground">Kun bogførte poster. Afstemning mod Stripe og kontoudtog findes under Rapporter.</p>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base">Seneste synkronisering</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {(data.syncState as any[]).length === 0 ? <p className="text-muted-foreground">Stripe er endnu ikke synkroniseret.</p> : (
              <ul className="space-y-1">{(data.syncState as any[]).map((r) => (
                <li key={r.environment + r.object_type}>{r.environment === "live" ? "Live" : "Test"} · {r.object_type === "balance_transaction_history" ? "Historik" : "Seneste 35 dage"}: {r.last_success_at ? new Date(r.last_success_at).toLocaleString("da-DK") : "aldrig"}{r.completed ? " (fuldført)" : ""}{r.last_error ? <span className="text-destructive"> · Fejl: {r.last_error}</span> : null}</li>
              ))}</ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
